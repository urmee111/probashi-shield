import { useI18n } from '@/i18n';
import { Field } from '@/components/shared';
import { Checkbox } from '@/components/forensics/Checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AMOUNT_FIELDS, TEXT_FIELDS } from './fields';

// Shared editor for manual entry and blurry-extraction confirmation.
export default function DocumentFields({ idPrefix, fields, onChange, showBlurry = true }) {
  const { t } = useI18n();
  const set = key => event => onChange({ ...fields, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TEXT_FIELDS.map(([key, placeholder]) => (
        <Field key={key} id={`${idPrefix}-${key}`} label={t(`field.${key}`)}>
          <Input id={`${idPrefix}-${key}`} value={fields[key]} placeholder={placeholder} onChange={set(key)} />
        </Field>
      ))}
      {AMOUNT_FIELDS.map(key => (
        <Field key={key} id={`${idPrefix}-${key}`} label={t(`field.${key}`)}>
          <Input id={`${idPrefix}-${key}`} inputMode="decimal" value={fields[key]} onChange={set(key)} />
        </Field>
      ))}
      <Field id={`${idPrefix}-salary-clause`} label={t('field.salaryClause')}>
        <NativeSelect id={`${idPrefix}-salary-clause`} className="w-full" value={fields.has_salary_clause} onChange={set('has_salary_clause')}>
          <NativeSelectOption value="">{t('field.unknown')}</NativeSelectOption>
          <NativeSelectOption value="yes">{t('field.present')}</NativeSelectOption>
          <NativeSelectOption value="no">{t('field.missing')}</NativeSelectOption>
        </NativeSelect>
      </Field>
      {showBlurry && (
        <div className="flex items-end pb-1.5">
          <Checkbox id={`${idPrefix}-blurry`} label={t('field.blurry')} checked={fields.is_blurry_or_unclear} onChange={set('is_blurry_or_unclear')} />
        </div>
      )}
    </div>
  );
}
