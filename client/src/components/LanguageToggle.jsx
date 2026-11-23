import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const options = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'bn', label: 'বাং', name: 'বাংলা' },
];

// Segmented EN / বাং switch. Keyboard accessible as a radio group.
export default function LanguageToggle({ className }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('lang.label')} className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}>
      <Languages className="mx-1 size-3.5 text-muted-foreground" aria-hidden="true" />
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={lang === option.value}
          aria-label={option.name}
          lang={option.value}
          onClick={() => setLang(option.value)}
          className={cn(
            'h-6 min-w-8 rounded-md px-2 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            lang === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
