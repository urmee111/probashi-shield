import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, ScanSearch } from 'lucide-react';
import api, { apiError } from '@/api';
import { useAuth } from '@/auth';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import AuditResultCard from '@/components/forensics/AuditResultCard';
import DocumentList from '@/components/forensics/DocumentList';
import RiskSimulator from '@/components/forensics/RiskSimulator';
import UploadPanel from '@/components/forensics/UploadPanel';
import { EmptyState, ErrorAlert, PageHeader, Spinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function ForensicsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isWorker = user.role === 'worker';
  const [documents, setDocuments] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isWorker) return;
    try {
      const { data } = await api.get('/documents/my');
      setDocuments(data.documents);
      const latest = data.auditHistory[0];
      setReport(current => current ?? (latest ? { auditId: latest.id, ...latest.report } : null));
    } catch (failure) {
      setError(apiError(failure));
    }
  }, [isWorker]);

  useEffect(() => { load(); }, [load]);

  async function seedDemo() {
    setBusy('seed');
    try {
      const { data } = await api.post('/documents/seed-demo-case');
      notify({
        variant: 'success',
        title: data.inserted ? t('forensics.demoLoaded', { count: data.inserted }) : t('forensics.demoExisting'),
        body: t('forensics.demoBody'),
      });
      await load();
    } catch (failure) {
      setError(apiError(failure));
    } finally {
      setBusy(null);
    }
  }

  async function runAudit() {
    setBusy('audit');
    try {
      const { data } = await api.post('/documents/audit');
      setReport(data);
      notify({ variant: data.feeVerdict === 'Red' ? 'danger' : 'info', title: t('forensics.auditDone', { id: data.auditId }), body: t('forensics.auditVerdict', { verdict: data.feeVerdict ? t(`verdict.${data.feeVerdict}`) : t('common.notAssessed') }) });
    } catch (failure) {
      setError(apiError(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title={t('forensics.title')} description={t('forensics.description')}>
        {isWorker && (
          <>
            <Button variant="outline" onClick={seedDemo} disabled={Boolean(busy)}>
              {busy === 'seed' ? <Spinner /> : <FlaskConical />}{t('forensics.loadDemo')}
            </Button>
            <Button onClick={runAudit} disabled={Boolean(busy) || !documents.length}>
              {busy === 'audit' ? <Spinner /> : <ScanSearch />}{t('forensics.runAudit')}
            </Button>
          </>
        )}
      </PageHeader>
      <ErrorAlert error={error} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {isWorker ? (
            <>
              <AuditResultCard report={report} />
              <Card>
                <CardHeader>
                  <CardTitle>{t('forensics.docsTitle')}</CardTitle>
                  <CardDescription>{t('forensics.docsDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <DocumentList documents={documents} onChanged={load} />
                  <Separator />
                  <UploadPanel onUploaded={load} />
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState title={t('forensics.workerOnly')}>{t('forensics.workerOnlyBody')}</EmptyState>
          )}
        </div>
        <aside className="lg:sticky lg:top-20"><RiskSimulator /></aside>
      </div>
    </>
  );
}
