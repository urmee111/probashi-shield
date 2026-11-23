const { createHash } = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { pool } = require('../db/pool');
const { inTransaction } = require('../db/transaction');
const { authenticate, requireRole, verifyResourceAccess, isRecordId } = require('../middleware/auth');
const { logAudit } = require('../services/auditLogger');
const {
  extractDocumentData, runCrossDocumentAudit, normalizeDocumentData, feeBand,
} = require('../services/forensicsEngine');
const { predictFraudRisk, clampMultiple } = require('../services/fraudRiskModel');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, parts: 4, fieldSize: 32 * 1024 },
}).single('file');
const documentTypes = new Set(['job_offer', 'offer_letter', 'receipt', 'demand_letter', 'contract', 'visa', 'other']);
const offerTypes = new Set(['job_offer', 'offer_letter']);
const auditType = 'document_forensics';
const ruleVersion = 'document-forensics-v1';
const documentFields = `id, worker_id, document_type AS doc_type, sha256 AS file_hash,
  extraction_method, extraction_status, extracted_data AS extracted_json,
  (extraction_status = 'needs_confirmation') AS needs_confirmation, created_at`;
const duplicateError = { error: 'Duplicate document detected for this worker.' };

const demoDocuments = [
  {
    docType: 'job_offer',
    manualData: {
      employer_name: 'Demo Malaysia Plantation Works',
      agency_name: 'Demo Padma Recruitment',
      agency_license: 'DEMO-RL-001',
      destination_country: 'Malaysia',
      job_title: 'Plantation/Factory',
      has_salary_clause: false,
      is_blurry_or_unclear: false,
    },
  },
  {
    docType: 'receipt',
    manualData: {
      agency_name: 'Demo Horizon Recruitment',
      agency_license: 'RL-9911',
      destination_country: 'Malaysia',
      job_title: 'Plantation/Factory',
      total_fee_bdt: 450000,
      is_blurry_or_unclear: false,
    },
  },
];

router.use(authenticate);

function parseUpload(req, res, next) {
  if (req.is('application/json')) return next();
  if (!req.is('multipart/form-data')) {
    return res.status(415).json({ error: 'Submit JSON or multipart form data.' });
  }
  return upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Document files must be 10 MB or smaller.' });
    }
    return res.status(400).json({ error: 'Submit one file and its document type as multipart form data.' });
  });
}

function hashDocument(data) {
  const content = Buffer.isBuffer(data)
    ? data
    : JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]])));
  return createHash('sha256').update(content).digest('hex');
}

async function findDocument(db, workerId, fileHash) {
  const { rows } = await db.query(
    `SELECT ${documentFields} FROM probashi_shield.documents WHERE worker_id = $1 AND sha256 = $2`,
    [workerId, fileHash],
  );
  return rows[0];
}

async function storeDocument(client, workerId, docType, fileHash, extraction, action) {
  const { extractionMethod, data, needsConfirmation } = extraction;
  const { rows } = await client.query(
    `INSERT INTO probashi_shield.documents
       (worker_id, document_type, sha256, extraction_method, extracted_data, extraction_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (worker_id, sha256) DO NOTHING
     RETURNING ${documentFields}`,
    [workerId, docType, fileHash, extractionMethod, JSON.stringify(data), needsConfirmation ? 'needs_confirmation' : 'confirmed'],
  );
  const [document] = rows;
  if (document) {
    await logAudit({
      actorId: workerId,
      targetUserId: workerId,
      action,
      entityType: 'document',
      entityId: document.id,
      details: { docType, extractionMethod, needsConfirmation },
    }, client);
  }
  return document;
}

function selectWorker(req, res, next) {
  const { workerId } = req.query;
  if (workerId === undefined && req.user.role !== 'worker') {
    return res.status(400).json({ error: 'Supply a workerId to view documents for that worker.' });
  }
  if (workerId !== undefined && !isRecordId(workerId)) {
    return res.status(400).json({ error: 'workerId must be a valid worker ID.' });
  }
  req.documentWorkerId = workerId ?? req.user.id;
  return next();
}

async function getDocumentOwner(req) {
  const { rows } = await pool.query(
    `SELECT u.id, EXISTS (
       SELECT 1 FROM probashi_shield.journeys j
       WHERE j.worker_id = u.id AND j.nominee_id = $2
     ) AS nominee_linked
     FROM probashi_shield.users u WHERE u.id = $1 AND u.role = 'worker'`,
    [req.documentWorkerId, req.user.id],
  );
  const [worker] = rows;
  if (!worker) return null;
  return {
    workerId: worker.id,
    nomineeId: worker.nominee_linked ? req.user.id : null,
    entityType: 'worker_documents',
    entityId: worker.id,
  };
}

function listDocuments(workerId) {
  return pool.query(
    `SELECT ${documentFields} FROM probashi_shield.documents
     WHERE worker_id = $1 ORDER BY created_at DESC, id DESC`,
    [workerId],
  );
}

router.post('/upload', requireRole('worker'), parseUpload, async (req, res) => {
  const { doc_type: docType } = req.body ?? {};
  let { manualData } = req.body ?? {};
  const workerId = req.user.id;
  const file = req.file;
  if (!documentTypes.has(docType)) {
    return res.status(400).json({ error: 'Supply a valid doc_type.' });
  }
  if (req.is('multipart/form-data') && typeof manualData === 'string') {
    try {
      manualData = JSON.parse(manualData);
    } catch {
      return res.status(400).json({ error: 'manualData must contain valid JSON.' });
    }
  }
  if (!file?.buffer.length && manualData === undefined) {
    return res.status(400).json({ error: 'Supply a document file or manualData.' });
  }
  const binaryHash = file?.buffer.length ? hashDocument(file.buffer) : null;
  if (binaryHash && await findDocument(pool, workerId, binaryHash)) {
    return res.status(409).json(duplicateError);
  }

  let extraction;
  try {
    extraction = await extractDocumentData({ fileBuffer: file?.buffer, mimeType: file?.mimetype, manualData });
  } catch (error) {
    if (error.code === 'INVALID_MANUAL_DATA' || error.code === 'MANUAL_INPUT_REQUIRED' || error.code === 'INVALID_DOCUMENT_FILE') {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
        needsManualInput: error.code === 'MANUAL_INPUT_REQUIRED',
        ...error.details,
      });
    }
    throw error;
  }

  const fileHash = binaryHash ?? hashDocument(extraction.data);
  const document = await inTransaction(client => (
    storeDocument(client, workerId, docType, fileHash, extraction, 'DOCUMENT_UPLOADED')
  ));
  if (!document) return res.status(409).json(duplicateError);
  return res.status(201).json({ document });
});

router.post('/seed-demo-case', requireRole('worker'), async (req, res) => {
  const workerId = req.user.id;
  const { documents, inserted } = await inTransaction(async (client) => {
    const documents = [];
    let inserted = 0;
    for (const { docType, manualData } of demoDocuments) {
      const extraction = await extractDocumentData({ manualData });
      const fileHash = hashDocument(extraction.data);
      const document = await storeDocument(client, workerId, docType, fileHash, extraction, 'DOCUMENT_DEMO_SEEDED');
      if (document) inserted += 1;
      documents.push(document ?? await findDocument(client, workerId, fileHash));
    }
    return { documents, inserted };
  });
  return res.status(inserted ? 201 : 200).json({ documents, inserted });
});

function auditResult(report) {
  if (report.needsConfirmation || report.feeVerdict === null) return 'needs_review';
  if (report.feeVerdict === 'Red' || report.agencyChecks.some(({ status }) => status === 'revoked')) return 'failed';
  if (report.agencyChecks.some(({ status }) => status === 'not_found')) return 'needs_review';
  if (report.feeVerdict === 'Amber' || report.mismatches.length || report.agencyChecks.some(({ status }) => status === 'flagged')) {
    return 'warning';
  }
  return 'passed';
}

router.post('/audit', requireRole('worker'), async (req, res) => {
  const workerId = req.user.id;
  const { rows: documents } = await listDocuments(workerId);
  if (documents.length === 0) {
    return res.status(422).json({ error: 'Upload a document before running an audit.' });
  }

  const [{ rows: agencies }, { rows: corridors }] = await Promise.all([
    pool.query('SELECT id, name, license_no, status FROM probashi_shield.agencies ORDER BY id'),
    pool.query(`SELECT id, country, country_code, job_category, max_legal_fee_bdt, corridor_risk_level, rule_source,
      to_char(effective_date, 'YYYY-MM-DD') AS effective_date FROM probashi_shield.corridors ORDER BY id`),
  ]);
  const report = runCrossDocumentAudit({ documents, agencies, corridors });
  const primary = documents.find(({ doc_type }) => offerTypes.has(doc_type)) ?? documents[0];
  const related = documents.find(({ id, doc_type }) => id !== primary.id && doc_type === 'receipt');

  const auditId = await inTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO probashi_shield.audit_checks
         (document_id, related_document_id, check_type, rule_version, result, details)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [primary.id, related?.id ?? null, auditType, ruleVersion, auditResult(report), JSON.stringify(report)],
    );
    const [audit] = rows;
    await logAudit({
      actorId: workerId,
      targetUserId: workerId,
      action: 'DOCUMENT_AUDIT_COMPLETED',
      entityType: 'audit_check',
      entityId: audit.id,
      details: { feeVerdict: report.feeVerdict, needsConfirmation: report.needsConfirmation },
    }, client);
    return audit.id;
  });
  return res.status(201).json({ auditId, ...report });
});

const agencyStatuses = new Set(['verified', 'flagged', 'revoked', 'not_found']);
const riskLevels = new Set(['low', 'medium', 'high']);
const maxFeeAmount = 9_999_999_999.99;

function positiveFee(value) {
  const number = typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim()) ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 && number <= maxFeeAmount ? number : null;
}

// What-if scoring for the risk explorer. Validates input and never writes to the database.
router.post('/simulate-risk', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const chargedFeeBdt = positiveFee(body.chargedFeeBdt);
  const maxLegalFeeBdt = positiveFee(body.maxLegalFeeBdt);
  if (chargedFeeBdt === null || maxLegalFeeBdt === null) {
    return res.status(400).json({ error: 'chargedFeeBdt and maxLegalFeeBdt must be positive BDT amounts.' });
  }
  const {
    agencyStatus = 'verified', corridorRiskLevel = 'medium',
    agencyLicenseMismatch = false, missingSalaryClause = false,
  } = body;
  if (!agencyStatuses.has(agencyStatus)) {
    return res.status(400).json({ error: 'agencyStatus must be verified, flagged, revoked, or not_found.' });
  }
  if (!riskLevels.has(corridorRiskLevel)) {
    return res.status(400).json({ error: 'corridorRiskLevel must be low, medium, or high.' });
  }
  if (typeof agencyLicenseMismatch !== 'boolean' || typeof missingSalaryClause !== 'boolean') {
    return res.status(400).json({ error: 'agencyLicenseMismatch and missingSalaryClause must be booleans.' });
  }

  const overchargeMultiple = Number(clampMultiple(chargedFeeBdt / maxLegalFeeBdt).toFixed(4));
  return res.json({
    overchargeMultiple,
    feeVerdict: feeBand(chargedFeeBdt, maxLegalFeeBdt),
    ...predictFraudRisk({
      overchargeMultiple,
      agencyFlaggedOrRevoked: agencyStatus === 'flagged' || agencyStatus === 'revoked',
      agencyLicenseMismatch,
      missingSalaryClause,
      highRiskCorridor: corridorRiskLevel === 'high',
    }),
    simulated: true,
  });
});

function validateDocumentId(req, res, next) {
  if (!isRecordId(req.params.id)) return res.status(400).json({ error: 'Document ID must be a valid record ID.' });
  return next();
}

async function getDocumentRecordOwner(req) {
  const { rows } = await pool.query('SELECT worker_id FROM probashi_shield.documents WHERE id = $1', [req.params.id]);
  if (!rows[0]) return null;
  // Nominees are read-only, so confirmation is never delegated to them.
  return { workerId: rows[0].worker_id, nomineeId: null, entityType: 'document', entityId: req.params.id };
}

// Confirms or corrects an unclear extraction so the audit can use it.
router.patch('/:id/confirm', validateDocumentId, verifyResourceAccess(getDocumentRecordOwner), async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const corrections = body.extractedData;
  if (corrections !== undefined && (!corrections || typeof corrections !== 'object' || Array.isArray(corrections))) {
    return res.status(400).json({ error: 'extractedData must be an object of document fields.' });
  }

  let corrected;
  if (corrections !== undefined) {
    try {
      corrected = normalizeDocumentData({ ...corrections, is_blurry_or_unclear: false });
    } catch (error) {
      if (error.code === 'INVALID_MANUAL_DATA') return res.status(400).json({ error: error.message, code: error.code });
      throw error;
    }
  }

  const result = await inTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, worker_id, extracted_data, extraction_status FROM probashi_shield.documents
       WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    const [current] = rows;
    if (!current) return { status: 404, body: { error: 'Not Found' } };
    if (!corrected && current.extraction_status === 'confirmed') {
      return { status: 409, body: { error: 'This document is already confirmed. Supply extractedData to correct it.' } };
    }
    if (!corrected && !current.extracted_data) {
      return { status: 422, body: { error: 'No extracted data exists. Supply extractedData to confirm this document.' } };
    }

    const data = corrected ?? { ...current.extracted_data, is_blurry_or_unclear: false };
    const changedFields = Object.keys(data).filter(field => (
      JSON.stringify(data[field]) !== JSON.stringify(current.extracted_data?.[field] ?? null)
    ));
    const { rows: updated } = await client.query(
      `UPDATE probashi_shield.documents
       SET extracted_data = $2, extraction_status = 'confirmed'
       WHERE id = $1 RETURNING ${documentFields}`,
      [current.id, JSON.stringify(data)],
    );
    await logAudit({
      actorId: req.user.id,
      targetUserId: current.worker_id,
      action: 'DOCUMENT_CONFIRMED',
      entityType: 'document',
      entityId: current.id,
      details: { previousStatus: current.extraction_status, corrected: Boolean(corrected), changedFields },
    }, client);
    return { status: 200, body: { document: updated[0] } };
  });
  return res.status(result.status).json(result.body);
});

router.get('/my', selectWorker, verifyResourceAccess(getDocumentOwner), async (req, res) => {
  const workerId = req.documentWorkerId;
  const [{ rows: documents }, { rows: auditHistory }] = await Promise.all([
    listDocuments(workerId),
    pool.query(
      `SELECT ac.id, ac.document_id, ac.related_document_id, ac.check_type, ac.rule_version, ac.result,
              ac.details AS report, ac.created_at
       FROM probashi_shield.audit_checks ac
       JOIN probashi_shield.documents d ON d.id = ac.document_id
       WHERE d.worker_id = $1 AND ac.check_type = $2
       ORDER BY ac.created_at DESC, ac.id DESC`,
      [workerId, auditType],
    ),
  ]);
  return res.json({ documents, auditHistory });
});

module.exports = router;
