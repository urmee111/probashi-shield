import { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, RefreshCw, TimerOff, X } from 'lucide-react';
import api, { apiError, probe } from '@/api';
import { useAuth } from '@/auth';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import AlertFeed from '@/components/journey/AlertFeed';
import JourneyBanner from '@/components/journey/JourneyBanner';
import JourneyStepper from '@/components/journey/JourneyStepper';
import StartJourneyForm from '@/components/journey/StartJourneyForm';
import { EmptyState, ErrorAlert, PageHeader, SecurityResultCard, Spinner } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

function ProofCard({ title, description, buttonLabel, result, onRun }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" className="w-full" disabled={result?.loading} onClick={onRun}>
          {result?.loading && <Spinner />}{buttonLabel}
        </Button>
        <SecurityResultCard result={result} />
      </CardContent>
    </Card>
  );
}

export default function JourneyPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [journeys, setJourneys] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState(null);
  const [proof, setProof] = useState({});
  const [showStart, setShowStart] = useState(false);

  const isNominee = user.role === 'nominee';
  const canCreate = user.role === 'worker' || user.role === 'admin';

  const loadList = useCallback(async (preferId) => {
    try {
      const { data } = await api.get('/journeys');
      setJourneys(data.journeys);
      setSelectedId(current => {
        const ids = data.journeys.map(entry => entry.journey.id);
        if (preferId && ids.includes(preferId)) return preferId;
        return ids.includes(current) ? current : ids[0] ?? null;
      });
    } catch (failure) {
      setError(apiError(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return setDetail(null);
    try {
      const { data } = await api.get(`/journeys/${id}`);
      setDetail(data);
    } catch (failure) {
      setError(apiError(failure));
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const journey = detail?.journey;
  const canEdit = Boolean(journey) && (user.role === 'admin' || (user.role === 'worker' && String(journey.worker_id) === String(user.id)));
  const nextStep = detail?.recoveryPlan?.nextRequiredAction?.stepOrder ?? 1;

  async function patchStep(step, status) {
    setBusyStep(step.step_order);
    try {
      const { data } = await api.patch(`/journeys/${journey.id}/steps/${step.step_order}`, { status });
      setDetail(current => ({ ...current, ...data }));
      notify({ variant: status === 'failed' ? 'warning' : 'success', title: t('journey.stepUpdated', { step: t(`step.${step.step_name}`), status: t(`status.${status}`) }) });
      await loadDetail(journey.id);
    } catch (failure) {
      const problem = apiError(failure);
      notify({
        variant: 'danger',
        title: problem.status === 400 ? t('journey.ruleEnforced') : t('journey.rejected', { status: problem.status ?? '' }),
        body: problem.message,
        timeout: 8000,
      });
    } finally {
      setBusyStep(null);
    }
  }

  async function simulateExpiry(stepOrder) {
    setSimulating(true);
    try {
      const { data } = await api.post(`/journeys/${journey.id}/simulate-expiry`, { stepOrder });
      setDetail(current => ({ ...current, ...data }));
      notify({
        variant: 'danger',
        title: t('journey.rolledBack', { step: t(`step.${data.simulation.stepName}`) }),
        body: t('journey.rolledBackBody', { count: data.recoveryPlan.reopenedSteps.length }),
        timeout: 8000,
      });
      await loadDetail(journey.id);
    } catch (failure) {
      const problem = apiError(failure);
      notify({ variant: 'warning', title: t('journey.simRejected', { status: problem.status ?? '' }), body: problem.message });
    } finally {
      setSimulating(false);
    }
  }

  async function runProof(key, method, url, body) {
    setProof(current => ({ ...current, [key]: { loading: true } }));
    const result = await probe(method, url, body);
    setProof(current => ({ ...current, [key]: result }));
  }

  function handleCreated(data) {
    setShowStart(false);
    notify({ variant: 'success', title: t('journey.started', { id: data.journey.id }), body: t('journey.startedBody') });
    loadList(data.journey.id);
  }

  return (
    <>
      <PageHeader title={t('journey.title')} badge="A07" description={t('journey.description')}>
        {isNominee && <Badge variant="secondary"><Eye />{t('journey.readOnly')}</Badge>}
        {journeys.length > 0 && (
          <NativeSelect aria-label={t('journey.select')} className="min-w-56" value={selectedId ?? ''} onChange={event => setSelectedId(Number(event.target.value))}>
            {journeys.map(({ journey: entry }) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                #{entry.id} · {entry.country} · {t(`journeyStatus.${entry.overall_status}`)}{user.role === 'admin' ? ` · ${t('journey.worker', { id: entry.worker_id })}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {canCreate && (
          <Button variant={showStart ? 'ghost' : 'default'} onClick={() => setShowStart(value => !value)} aria-expanded={showStart}>
            {showStart ? <><X />{t('common.close')}</> : <><Plus />{t('journey.new')}</>}
          </Button>
        )}
      </PageHeader>
      <ErrorAlert error={error} />

      {showStart && canCreate && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t('journey.startTitle')}</CardTitle></CardHeader>
          <CardContent><StartJourneyForm isAdmin={user.role === 'admin'} onCreated={handleCreated} /></CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {loading && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}
          {!loading && !journey && (
            <EmptyState title={t('journey.empty')}>
              {canCreate ? t('journey.emptyWorker') : t('journey.emptyNominee')}
            </EmptyState>
          )}
          {journey && (
            <>
              <JourneyBanner journey={journey} recoveryPlan={detail.recoveryPlan} />
              <Card>
                <CardHeader>
                  <CardTitle>#{journey.id} · {journey.country}</CardTitle>
                  <CardDescription>{journey.agency_name} · {journey.agency_license}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <JourneyStepper
                    steps={detail.steps} canEdit={canEdit} busyStep={busyStep}
                    onPass={step => patchStep(step, 'passed')} onFail={step => patchStep(step, 'failed')}
                  />
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                      <Button variant="destructive" disabled={simulating} onClick={() => simulateExpiry(2)}>
                        {simulating ? <Spinner /> : <TimerOff />}{t('journey.simMedical')}
                      </Button>
                      <Button variant="ghost" disabled={simulating} onClick={() => simulateExpiry(3)}>{t('journey.simPolice')}</Button>
                      <p className="ml-auto text-xs text-muted-foreground">{t('journey.tip')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-4" aria-label={t('journey.alerts')}>
          {journey && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>{isNominee ? t('journey.nomineeFeed') : t('journey.alerts')}</CardTitle>
                <CardAction>
                  <Button variant="ghost" size="icon-sm" aria-label={t('common.refresh')} onClick={() => loadDetail(journey.id)}><RefreshCw /></Button>
                </CardAction>
              </CardHeader>
              <CardContent><AlertFeed alerts={detail.alerts} /></CardContent>
            </Card>
          )}
          {isNominee && journey && (
            <ProofCard
              title={t('journey.lockTitle')} description={t('journey.lockDescription', { step: nextStep })}
              buttonLabel={t('journey.lockButton')} result={proof.lock}
              onRun={() => runProof('lock', 'patch', `/journeys/${journey.id}/steps/${nextStep}`, { status: 'passed' })}
            />
          )}
          <ProofCard
            title={t('journey.isoTitle')} description={t('journey.isoDescription')}
            buttonLabel={t('journey.isoButton')} result={proof.isolation}
            onRun={() => runProof('isolation', 'get', '/journeys/1')}
          />
        </aside>
      </div>
    </>
  );
}
