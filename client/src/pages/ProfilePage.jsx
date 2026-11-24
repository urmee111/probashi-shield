import { useEffect, useState } from 'react';
import { BellRing, Check, Languages, UserRound, UsersRound } from 'lucide-react';
import api, { apiError } from '@/api';
import { useAuth } from '@/auth';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { useI18n } from '@/i18n';
import { initials } from '@/components/AppNavbar';
import { ErrorAlert, Field, PageHeader, RoleBadge, Spinner, SwitchRow, Tone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// Preferences have no server table yet, so they are kept on this device only.
const PREFS_KEY = 'ps_profile_prefs';
const DEFAULT_PREFS = { inApp: true, paymentFreeze: true, nomineeCopy: true, sms: false, contactName: '', contactPhone: '' };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-pass/10 text-pass"><Icon className="size-4" aria-hidden="true" /></span>
      {children}
    </CardTitle>
  );
}

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [journeys, setJourneys] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/journeys')
      .then(({ data }) => setJourneys(data.journeys))
      .catch(failure => { setError(apiError(failure)); setJourneys([]); });
  }, []);

  function update(key, value) {
    setPrefs(current => {
      const next = { ...current, [key]: value };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function saveContact(event) {
    event.preventDefault();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    notify({ variant: 'success', title: t('profile.saved') });
  }

  const languages = [
    { value: 'en', label: 'English', hint: 'EN' },
    { value: 'bn', label: 'বাংলা', hint: 'বাং' },
  ];

  return (
    <>
      <PageHeader title={t('profile.title')} description={t('profile.description')} />
      <ErrorAlert error={error} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><SectionTitle icon={UserRound}>{t('profile.account')}</SectionTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#1F6B4C] font-heading text-lg font-bold text-card">{initials(user.name)}</span>
            <div className="min-w-0 space-y-1">
              <p className="font-heading text-lg font-bold">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <RoleBadge role={user.role} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle icon={Languages}>{t('profile.language')}</SectionTitle>
            <CardDescription>{t('profile.languageHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label={t('profile.language')} className="grid grid-cols-2 gap-3">
              {languages.map(option => (
                <button
                  key={option.value} type="button" role="radio" aria-checked={lang === option.value} lang={option.value}
                  onClick={() => setLang(option.value)}
                  className={cn('flex h-14 items-center justify-between rounded-xl border px-4 text-left transition-colors',
                    lang === option.value ? 'border-pass bg-pass/8 text-pass' : 'border-foreground/14 hover:bg-foreground/4')}
                >
                  <span>
                    <span className="block font-heading font-bold">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                  {lang === option.value && <Check className="size-5" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle icon={BellRing}>{t('profile.notifications')}</SectionTitle>
            <CardDescription>{t('profile.deviceOnly')}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-foreground/8">
            <SwitchRow id="pref-inapp" className="py-3" label={t('profile.prefInApp')} checked={prefs.inApp} onChange={value => update('inApp', value)} />
            <SwitchRow id="pref-freeze" className="py-3" label={t('profile.prefFreeze')} checked={prefs.paymentFreeze} onChange={value => update('paymentFreeze', value)} />
            <SwitchRow id="pref-nominee" className="py-3" label={t('profile.prefNominee')} checked={prefs.nomineeCopy} onChange={value => update('nomineeCopy', value)} />
            <SwitchRow id="pref-sms" className="py-3" label={t('profile.prefSms')} checked={prefs.sms} onChange={value => update('sms', value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle icon={UsersRound}>{t('profile.nominee')}</SectionTitle>
            <CardDescription>{t('profile.nomineeHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {journeys === null && <Spinner />}
            {journeys?.length === 0 && <p className="text-sm text-muted-foreground">{t('profile.noJourneys')}</p>}
            {journeys?.length > 0 && (
              <ul className="divide-y divide-foreground/8 rounded-xl border border-foreground/10">
                {journeys.map(({ journey }) => (
                  <li key={journey.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-semibold">#{journey.id} · {journey.country}</span>
                    <Tone tone={journey.nominee_id ? 'green' : 'muted'}>{journey.nominee_id ? t('profile.nomineeLinked') : t('profile.nomineeMissing')}</Tone>
                  </li>
                ))}
              </ul>
            )}
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveContact}>
              <Field id="contact-name" label={t('profile.contactName')}>
                <Input id="contact-name" autoComplete="off" maxLength={80} value={prefs.contactName} onChange={event => setPrefs(current => ({ ...current, contactName: event.target.value }))} />
              </Field>
              <Field id="contact-phone" label={t('profile.contactPhone')}>
                <Input id="contact-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={20} placeholder="01XXXXXXXXX" value={prefs.contactPhone} onChange={event => setPrefs(current => ({ ...current, contactPhone: event.target.value }))} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" className="h-11 w-full sm:w-auto">{t('profile.save')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
