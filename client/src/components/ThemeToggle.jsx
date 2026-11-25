import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const options = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

// Light / Dark / System menu. `tone="dark"` sits on the ink nav, `tone="light"` on paper.
export default function ThemeToggle({ className, tone = 'light' }) {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const dark = tone === 'dark';
  const Icon = options.find(option => option.value === preference)?.icon ?? Monitor;
  const label = `${t('theme.label')}: ${t(`theme.${preference}`)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={cn(
          'grid size-9 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none',
          dark ? 'text-[#9FB3A7] hover:bg-white/5 hover:text-[#EDEFE4]' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
          className,
        )}
      >
        <Icon className="size-[17px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={preference} onValueChange={setPreference}>
            {options.map(({ value, icon: OptionIcon }) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                <OptionIcon aria-hidden="true" />{t(`theme.${value}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
