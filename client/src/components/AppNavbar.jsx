import { ChevronsUpDown, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { DEMO_ACCOUNTS, apiError } from '@/api';
import { homeFor, useAuth } from '@/auth';
import { useI18n } from '@/i18n';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
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
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'shrink-0 text-muted-foreground',
        isActive && 'bg-muted text-foreground',
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
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <NavLink to={homeFor(user.role)} aria-label="ProbashiShield"><Brand /></NavLink>
        <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.main')}><NavItems role={user.role} /></nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost' }), 'h-10 gap-2.5 px-2')} aria-label={t('header.menu')}>
              <Avatar size="sm"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-muted-foreground">{t(`role.${user.role}`)}</span>
              </span>
              {switching ? <Spinner /> : <ChevronsUpDown className="size-4 text-muted-foreground" />}
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
              <DropdownMenuItem onClick={logout}><LogOut />{t('header.logout')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t px-4 py-1.5 md:hidden" aria-label={t('nav.main')}><NavItems role={user.role} /></nav>
    </header>
  );
}
