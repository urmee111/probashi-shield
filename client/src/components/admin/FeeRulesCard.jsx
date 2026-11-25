import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import api, { apiError } from '@/api';
import { formatBdt, formatDate } from '@/format';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import { ErrorAlert, Field, RiskLevelBadge, Spinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

function formFrom(corridor) {
  return {
    maxLegalFeeBdt: corridor.max_legal_fee_bdt == null ? '' : String(Number(corridor.max_legal_fee_bdt)),
    corridorRiskLevel: corridor.corridor_risk_level ?? 'medium',
    effectiveDate: corridor.effective_date ?? '',
    ruleSource: corridor.rule_source ?? '',
  };
}

// Sends only the fields that changed, so the audit log records exactly what the admin edited.
function changedFields(form, original) {
  const before = formFrom(original);
  const patch = {};
  if (form.maxLegalFeeBdt !== before.maxLegalFeeBdt) patch.maxLegalFeeBdt = form.maxLegalFeeBdt === '' ? null : Number(form.maxLegalFeeBdt);
  for (const key of ['corridorRiskLevel', 'effectiveDate', 'ruleSource']) {
    if (form[key].trim() !== before[key]) patch[key] = form[key].trim();
  }
  return patch;
}

function RuleEditor({ corridor, onSaved, onCancel }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => formFrom(corridor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const feeValid = form.maxLegalFeeBdt === '' || AMOUNT.test(form.maxLegalFeeBdt);

  async function save(event) {
    event.preventDefault();
    if (!feeValid) return setError({ message: t('rules.invalidFee') });
    if (!form.ruleSource.trim() || !form.effectiveDate) return setError({ message: t('rules.required') });
    const patch = changedFields(form, corridor);
    if (!Object.keys(patch).length) return onCancel();
    setBusy(true);
    try {
      await api.patch(`/admin/corridors/${corridor.id}`, patch);
      notify({ variant: 'success', title: t('rules.saved', { country: corridor.country }), body: t('rules.savedBody') });
      onSaved();
    } catch (failure) {
      setError(apiError(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-gold/35 bg-gold/6 p-4" aria-label={t('rules.editTitle', { country: corridor.country })}>
      <p className="text-sm font-semibold">{t('rules.editTitle', { country: corridor.country })}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rule-fee" label={t('rules.feeCap')}>
          <Input id="rule-fee" inputMode="decimal" value={form.maxLegalFeeBdt} onChange={set('maxLegalFeeBdt')} aria-invalid={!feeValid} />
        </Field>
        <Field id="rule-risk" label={t('rules.risk')}>
          <NativeSelect id="rule-risk" className="w-full" value={form.corridorRiskLevel} onChange={set('corridorRiskLevel')}>
            {['low', 'medium', 'high'].map(level => <NativeSelectOption key={level} value={level}>{t(`risk.${level}`)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field id="rule-date" label={t('rules.effective')}>
          <Input id="rule-date" type="date" value={form.effectiveDate} onChange={set('effectiveDate')} required />
        </Field>
      </div>
      <Field id="rule-source" label={t('rules.source')}>
        <Input id="rule-source" value={form.ruleSource} onChange={set('ruleSource')} maxLength={500} required />
      </Field>
      <ErrorAlert error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy && <Spinner />}{t('rules.save')}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export default function FeeRulesCard({ onSaved }) {
  const { t } = useI18n();
  const [corridors, setCorridors] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/corridors');
      setCorridors(data.corridors);
      setError(null);
    } catch (failure) {
      setError(apiError(failure));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const editingCorridor = corridors?.find(corridor => corridor.id === editing);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t('rules.title')}</CardTitle>
        <CardDescription>{t('rules.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorAlert error={error} />
        {!corridors && !error && <div className="flex justify-center py-6"><Spinner className="size-5" /></div>}
        {corridors && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('rules.country')}</TableHead><TableHead>{t('rules.feeCap')}</TableHead>
                <TableHead>{t('rules.risk')}</TableHead><TableHead>{t('rules.effective')}</TableHead><TableHead><span className="sr-only">{t('rules.edit')}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corridors.map(corridor => (
                <TableRow key={corridor.id} className={editing === corridor.id ? 'bg-gold/6' : ''}>
                  <TableCell className="text-sm font-medium">{corridor.country}<span className="block text-xs font-normal text-muted-foreground">{corridor.job_category ?? '—'}</span></TableCell>
                  <TableCell className="text-sm whitespace-nowrap tabular-nums">{formatBdt(corridor.max_legal_fee_bdt)}</TableCell>
                  <TableCell><RiskLevelBadge level={corridor.corridor_risk_level} /></TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(corridor.effective_date)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={t('rules.editTitle', { country: corridor.country })} onClick={() => setEditing(corridor.id)}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {editingCorridor && (
          <RuleEditor
            key={editingCorridor.id} corridor={editingCorridor} onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await load(); onSaved?.(); }}
          />
        )}
      </CardContent>
    </Card>
  );
}
