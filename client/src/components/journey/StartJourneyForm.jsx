import { useEffect, useState } from 'react';
import api, { apiError } from '@/api';
import { formatBdt } from '@/format';
import { useI18n } from '@/i18n';
import { Field, Spinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export default function StartJourneyForm({ isAdmin, onCreated }) {
  const { t } = useI18n();
  const [agencies, setAgencies] = useState([]);
  const [corridors, setCorridors] = useState([]);
  const [form, setForm] = useState({ agencyId: '', corridorId: '', nomineeEmail: 'fatema@demo.com', workerId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/agencies', { params: { sortBy: 'name' } }), api.get('/corridors')])
      .then(([agencyResponse, corridorResponse]) => {
        const usable = agencyResponse.data.agencies.filter(agency => agency.status !== 'revoked')
          .sort((a, b) => Number(b.status === 'verified') - Number(a.status === 'verified'));
        const rows = corridorResponse.data.corridors;
        setAgencies(usable);
        setCorridors(rows);
        setForm(current => ({
          ...current,
          agencyId: current.agencyId || String(usable[0]?.id ?? ''),
          corridorId: current.corridorId || String(rows.find(row => row.country === 'Malaysia')?.id ?? rows[0]?.id ?? ''),
        }));
      })
      .catch(failure => setError(apiError(failure).message));
  }, []);

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      agencyId: Number(form.agencyId),
      corridorId: Number(form.corridorId),
      nomineeEmail: form.nomineeEmail.trim() || null,
    };
    if (isAdmin) body.workerId = Number(form.workerId);
    try {
      const { data } = await api.post('/journeys', body);
      onCreated(data);
    } catch (failure) {
      const problem = apiError(failure);
      setError(`${problem.status ?? ''} ${problem.message}`.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label={t('journey.startTitle')}>
      <Field id="sj-agency" label={t('start.agency')}>
        <NativeSelect id="sj-agency" className="w-full" required value={form.agencyId} onChange={set('agencyId')}>
          {agencies.map(agency => <NativeSelectOption key={agency.id} value={agency.id}>{agency.name} · {t(`agency.${agency.status}`)}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field id="sj-corridor" label={t('start.destination')}>
        <NativeSelect id="sj-corridor" className="w-full" required value={form.corridorId} onChange={set('corridorId')}>
          {corridors.map(row => <NativeSelectOption key={row.id} value={row.id}>{row.country} · {t('start.cap', { amount: formatBdt(row.max_legal_fee_bdt) })}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field id="sj-nominee" label={t('start.nominee')} hint={t('start.nomineeHint')}>
        <Input id="sj-nominee" type="email" value={form.nomineeEmail} onChange={set('nomineeEmail')} />
      </Field>
      {isAdmin && (
        <Field id="sj-worker" label={t('start.workerId')}>
          <Input id="sj-worker" required inputMode="numeric" pattern="[1-9][0-9]*" value={form.workerId} onChange={set('workerId')} />
        </Field>
      )}
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy || !agencies.length}>{busy && <Spinner />}{t('start.submit')}</Button>
      </div>
    </form>
  );
}
