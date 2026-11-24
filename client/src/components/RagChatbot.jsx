import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Banknote, BookOpen, Bot, Building2, Check, ChevronDown, Compass, Palette, Route, Scale,
  SearchCheck, ShieldAlert, Sparkles, SquarePen, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { apiError } from '@/api';
import { useI18n } from '@/i18n';

const QUICK_PROMPTS = [
  { text: 'Malaysia jete 450000 taka chaitese, RL-9911 agency ki safe?', icon: Banknote },
  { text: 'Amar journey status ki?', icon: Route },
  { text: 'Agency amar passport rekhe dite chay, eta ki legal?', icon: ShieldAlert },
];
const CITATION_ICONS = { corridor: Scale, agency: Building2, audit_check: SearchCheck, journey: Compass, static: BookOpen };

// Swatch colours mirror the --chat-from / --chat-to values in index.css.
const THEMES = [
  { id: 'emerald', swatch: 'linear-gradient(135deg, oklch(0.6 0.15 163), oklch(0.52 0.12 195))' },
  { id: 'ocean', swatch: 'linear-gradient(135deg, oklch(0.58 0.2 265), oklch(0.6 0.16 225))' },
  { id: 'sunset', swatch: 'linear-gradient(135deg, oklch(0.7 0.17 55), oklch(0.6 0.21 15))' },
  { id: 'midnight', swatch: 'linear-gradient(135deg, oklch(0.25 0.04 280), oklch(0.62 0.2 290))' },
];
const THEME_KEY = 'ps_chat_theme';

function initialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.some(theme => theme.id === stored) ? stored : 'emerald';
}

function BotAvatar({ size = 'sm' }) {
  return (
    <span className={cn('ps-chat-brand grid shrink-0 place-items-center rounded-full', size === 'lg' ? 'size-14 rounded-2xl' : 'size-7')}>
      <Bot className={size === 'lg' ? 'size-7' : 'size-4'} aria-hidden="true" />
    </span>
  );
}

function AssistantMessage({ message }) {
  const { t } = useI18n();
  const live = message.mode === 'gemini_rag';
  return (
    <div className="flex max-w-[92%] items-end gap-2 self-start">
      <BotAvatar />
      <div className="space-y-2 rounded-2xl rounded-bl-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 py-2.5 text-sm shadow-sm">
        <div className="flex flex-wrap gap-1 text-[10px] font-semibold tracking-wide uppercase">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', live ? 'ps-chat-brand' : 'bg-[var(--chat-soft)] text-[var(--chat-soft-fg)]')}>
            {live && <Sparkles className="size-3" aria-hidden="true" />}
            {t(`chat.${message.mode}`, {}, t('chat.assistant'))}
          </span>
          {message.retrievedCount > 0 && (
            <span className="rounded-full border border-[var(--chat-border)] px-2 py-0.5 text-[var(--chat-muted)]">{t('chat.records', { count: message.retrievedCount })}</span>
          )}
        </div>
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
        {message.citations?.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-[var(--chat-muted)] hover:text-[var(--chat-fg)]">
              <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
              {t('chat.citations', { count: message.citations.length })}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {message.citations.map(citation => {
                const Icon = CITATION_ICONS[citation.type] ?? BookOpen;
                return (
                  <span key={`${citation.type}-${citation.id}`} title={citation.source ?? ''} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--chat-soft)] px-2 py-0.5 text-[11px] text-[var(--chat-soft-fg)]">
                    <Icon className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{citation.label}</span>
                  </span>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

const iconButton = 'grid size-8 place-items-center rounded-full text-[var(--chat-on-brand)]/90 transition hover:bg-white/20 hover:text-[var(--chat-on-brand)] focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40';

export default function RagChatbot() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => { localStorage.setItem(THEME_KEY, theme); }, [theme]);

  // Clears the conversation. Disabled while a reply is in flight so it cannot land in the new chat.
  function startNewChat() {
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const escape = event => {
      if (event.key !== 'Escape') return;
      setPicking(isPicking => {
        if (!isPicking) setOpen(false);
        return false;
      });
    };
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
    <div className="ps-chat contents" data-chat-theme={theme}>
      {open && (
        <section
          className="ps-chat-glow fixed right-4 bottom-20 z-50 flex h-[min(38rem,calc(100svh-7rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-[var(--chat-border)] bg-[var(--chat-bg)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4"
          role="dialog" aria-labelledby="chat-title"
        >
          <header className="ps-chat-brand relative px-4 pt-4 pb-3.5">
            <div className="flex items-center gap-3">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
                <Bot className="size-5" aria-hidden="true" />
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-white" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="chat-title" className="truncate text-[15px] leading-tight font-semibold">{t('chat.fab')}</h2>
                <p className="truncate text-xs opacity-85">{t('chat.subtitle')}</p>
              </div>
              <button type="button" className={cn(iconButton, picking && 'bg-white/20')} aria-label={t('chat.theme')} title={t('chat.theme')} aria-expanded={picking} onClick={() => setPicking(value => !value)}><Palette className="size-4" /></button>
              <button type="button" className={iconButton} aria-label={t('chat.new')} title={t('chat.new')} disabled={busy || !messages.length} onClick={startNewChat}><SquarePen className="size-4" /></button>
              <button type="button" className={iconButton} aria-label={t('chat.close')} title={t('chat.close')} onClick={() => setOpen(false)}><X className="size-4" /></button>
            </div>
            {picking && (
              <div role="radiogroup" aria-label={t('chat.theme')} className="mt-3 flex gap-2 rounded-2xl bg-black/15 p-1.5 backdrop-blur animate-in fade-in-0 slide-in-from-top-1">
                {THEMES.map(option => (
                  <button
                    key={option.id} type="button" role="radio" aria-checked={theme === option.id}
                    onClick={() => setTheme(option.id)}
                    className={cn('flex flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium transition hover:bg-white/15', theme === option.id && 'bg-white/25')}
                  >
                    <span className="grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-white/60" style={{ backgroundImage: option.swatch }}>
                      {theme === option.id && <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />}
                    </span>
                    <span className="truncate">{t(`chat.theme.${option.id}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </header>

          <div ref={logRef} className="ps-chat-log flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
            {!messages.length && (
              <div className="my-auto flex flex-col items-center gap-4 text-center animate-in fade-in-0 slide-in-from-bottom-2">
                <BotAvatar size="lg" />
                <div className="space-y-1">
                  <p className="text-base font-semibold">{t('chat.greeting')}</p>
                  <p className="text-xs text-[var(--chat-muted)]">{t('chat.askIn')}</p>
                </div>
                <div className="w-full space-y-2">
                  {QUICK_PROMPTS.map(({ text, icon: Icon }) => (
                    <button
                      key={text} type="button" onClick={() => send(text)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2.5 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--chat-from)] hover:shadow-md"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--chat-soft)] text-[var(--chat-soft-fg)] transition group-hover:scale-105"><Icon className="size-4" aria-hidden="true" /></span>
                      <span className="flex-1">{text}</span>
                      <ArrowUp className="size-4 rotate-45 text-[var(--chat-muted)] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              message.role === 'assistant'
                ? <AssistantMessage key={index} message={message} />
                : (
                  <div
                    key={index}
                    className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap animate-in fade-in-0 slide-in-from-bottom-1', message.role === 'user'
                      ? 'ps-chat-brand self-end rounded-br-md shadow-sm'
                      : 'self-start border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400')}
                  >
                    {message.text}
                  </div>
                )
            ))}
            {busy && (
              <div className="flex items-end gap-2 self-start" role="status">
                <BotAvatar />
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 py-2.5 text-xs text-[var(--chat-muted)]">
                  <span className="ps-chat-typing flex gap-1" aria-hidden="true">
                    <span className="size-1.5 rounded-full bg-[var(--chat-from)]" /><span className="size-1.5 rounded-full bg-[var(--chat-from)]" /><span className="size-1.5 rounded-full bg-[var(--chat-from)]" />
                  </span>
                  {t('chat.retrieving')}
                </div>
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <div className="ps-chat-dots flex gap-1.5 overflow-x-auto px-3 pt-2">
              {QUICK_PROMPTS.map(({ text, icon: Icon }) => (
                <button
                  key={text} type="button" disabled={busy} onClick={() => send(text)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2.5 py-1 text-xs whitespace-nowrap text-[var(--chat-fg)] transition hover:border-[var(--chat-from)] hover:bg-[var(--chat-soft)] disabled:opacity-50"
                >
                  <Icon className="size-3 text-[var(--chat-soft-fg)]" aria-hidden="true" />{text}
                </button>
              ))}
            </div>
          )}

          <form className="p-3" onSubmit={event => { event.preventDefault(); send(input); }}>
            <div className="flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface)] p-1 pl-1.5 shadow-sm transition focus-within:border-[var(--chat-from)] focus-within:ring-4 focus-within:ring-[var(--chat-glow)]">
              <label className="relative shrink-0">
                <span className="sr-only">{t('chat.language')}</span>
                <select
                  value={language} onChange={event => setLanguage(event.target.value)}
                  className="h-8 cursor-pointer appearance-none rounded-full bg-[var(--chat-soft)] py-0 pr-6 pl-3 text-xs font-medium text-[var(--chat-soft-fg)] outline-none"
                >
                  <option value="auto">Auto</option>
                  <option value="en">EN</option>
                  <option value="bn">বাংলা</option>
                  <option value="banglish">Banglish</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-[var(--chat-soft-fg)]" aria-hidden="true" />
              </label>
              <input
                ref={inputRef} aria-label={t('chat.question')} maxLength={1000} placeholder={t('chat.placeholder')}
                value={input} onChange={event => setInput(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[var(--chat-muted)]"
              />
              <button
                type="submit" aria-label={t('chat.send')} disabled={busy || !input.trim()}
                className="ps-chat-brand grid size-9 shrink-0 place-items-center rounded-full shadow-sm transition hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className={cn('ps-chat-brand ps-chat-glow fixed right-4 bottom-4 z-50 inline-flex h-12 items-center gap-2 rounded-full pr-5 pl-2 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-0', !open && 'ps-chat-ring')}
      >
        <span className="grid size-8 place-items-center rounded-full bg-white/20">
          {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        </span>
        {t('chat.fab')}
      </button>
    </div>
  );
}
