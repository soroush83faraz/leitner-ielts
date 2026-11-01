import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/Button';
import { Banner } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { createVocabulary } from '@/database/repositories/vocabularyRepo';
import { CardForm } from '@/features/vocabulary/CardForm';
import { DuplicateWarning, useDuplicates } from '@/features/vocabulary/DuplicateWarning';
import { emptyForm, formToInput, validateForm, type CardFormState, type FormErrors } from '@/features/vocabulary/formModel';
import { useApp } from '@/state/AppProvider';
import { useDiscardGuard } from '@/state/useDiscardGuard';

export default function ManualAdd() {
  const { db, now, bump } = useApp();
  const [form, setForm] = useState<CardFormState>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [separate, setSeparate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const hits = useDuplicates(form.term);

  const dirty = !!(form.term || form.meaningFa || form.sourceSentence) && !saving;
  const { allowLeave } = useDiscardGuard(dirty);
  const incomplete = !form.meaningFa.trim();
  const blockedByDuplicate = hits.length > 0 && !separate;

  const save = async (another: boolean) => {
    const e = validateForm(form);
    setErrors(e);
    if (e.term || blockedByDuplicate || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createVocabulary(db, formToInput(form), now());
      bump();
      if (another) {
        setSaved(form.term.trim());
        setForm(emptyForm());
        setSeparate(false);
      } else {
        allowLeave();
        if (Platform.OS !== 'web' && router.canGoBack()) router.back();
        else router.replace('/vocabulary');
      }
    } catch {
      setSaveError('ذخیره انجام نشد. آنچه نوشته‌اید حفظ شده؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="افزودن دستی"
      back
      footer={
        <>
          <Button
            label={incomplete ? 'ذخیره به‌صورت ناقص' : 'ذخیره'}
            icon="check"
            loading={saving}
            disabled={blockedByDuplicate}
            onPress={() => save(false)}
            hint={blockedByDuplicate ? 'ابتدا هشدار تکراری بودن را بررسی کنید' : undefined}
          />
          <Button label="ذخیره و واژه‌ی بعدی" variant="secondary" disabled={saving || blockedByDuplicate} onPress={() => save(true)} />
        </>
      }
    >
      {saved ? <Banner kind="success" text={`«${saved}» ذخیره شد و در جعبه‌ی ۱ قرار گرفت.`} /> : null}
      {saveError ? <Banner kind="danger" text={saveError} /> : null}
      <CardForm value={form} onChange={setForm} errors={errors} />
      <DuplicateWarning hits={hits} confirmed={separate} onConfirmedChange={setSeparate} />
      {incomplete && form.term.trim() ? <Banner kind="info" text="معنی فارسی خالی است؛ کارت ذخیره می‌شود ولی در فهرست با برچسب «ناقص» دیده می‌شود تا بعداً کاملش کنید." /> : null}
    </Screen>
  );
}
