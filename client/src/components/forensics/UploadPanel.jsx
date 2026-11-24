import { useRef, useState } from 'react';
import { FileUp, PenLine } from 'lucide-react';
import api, { apiError } from '@/api';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import { Field, Spinner } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DocumentFields from './DocumentFields';
import { DOC_TYPES, EMPTY_FIELDS, payloadError, toPayload } from './fields';

export default function UploadPanel({ onUploaded }) {
  const { t } = useI18n();
  const fileInput = useRef(null);
  const [mode, setMode] = useState('file');
  const [docType, setDocType] = useState('receipt');
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setNotice(null);
    let request;
    if (mode === 'file') {
      if (!file) return setNotice({ tone: 'warning', text: t('upload.chooseFile') });
      if (file.size > 10 * 1024 * 1024) return setNotice({ tone: 'warning', text: t('upload.tooBig') });
      const form = new FormData();
      form.append('doc_type', docType);
      form.append('file', file);
      request = api.post('/documents/upload', form);
    } else {
      const manualData = toPayload(fields);
      const problem = payloadError(manualData, t);
      if (problem) return setNotice({ tone: 'warning', text: problem });
      request = api.post('/documents/upload', { doc_type: docType, manualData });
    }

    setBusy(true);
    try {
      const { data } = await request;
      const doc = data.document;
      notify({
        variant: doc.needs_confirmation ? 'warning' : 'success',
        title: t('upload.saved', { id: doc.id }),
        body: doc.needs_confirmation ? t('upload.savedUnclear') : t('upload.savedVia', { method: t(`method.${doc.extraction_method}`) }),
      });
      setFile(null);
      setFields(EMPTY_FIELDS);
      if (fileInput.current) fileInput.current.value = '';
      onUploaded();
    } catch (failure) {
      const error = apiError(failure);
      if (error.status === 409) {
        setNotice({ tone: 'duplicate', text: t('upload.duplicate') });
      } else if (error.data?.needsManualInput) {
        setMode('manual');
        setNotice({ tone: 'info', text: t('upload.fallback') });
      } else {
        setNotice({ tone: 'error', text: `${error.status ?? ''} ${error.message}`.trim() });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="doc-type" label={t('upload.docType')} className="min-w-44 flex-1">
          <NativeSelect id="doc-type" className="w-full" value={docType} onChange={event => setDocType(event.target.value)}>
            {DOC_TYPES.map(value => <NativeSelectOption key={value} value={value}>{t(`doctype.${value}`)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="file"><FileUp /> {t('upload.file')}</TabsTrigger>
            <TabsTrigger value="manual"><PenLine /> {t('upload.manual')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'file' ? (
        <Field id="doc-file" label={t('upload.fileLabel')} hint={t('upload.fileHint')}>
          <Input
            id="doc-file" ref={fileInput} type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onChange={event => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
      ) : (
        <DocumentFields idPrefix="manual" fields={fields} onChange={setFields} />
      )}

      {notice && (
        <Alert variant={notice.tone === 'error' ? 'destructive' : 'default'} className={notice.tone === 'duplicate' ? 'border-gold/45 bg-gold/10' : ''}>
          {notice.tone === 'duplicate' && <AlertTitle>{t('upload.duplicateTitle')}</AlertTitle>}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Spinner />}{mode === 'file' ? t('upload.submitFile') : t('upload.submitManual')}
      </Button>
    </form>
  );
}
