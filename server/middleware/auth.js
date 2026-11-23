const jwt = require('jsonwebtoken');
const { logAudit } = require('../services/auditLogger');

const roles = new Set(['worker', 'nominee', 'admin']);
const maxId = 9223372036854775807n;
const resourceOwner = Symbol('resourceOwner');
const tokenIssuer = 'probashi-shield';

function isRecordId(id) {
  if (typeof id === 'number') return Number.isSafeInteger(id) && id > 0;
  return typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= maxId;
}

function authenticate(req, res, next) {
  const bearer = req.get('Authorization')?.match(/^Bearer +(\S+)$/i);
  if (!bearer) return res.status(401).json({ error: 'Unauthorized' });

  let claims;
  try {
    claims = jwt.verify(bearer[1], process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: tokenIssuer,
    });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isRecordId(claims?.id) || typeof claims.email !== 'string' || !claims.email || !roles.has(claims.role)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = { id: claims.id, email: claims.email, role: claims.role };
  return next();
}

// Every 403 is logged: record-level denials name the record's owner, and
// role denials (for example a worker calling an admin route) name the endpoint.
async function denyAccess(req, res, requiredRoles) {
  const ownership = req[resourceOwner];
  const path = req.originalUrl.split('?')[0].slice(0, 200);
  let entry;
  if (ownership && String(req.user.id) !== String(ownership.workerId)) {
    const { workerId, entityType = 'worker', entityId = workerId } = ownership;
    entry = { targetUserId: workerId, entityType, entityId, details: { method: req.method, path, role: req.user.role } };
  } else if (!ownership && requiredRoles) {
    entry = {
      targetUserId: null,
      entityType: 'endpoint',
      entityId: req.user.id,
      details: { method: req.method, path, role: req.user.role, requiredRoles },
    };
  }
  if (entry) {
    try {
      await logAudit({ actorId: req.user.id, action: 'UNAUTHORIZED_ACCESS_ATTEMPT', ...entry });
    } catch (error) {
      console.error('Failed to record denied access', error.code || error.name);
    }
  }
  return res.status(403).json({ error: 'Forbidden' });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!allowedRoles.includes(req.user.role)) {
      return denyAccess(req, res, allowedRoles);
    }
    return next();
  };
}

// Resolve { workerId, nomineeId, entityType, entityId } for the requested record,
// or return null if it is missing. Run this before route-specific role restrictions.
function verifyResourceAccess(getOwnerIds) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const ownership = await getOwnerIds(req);
    if (!ownership) return res.status(404).json({ error: 'Not Found' });

    const { workerId, nomineeId } = ownership;
    if (!isRecordId(workerId)) throw new Error('Resource owner lookup must return a valid worker ID.');
    req[resourceOwner] = ownership;

    const userId = String(req.user.id);
    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    const isLinkedNominee = req.user.role === 'nominee' && userId === String(nomineeId);
    if (req.user.role === 'admin' || userId === String(workerId) || (readOnly && isLinkedNominee)) {
      return next();
    }

    return denyAccess(req, res);
  };
}

module.exports = { authenticate, requireRole, verifyResourceAccess, tokenIssuer, isRecordId };
