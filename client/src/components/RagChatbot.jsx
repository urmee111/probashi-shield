import { useEffect, useRef, useState } from 'react';
import { BookOpen, Building2, Compass, MessageCircle, Scale, SearchCheck, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { Spinner } from '@/components/shared';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const QUICK_PROMPTS = [
  'Malaysia jete 450000 taka chaitese, RL-9911 agency ki safe?',
  'Amar journey status ki?',
  'Agency amar passport rekhe dite chay, eta ki legal?',
];
const CITATION_ICONS = { corridor: Scale, agency: Building2, audit_check: SearchCheck, journey: Compass, static: BookOpen };

function AssistantMessage({ message }) {
  const { t } = useI18n();
  return (
    <div className="max-w-[90%] space-y-2 self-start rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5 text-sm">
      <div className="flex flex-wrap gap-1">
        <Badge variant={message.mode === 'gemini_rag' ? 'default' : 'secondary'}>{t(`chat.${message.mode}`, {}, t('chat.assistant'))}</Badge>
        <Badge variant="outline">{t('chat.records', { count: message.retrievedCount })}</Badge>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
      {message.citations?.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t('chat.citations', { count: message.citations.length })}</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {message.citations.map(citation => {
              const Icon = CITATION_ICONS[citation.type] ?? BookOpen;
              return (
                <span key={`${citation.type}-${citation.id}`} title={citation.source ?? ''} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  <Icon className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{citation.label}</span>
                </span>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

export default function RagChatbot() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('auto');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const escape = event => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setMessages(list => [...list, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const { data } = await api.post('/assistant/chat', { message: message.slice(0, 1000), language });
      setMessages(list => [...list, { role: 'assistant', text: data.reply, mode: data.mode, citations: data.citations, retrievedCount: data.retrievedCount }]);
    } catch (failure) {
      setMessages(list => [...list, { role: 'error', text: apiError(failure).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <section
          className="fixed right-4 bottom-20 z-50 flex h-[min(36rem,calc(100svh-7rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl animate-in fade-in-0 slide-in-from-bottom-2"
          role="dialog" aria-labelledby="chat-title"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 id="chat-title" className="text-sm font-semibold">{t('chat.fab')}</h2>
              <p className="text-xs text-muted-foreground">{t('chat.subtitle')}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={t('chat.close')} onClick={() => setOpen(false)}><X /></Button>
          </header>

          <div ref={logRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 p-4" aria-live="polite">
            {!messages.length && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('chat.askIn')}</p>
                {QUICK_PROMPTS.map(prompt => (
                  <button key={prompt} type="button" onClick={() => send(prompt)} className="w-full rounded-xl border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              message.role === 'assistant'
                ? <AssistantMessage key={index} message={message} />
                : (
                  <div
                    key={index}
                    className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', message.role === 'user'
                      ? 'self-end rounded-br-sm bg-primary text-primary-foreground'
                      : 'self-start bg-destructive/10 text-destructive')}
                  >
                    {message.text}
                  </div>
                )
            ))}
            {busy && <div className="flex items-center gap-2 self-start text-xs text-muted-foreground"><Spinner />{t('chat.retrieving')}</div>}
          </div>

          {messages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-t px-3 pt-2">
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} type="button" disabled={busy} onClick={() => send(prompt)} className="shrink-0 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap hover:bg-muted disabled:opacity-50">
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <form className="flex items-center gap-2 p-3" onSubmit={event => { event.preventDefault(); send(input); }}>
            <NativeSelect aria-label={t('chat.language')} size="sm" value={language} onChange={event => setLanguage(event.target.value)}>
              <NativeSelectOption value="auto">Auto</NativeSelectOption>
              <NativeSelectOption value="en">EN</NativeSelectOption>
              <NativeSelectOption value="bn">বাংলা</NativeSelectOption>
              <NativeSelectOption value="banglish">Banglish</NativeSelectOption>
            </NativeSelect>
            <Input ref={inputRef} aria-label={t('chat.question')} maxLength={1000} placeholder={t('chat.placeholder')} value={input} onChange={event => setInput(event.target.value)} />
            <Button type="submit" size="icon" aria-label={t('chat.send')} disabled={busy || !input.trim()}><Send /></Button>
          </form>
        </section>
      )}
      <Button size="lg" className="fixed right-4 bottom-4 z-50 rounded-full shadow-lg" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <MessageCircle />{t('chat.fab')}
      </Button>
    </>
  );
}
