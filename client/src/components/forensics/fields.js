// Field definitions. Labels are i18n keys: `doctype.<value>` and `field.<key>`.
export const DOC_TYPES = ['job_offer', 'offer_letter', 'receipt', 'demand_letter', 'contract', 'visa', 'other'];

export const TEXT_FIELDS = [
  ['agency_name'],
  ['agency_license', 'RL-9911'],
  ['destination_country'],
  ['job_title'],
  ['employer_name'],
];

export const AMOUNT_FIELDS = ['total_fee_bdt', 'monthly_salary_bdt'];

export const EMPTY_FIELDS = {
  agency_name: '', agency_license: '', destination_country: '', job_title: '', employer_name: '',
  total_fee_bdt: '', monthly_salary_bdt: '', has_salary_clause: '', is_blurry_or_unclear: false,
};

export function fieldsFrom(data = {}) {
  const fields = { ...EMPTY_FIELDS };
  for (const key of Object.keys(EMPTY_FIELDS)) {
    const value = data?.[key];
    if (key === 'has_salary_clause') fields[key] = value === true ? 'yes' : value === false ? 'no' : '';
    else if (key === 'is_blurry_or_unclear') fields[key] = value === true;
    else fields[key] = value === null || value === undefined ? '' : String(value);
  }
  return fields;
}

// Converts form state into the backend's document field object. Blank values are omitted.
export function toPayload(fields, { includeBlurry = true } = {}) {
  const payload = {};
  for (const [key] of TEXT_FIELDS) if (fields[key].trim()) payload[key] = fields[key].trim();
  for (const key of AMOUNT_FIELDS) {
    const raw = String(fields[key]).replace(/,/g, '').trim();
    if (raw) payload[key] = Number(raw);
  }
  if (fields.has_salary_clause) payload.has_salary_clause = fields.has_salary_clause === 'yes';
  if (includeBlurry) payload.is_blurry_or_unclear = Boolean(fields.is_blurry_or_unclear);
  return payload;
}

// Returns null, or a translated validation message.
export function payloadError(payload, t) {
  const evidence = Object.keys(payload).filter(key => key !== 'is_blurry_or_unclear');
  if (!evidence.length) return t('field.needOne');
  for (const key of AMOUNT_FIELDS) {
    if (key in payload && (!Number.isFinite(payload[key]) || payload[key] < 0 || !/^\d+(\.\d{1,2})?$/.test(String(payload[key])))) {
      return t('field.badAmount', { label: t(`field.${key}`) });
    }
  }
  return null;
}
