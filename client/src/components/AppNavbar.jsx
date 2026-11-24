import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { DEMO_ACCOUNTS, apiError } from '@/api';
import { homeFor, useAuth } from '@/auth';
import { useI18n } from '@/i18n';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Brand from './Brand';
import LanguageToggle from './LanguageToggle';
import { RoleBadge, Spinner } from './shared';

const links = [
  { to: '/forensics', key: 'nav.forensics' },
  { to: '/pathways', key: 'nav.pathways' },
  { to: '/journey', key: 'nav.journey' },
  { to: '/directory', key: 'nav.directory' },
  { to: '/admin', key: 'nav.admin', roles: ['admin'] },
];

export const initials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

function NavItems({ role }) {
  const { t } = useI18n();
  return links.filter(link => !link.roles || link.roles.includes(role)).map(link => (
    <NavLink
      key={link.to}
      to={link.to}
      className={({ isActive }) => cn(
        'inline-flex h-11 shrink-0 items-center border-b-2 border-transparent pt-0.5 text-sm text-[#C9D6CC] transition-colors hover:border-gold/40 hover:text-[#EDEFE4] focus-visible:outline-2 focus-visible:outline-gold md:h-auto md:pb-1',
        isActive && 'border-gold font-semibold text-[#F4D58D] hover:text-[#F4D58D]',
      )}
    >
      {t(link.key)}
    </NavLink>
  ));
}

export default function AppNavbar() {
  const { user, logout, switchTo, switching } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  async function handleSwitch(account) {
    try {
      const next = await switchTo(account.email);
      notify({ variant: 'success', title: t('header.switched', { name: next.name }), body: t(`demo.${account.key}`) });
      navigate(homeFor(next.role));
    } catch (error) {
      notify({ variant: 'danger', title: t('header.switchFailed'), body: apiError(error).message });
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-ink text-[#EDEFE4]">
      <div className="mx-auto flex max-w-[1320px] items-center gap-4 px-4 py-3 md:gap-9 sm:px-8 md:py-[18px] lg:px-12">
        <NavLink to={homeFor(user.role)} aria-label="ProbashiShield" className="rounded-md focus-visible:outline-2 focus-visible:outline-gold"><Brand /></NavLink>
        <nav className="hidden items-center gap-7 md:flex" aria-label={t('nav.main')}><NavItems role={user.role} /></nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-5">
          <LanguageToggle tone="dark" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-11 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-gold" aria-label={t('header.menu')}>
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#1F6B4C] font-heading text-[13px] font-bold">{initials(user.name)}</span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[13px] font-semibold">{user.name}</span>
                <span className="block text-[11px] text-[#9FB3A7]">{t(`role.${user.role}`)}</span>
              </span>
              {switching ? <Spinner /> : <ChevronsUpDown className="hidden size-4 text-[#9FB3A7] sm:block" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t('header.switch')}</DropdownMenuLabel>
                {DEMO_ACCOUNTS.map(account => (
                  <DropdownMenuItem key={account.email} disabled={account.email === user.email} onClick={() => handleSwitch(account)}>
                    <Avatar size="sm"><AvatarFallback>{initials(account.name)}</AvatarFallback></Avatar>
                    <span className="flex-1 truncate">{account.name}</span>
                    <RoleBadge role={account.role} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}><UserRound />{t('nav.profile')}</DropdownMenuItem>
              <DropdownMenuItem onClick={logout}><LogOut />{t('header.logout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <nav className="flex gap-6 overflow-x-auto border-t border-white/10 px-4 sm:px-8 md:hidden" aria-label={t('nav.main')}><NavItems role={user.role} /></nav>
    </header>
  );
}
