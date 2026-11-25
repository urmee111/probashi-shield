import { useState } from 'react';
import { DEMO_ACCOUNTS, apiError } from '@/api';
import { useAuth } from '@/auth';
import { useI18n } from '@/i18n';
import Brand from '@/components/Brand';
import LanguageToggle from '@/components/LanguageToggle';
import ThemeToggle from '@/components/ThemeToggle';
import { initials } from '@/components/AppNavbar';
import { ErrorAlert, Field, Spinner } from '@/components/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const { login, register, switchTo, switching } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const update = field => event => setForm(current => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
    } catch (failure) {
      setError(apiError(failure));
      setBusy(false);
    }
  }

  async function quickLogin(email) {
    setError(null);
    try {
      await switchTo(email);
    } catch (failure) {
      setError(apiError(failure));
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Brand subtitle={false} tone="light" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('login.welcome')}</h1>
            <p className="text-sm text-muted-foreground">{t('login.tagline')}</p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-5">
            <Tabs value={mode} onValueChange={value => { setMode(value); setError(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="login">{t('login.signIn')}</TabsTrigger>
                <TabsTrigger value="register">{t('login.register')}</TabsTrigger>
              </TabsList>
            </Tabs>

            <ErrorAlert error={error} className="mb-0" />
            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <Field id="name" label={t('login.name')}>
                  <Input id="name" required maxLength={150} value={form.name} onChange={update('name')} autoComplete="name" />
                </Field>
              )}
              <Field id="email" label={t('login.email')}>
                <Input id="email" type="email" required value={form.email} onChange={update('email')} autoComplete="email" placeholder="you@example.com" />
              </Field>
              <Field id="password" label={t('login.password')} hint={mode === 'register' ? t('login.passwordHint') : undefined}>
                <Input
                  id="password" type="password" required minLength={mode === 'register' ? 8 : 1}
                  value={form.password} onChange={update('password')}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Field>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy && <Spinner />}{mode === 'login' ? t('login.signIn') : t('login.create')}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />{t('login.orDemo')}<span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map(account => (
                <Button
                  key={account.email} type="button" variant="outline" disabled={Boolean(switching)}
                  className="h-auto justify-start gap-2.5 px-3 py-2.5" onClick={() => quickLogin(account.email)}
                  title={t(`demo.blurb.${account.key}`)}
                >
                  <Avatar size="sm"><AvatarFallback>{initials(account.name)}</AvatarFallback></Avatar>
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block truncate text-sm font-medium">{account.name.split(' ')[0]}</span>
                    <span className="block text-xs text-muted-foreground">{t(`demo.${account.key}`)}</span>
                  </span>
                  {switching === account.email && <Spinner className="ml-auto" />}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">{t('login.footer')}</p>
      </div>
    </main>
  );
}
