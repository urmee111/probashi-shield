import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const options = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'bn', label: 'বাং', name: 'বাংলা' },
];

// EN / বাং switch. `tone="dark"` sits on the ink nav, `tone="light"` on paper.
export default function LanguageToggle({ className, tone = 'light' }) {
  const { lang, setLang, t } = useI18n();
  const dark = tone === 'dark';
  return (
    <div role="radiogroup" aria-label={t('lang.label')} className={cn('inline-flex items-center text-xs', dark ? 'text-[#9FB3A7]' : 'text-muted-foreground', className)}>
      {options.map((option, index) => (
        <Fragment key={option.value}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <button
            type="button"
            role="radio"
            aria-checked={lang === option.value}
            aria-label={option.name}
            lang={option.value}
            onClick={() => setLang(option.value)}
            className={cn(
              'h-9 min-w-9 rounded-md px-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none',
              lang === option.value
                ? (dark ? 'text-[#F4D58D]' : 'font-semibold text-pass')
                : (dark ? 'hover:text-[#EDEFE4]' : 'hover:text-foreground'),
            )}
          >
            {option.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
