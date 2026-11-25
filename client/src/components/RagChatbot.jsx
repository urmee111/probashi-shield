import { useEffect, useRef, useState } from 'react';
import {
  Banknote, BookOpen, Building2, Check, ChevronDown, Compass, Palette, Route, Scale,
  SearchCheck, SendHorizontal, ShieldAlert, Sparkles, SquarePen, X,
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

// Swatch colours mirror the theme variables in index.css. Passport is the app's own palette.
const THEMES = [
  { id: 'passport', swatch: 'linear-gradient(135deg, #0D2B22 50%, #B9841C 50%)' },
  { id: 'emerald', swatch: 'linear-gradient(135deg, oklch(0.6 0.15 163), oklch(0.52 0.12 195))' },
  { id: 'ocean', swatch: 'linear-gradient(135deg, oklch(0.58 0.2 265), oklch(0.6 0.16 225))' },
  { id: 'sunset', swatch: 'linear-gradient(135deg, oklch(0.7 0.17 55), oklch(0.6 0.21 15))' },
  { id: 'midnight', swatch: 'linear-gradient(135deg, oklch(0.25 0.04 280), oklch(0.62 0.2 290))' },
];
const THEME_KEY = 'ps_chat_theme';

function initialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.some(theme => theme.id === stored) ? stored : 'passport';
}

function Shield({ className, outline = false }) {
  return (
    <svg viewBox="0 0 16 18" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 1L15 4V9C15 13.5 12 16.6 8 17.5C4 16.6 1 13.5 1 9V4L8 1Z"
        {...(outline ? { stroke: 'currentColor', strokeWidth: 1.4 } : { fill: 'currentColor' })}
      />
    </svg>
  );
}

function BotAvatar() {
  return (
    <span className="ps-chat-accent grid size-7 shrink-0 place-items-center rounded-full">
      <Shield className="h-3.5 w-3" />
    </span>
  );
}

function AssistantMessage({ message }) {
  const { t } = useI18n();
  const live = message.mode === 'gemini_rag';
  return (
    <div className="flex max-w-[92%] items-end gap-2 self-start">
      <BotAvatar />
      <div className="space-y-2 rounded-2xl rounded-bl-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 py-2.5 text-[13px]">
        <div className="flex flex-wrap gap-1 text-[10.5px] font-bold">
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
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-medium text-[var(--chat-muted)] hover:text-[var(--chat-fg)]">
              <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden="true" />
              {t('chat.citations', { count: message.citations.length })}
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
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

const iconButton = 'grid size-10 place-items-center rounded-full opacity-80 transition hover:bg-white/12 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current disabled:pointer-events-none disabled:opacity-35';

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
  const pickingRef = useRef(false);
  const pickerRef = useRef(null);
  const pickerToggleRef = useRef(null);
  pickingRef.current = picking;

  // A press outside the theme panel closes it. The palette button is excluded so its own click toggles cleanly.
  useEffect(() => {
    if (!picking) return undefined;
    const outside = (event) => {
      if (pickerRef.current?.contains(event.target) || pickerToggleRef.current?.contains(event.target)) return;
      setPicking(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [picking]);

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
    // Escape closes the theme picker first, then the panel.
    const escape = event => {
      if (event.key !== 'Escape') return;
      if (pickingRef.current) setPicking(false);
      else setOpen(false);
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
          className="ps-chat-glow fixed right-3 bottom-[5.25rem] z-50 flex h-[min(38rem,calc(100svh-7rem))] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[20px] border border-[var(--chat-border)] bg-[var(--chat-bg)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:right-7 sm:bottom-[6.5rem]"
          role="dialog" aria-labelledby="chat-title"
        >
          <header className="ps-chat-head relative py-3 pr-2 pl-[18px]">
            <div className="flex items-center gap-2.5">
              <span className="ps-chat-accent grid size-[34px] shrink-0 place-items-center rounded-full">
                <Shield className="h-[18px] w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="chat-title" className="truncate text-sm leading-tight font-bold">{t('chat.fab')}</h2>
                <p className="flex items-center gap-1.5 truncate text-[11px] opacity-75">
                  <span className="ps-chat-live size-1.5 shrink-0 rounded-full bg-[#4ADE80]" aria-hidden="true" />{t('chat.subtitle')}
                </p>
              </div>
              <button ref={pickerToggleRef} type="button" className={cn(iconButton, picking && 'bg-white/12 opacity-100')} aria-label={t('chat.theme')} title={t('chat.theme')} aria-expanded={picking} onClick={() => setPicking(value => !value)}><Palette className="size-4" /></button>
              <button type="button" className={iconButton} aria-label={t('chat.new')} title={t('chat.new')} disabled={busy || !messages.length} onClick={startNewChat}><SquarePen className="size-4" /></button>
              <button type="button" className={iconButton} aria-label={t('chat.close')} title={t('chat.close')} onClick={() => setOpen(false)}><X className="size-4" /></button>
            </div>
            {picking && (
              <div ref={pickerRef} role="radiogroup" aria-label={t('chat.theme')} className="mt-3 mr-2.5 grid grid-cols-3 gap-1.5 rounded-2xl bg-black/15 p-1.5 animate-in fade-in-0 slide-in-from-top-1">
                {THEMES.map(option => (
                  <button
                    key={option.id} type="button" role="radio" aria-checked={theme === option.id}
                    onClick={() => setTheme(option.id)}
                    className={cn('flex h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-medium transition hover:bg-white/15', theme === option.id && 'bg-white/20')}
                  >
                    <span className="grid size-4 shrink-0 place-items-center rounded-full text-white ring-1 ring-white/60" style={{ backgroundImage: option.swatch }}>
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
              <div className="-mx-4 -mt-4 flex flex-col animate-in fade-in-0 slide-in-from-bottom-2">
                <div className="border-b border-[var(--chat-border)] px-[18px] py-5 text-center">
                  <span className="mx-auto mb-2.5 grid size-[46px] place-items-center rounded-full bg-[var(--chat-soft)] text-[var(--chat-soft-fg)]">
                    <Shield outline className="h-[22px] w-5" />
                  </span>
                  <p className="text-sm font-semibold">{t('chat.greeting')}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--chat-muted)]">{t('chat.askIn')}</p>
                </div>
                <div className="flex flex-col gap-2 px-[18px] py-3.5">
                  {QUICK_PROMPTS.map(({ text, icon: Icon }) => (
                    <button
                      key={text} type="button" onClick={() => send(text)}
                      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-[var(--chat-border)] px-3 py-2.5 text-left text-[12.5px] leading-snug transition-colors hover:border-[var(--chat-hover)]"
                    >
                      <Icon className="size-4 shrink-0 text-[var(--chat-soft-fg)]" aria-hidden="true" />
                      <span className="flex-1">{text}</span>
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
                    className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap animate-in fade-in-0 slide-in-from-bottom-1', message.role === 'user'
                      ? 'ps-chat-brand self-end rounded-br-md'
                      : 'self-start border border-brick/30 bg-brick/10 text-brick')}
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
                    <span className="size-1.5 rounded-full bg-[var(--chat-hover)]" /><span className="size-1.5 rounded-full bg-[var(--chat-hover)]" /><span className="size-1.5 rounded-full bg-[var(--chat-hover)]" />
                  </span>
                  {t('chat.retrieving')}
                </div>
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <div className="ps-chat-dots flex gap-1.5 overflow-x-auto px-3.5 pt-2">
              {QUICK_PROMPTS.map(({ text, icon: Icon }) => (
                <button
                  key={text} type="button" disabled={busy} onClick={() => send(text)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--chat-border)] px-3 text-xs whitespace-nowrap text-[var(--chat-fg)] transition-colors hover:border-[var(--chat-hover)] disabled:opacity-50"
                >
                  <Icon className="size-3 text-[var(--chat-soft-fg)]" aria-hidden="true" />{text}
                </button>
              ))}
            </div>
          )}

          <form className="mt-2 border-t border-[var(--chat-border)] px-3.5 pt-3 pb-4" onSubmit={event => { event.preventDefault(); send(input); }}>
            <div className="flex items-center gap-2">
              <label className="relative shrink-0">
                <span className="sr-only">{t('chat.language')}</span>
                <select
                  value={language} onChange={event => setLanguage(event.target.value)}
                  className="h-10 cursor-pointer appearance-none rounded-[9px] bg-[var(--chat-soft)] py-0 pr-6 pl-2.5 text-[11px] font-semibold text-[var(--chat-soft-fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-hover)]"
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
                className="h-10 min-w-0 flex-1 rounded-[9px] border border-[var(--chat-border)] bg-transparent px-3 text-[13px] outline-none placeholder:text-[var(--chat-muted)] focus:border-[var(--chat-hover)]"
              />
              <button
                type="submit" aria-label={t('chat.send')} disabled={busy || !input.trim()}
                className="ps-chat-accent grid size-10 shrink-0 place-items-center rounded-full transition hover:brightness-110 active:scale-95 disabled:opacity-45"
              >
                <SendHorizontal className="size-4" strokeWidth={2.4} />
              </button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        aria-label={t('chat.fab')}
        className="ps-chat-launch ps-chat-glow fixed right-3 bottom-3 z-50 inline-flex size-14 items-center justify-center gap-2.5 rounded-full text-[13px] font-bold transition hover:-translate-y-0.5 active:translate-y-0 sm:right-7 sm:bottom-7 sm:h-[58px] sm:w-auto sm:justify-start sm:pr-5 sm:pl-3.5"
      >
        <span className="ps-chat-accent grid size-[30px] place-items-center rounded-full">
          {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <Shield className="h-4 w-3.5" />}
        </span>
        <span className="hidden sm:inline" aria-hidden="true">{t('chat.fab')}</span>
      </button>
    </div>
  );
}
