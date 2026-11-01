import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chips';
import { Banner } from '@/components/Feedback';
import { Field } from '@/components/Field';
import { Text } from '@/components/Text';
import {
  BYOK_DEFAULTS,
  clearOwnKey,
  describeAiError,
  saveOwnKey,
  testByokConnection,
  useAiMode,
  useOwnKeySummary,
  validateByokConfig,
  type ByokProvider,
} from '@/services/ai';
import { space } from '@/theme/tokens';
import { confirmAsync } from '@/utils/confirm';

/**
 * Lets each learner connect THEIR OWN provider account. The key is tested once, then kept in the
 * device's secure storage only; it is never part of the database or of a backup file.
 */
export function ByokSection() {
  const mode = useAiMode();
  const own = useOwnKeySummary();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ByokProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(BYOK_DEFAULTS.anthropic.model);
  const [baseUrl, setBaseUrl] = useState(BYOK_DEFAULTS.openai.baseUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const pick = (p: ByokProvider) => {
    setProvider(p);
    setModel(BYOK_DEFAULTS[p].model);
  };

  const connect = async () => {
    const cfg = { provider, apiKey: apiKey.trim(), model: model.trim(), baseUrl: baseUrl.trim() };
    const problem = validateByokConfig(cfg);
    if (problem) return setMsg({ kind: 'danger', text: problem });
    setBusy(true);
    setMsg(null);
    try {
      await testByokConnection(cfg);
      await saveOwnKey(cfg);
      setApiKey('');
      setOpen(false);
      setMsg({ kind: 'success', text: 'متصل شد. از این به بعد قابلیت‌های هوش مصنوعی با حساب خودتان کار می‌کنند.' });
    } catch (e) {
      setMsg({ kind: 'danger', text: describeAiError(e).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync({
      title: 'حذف کلید؟',
      message: 'کلید از این دستگاه پاک می‌شود. کارت‌ها و تاریخچه‌ی شما تغییری نمی‌کند.',
      confirmLabel: 'حذف کلید',
      destructive: true,
    });
    if (!ok) return;
    await clearOwnKey();
    setMsg({ kind: 'success', text: 'کلید حذف شد.' });
  };

  return (
    <View style={styles.gap}>
      {mode === 'own-key' && own ? (
        <>
          <Banner kind="success" text={`متصل با کلید خودتان — ${BYOK_DEFAULTS[own.provider].label} · ${own.model} · ${own.keyHint}`} />
          <View style={styles.row}>
            <Button label="تغییر کلید" variant="secondary" compact block={false} onPress={() => setOpen((o) => !o)} />
            <Button label="حذف کلید" icon="trash-2" variant="danger" compact block={false} onPress={remove} />
          </View>
        </>
      ) : (
        <>
          <Text tone="muted">
            هر کاربر می‌تواند کلید API حساب خودش را وصل کند تا ساخت کارت، استخراج از متن، تمرین هوشمند و بازخورد نوشتن کار کنند. هزینه‌ی مصرف را همان ارائه‌دهنده از حساب شما برمی‌دارد.
          </Text>
          {!open ? <Button label="اتصال کلید API من" icon="key" variant="secondary" onPress={() => setOpen(true)} /> : null}
        </>
      )}

      {open ? (
        <View style={styles.gap}>
          <Text variant="label">ارائه‌دهنده</Text>
          <ChipRow>
            {(Object.keys(BYOK_DEFAULTS) as ByokProvider[]).map((p) => (
              <Chip key={p} label={BYOK_DEFAULTS[p].label} selected={provider === p} onPress={() => pick(p)} />
            ))}
          </ChipRow>
          <Field label="کلید API" ltr secureTextEntry autoComplete="off" value={apiKey} onChangeText={setApiKey} hint="فقط روی همین دستگاه و در حافظه‌ی امن نگه داشته می‌شود." />
          <Field label="مدل" ltr value={model} onChangeText={setModel} hint="برای کیفیت بهتر در فارسی یک مدل قوی انتخاب کنید." />
          {provider === 'openai' ? <Field label="نشانی سرویس (Base URL)" ltr value={baseUrl} onChangeText={setBaseUrl} hint="OpenAI، OpenRouter یا هر سرویس سازگار با OpenAI. باید https باشد." /> : null}
          <Banner
            kind="info"
            text="هنگام استفاده، واژه‌ها یا متنی که خودتان می‌فرستید مستقیم از گوشی به ارائه‌دهنده‌ی انتخابی شما می‌رود، نه به سرور این برنامه. کلید در فایل پشتیبان ذخیره نمی‌شود."
          />
          <Button label="آزمایش و ذخیره" icon="check" loading={busy} disabled={!apiKey.trim()} onPress={connect} hint="یک درخواست کوچک برای بررسی کلید ارسال می‌شود" />
        </View>
      ) : null}
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
});
