import { useState } from 'react';
import { FileText } from 'lucide-react';
import api, { apiError } from '@/api';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import { formatBdt, formatDate } from '@/format';
import { EmptyState, Spinner, Tone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import DocumentFields from './DocumentFields';
import { fieldsFrom, payloadError, toPayload } from './fields';

function ConfirmEditor({ doc, onDone, onCancel }) {
  const { t } = useI18n();
  const [fields, setFields] = useState(() => fieldsFrom(doc.extracted_json));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirm(event) {
    event.preventDefault();
    const extractedData = toPayload(fields, { includeBlurry: false });
    const problem = payloadError(extractedData, t);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await api.patch(`/documents/${doc.id}/confirm`, { extractedData });
      notify({ variant: 'success', title: t('docs.confirmed', { id: doc.id }), body: t('docs.confirmedBody') });
      onDone();
    } catch (failure) {
      const { status, message } = apiError(failure);
      setError(`${status ?? ''} ${message}`.trim());
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 space-y-3 rounded-lg border border-gold/35 bg-gold/8 p-4" onSubmit={confirm} aria-label={t('docs.confirm')}>
      <p className="text-sm font-medium">{t('docs.review')}</p>
      <DocumentFields idPrefix={`confirm-${doc.id}`} fields={fields} onChange={setFields} showBlurry={false} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy && <Spinner />}{t('docs.confirm')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

export default function DocumentList({ documents, onChanged }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(null);
  if (!documents.length) return <EmptyState title={t('docs.empty')}>{t('docs.emptyBody')}</EmptyState>;

  return (
    <ul className="divide-y rounded-lg border">
      {documents.map(doc => {
        const data = doc.extracted_json ?? {};
        const summary = [data.agency_license, data.destination_country, data.total_fee_bdt != null && formatBdt(data.total_fee_bdt)].filter(Boolean);
        return (
          <li key={doc.id} className="p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"><FileText className="size-4 text-muted-foreground" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">#{doc.id} · {t(`doctype.${doc.doc_type}`)}</p>
                <p className="truncate text-xs text-muted-foreground">{summary.join(' · ') || t('docs.noFields')} · {formatDate(doc.created_at)}</p>
              </div>
              {doc.needs_confirmation
                ? editing !== doc.id && <Button size="sm" variant="outline" onClick={() => setEditing(doc.id)}>{t('docs.confirmButton')}</Button>
                : <Tone tone="muted">{t(`method.${doc.extraction_method}`, {}, doc.extraction_status)}</Tone>}
            </div>
            {editing === doc.id && (
              <ConfirmEditor doc={doc} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
