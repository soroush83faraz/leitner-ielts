import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/Button';
import { Banner, StateView } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { getVocabulary, updateVocabulary } from '@/database/repositories/vocabularyRepo';
import { CardForm } from '@/features/vocabulary/CardForm';
import { DuplicateWarning, useDuplicates } from '@/features/vocabulary/DuplicateWarning';
import { formFromEntry, formToInput, validateForm, type CardFormState, type FormErrors } from '@/features/vocabulary/formModel';
import { useApp } from '@/state/AppProvider';
import { useDiscardGuard } from '@/state/useDiscardGuard';

export default function EditWord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, now, bump } = useApp();
  const [initial, setInitial] = useState<CardFormState | null>(null);
  const [form, setForm] = useState<CardFormState | null>(null);
  const [missing, setMissing] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [separate, setSeparate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hits = useDuplicates(form?.term ?? '', String(id));

  useEffect(() => {
    getVocabulary(db, String(id)).then((v) => {
      if (!v) return setMissing(true);
      const f = formFromEntry(v.entry);
      setInitial(f);
      setForm(f);
    });
  }, [db, id]);

  const dirty = !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial) && !saving;
  const { allowLeave } = useDiscardGuard(dirty);
  // A term that was already a duplicate before editing is not re-warned unless the term changed.
  const termChanged = !!form && !!initial && form.term.trim().toLowerCase() !== initial.term.trim().toLowerCase();
  const blocked = termChanged && hits.length > 0 && !separate;

  if (missing) {
    return (
      <Screen title="ویرایش" back>
        <StateView kind="empty" title="این کارت پیدا نشد" />
      </Screen>
    );
  }
  if (!form) {
    return (
      <Screen title="ویرایش" back>
        <StateView kind="loading" />
      </Screen>
    );
  }

  const save = async () => {
    const e = validateForm(form);
    setErrors(e);
    if (e.term || blocked || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateVocabulary(db, String(id), formToInput(form), now());
      bump();
      allowLeave();
      if (Platform.OS !== 'web' && router.canGoBack()) router.back();
      else router.replace('/vocabulary');
    } catch {
      setSaveError('ذخیره انجام نشد. تغییرات شما حفظ شده؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="ویرایش کارت" back footer={<Button label="ذخیره‌ی تغییرات" icon="check" loading={saving} disabled={!dirty || blocked} onPress={save} />}>
      {saveError ? <Banner kind="danger" text={saveError} /> : null}
      <Banner kind="info" text="ویرایش محتوای کارت، جعبه و تاریخچه‌ی مرور آن را تغییر نمی‌دهد." />
      <CardForm value={form} onChange={setForm} errors={errors} />
      {termChanged ? <DuplicateWarning hits={hits} confirmed={separate} onConfirmedChange={setSeparate} /> : null}
    </Screen>
  );
}
