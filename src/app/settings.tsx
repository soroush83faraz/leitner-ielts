import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chips';
import { Banner } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { MAX_DAILY_NEW_TARGET, MIN_DAILY_NEW_TARGET } from '@/constants/leitner';
import { clearAllData, importBackup, type ImportReport } from '@/database/repositories/backupRepo';
import { BACKUP_ERROR_FA } from '@/features/backup/schema';
import { ByokSection } from '@/features/settings/ByokSection';
import { DEFAULT_PREFERENCES } from '@/features/settings/preferences';
import { clearOwnKey, useAiConfigured } from '@/services/ai';
import { exportBackupFile, pickBackupFile } from '@/services/backupFiles';
import { disableDailyReminder, enableDailyReminder, remindersSupported } from '@/services/reminders';
import { useApp } from '@/state/AppProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { confirmAsync } from '@/utils/confirm';
import { toPersianDigits } from '@/utils/text';

const THEMES = [
  { key: 'system', label: 'مطابق دستگاه' },
  { key: 'light', label: 'روشن' },
  { key: 'dark', label: 'تیره' },
] as const;
const HOURS = [7, 9, 12, 18, 20, 21];

type Msg = { kind: 'success' | 'danger' | 'info' | 'warn'; text: string } | null;

export default function SettingsScreen() {
  const { db, prefs, updatePrefs, bump, now } = useApp();
  const aiOn = useAiConfigured();
  const { colors } = useTheme();
  const [backupMsg, setBackupMsg] = useState<Msg>(null);
  const [reminderMsg, setReminderMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'clear' | null>(null);

  const setTarget = (n: number) => updatePrefs({ dailyNewTarget: Math.min(MAX_DAILY_NEW_TARGET, Math.max(MIN_DAILY_NEW_TARGET, n)) });

  const toggleReminder = async (on: boolean) => {
    setReminderMsg(null);
    if (!on) {
      await disableDailyReminder();
      await updatePrefs({ reminderEnabled: false });
      return;
    }
    const ok = await confirmAsync({
      title: 'یادآور روزانه',
      message: 'برنامه یک اعلان محلی روزانه در ساعتی که انتخاب می‌کنید نشان می‌دهد. برای این کار باید اجازه‌ی اعلان بدهید. هیچ داده‌ای به جایی ارسال نمی‌شود.',
      confirmLabel: 'ادامه و درخواست اجازه',
    });
    if (!ok) return;
    const res = await enableDailyReminder(prefs.reminderHour, prefs.reminderMinute);
    if (res.ok) {
      await updatePrefs({ reminderEnabled: true });
      setReminderMsg({ kind: 'success', text: `یادآور هر روز ساعت ${toPersianDigits(String(prefs.reminderHour).padStart(2, '0'))}:${toPersianDigits(String(prefs.reminderMinute).padStart(2, '0'))} فعال شد.` });
    } else {
      setReminderMsg({
        kind: 'warn',
        text: res.reason === 'denied' ? 'اجازه‌ی اعلان داده نشد. می‌توانید آن را از تنظیمات سیستم فعال کنید.' : 'فعال‌سازی یادآور انجام نشد.',
      });
    }
  };

  const setHour = async (h: number) => {
    await updatePrefs({ reminderHour: h });
    if (prefs.reminderEnabled) await enableDailyReminder(h, prefs.reminderMinute);
  };

  const doExport = async () => {
    setBusy('export');
    setBackupMsg(null);
    const res = await exportBackupFile(db, now());
    setBusy(null);
    setBackupMsg(
      res.ok
        ? { kind: 'success', text: `پشتیبان با ${toPersianDigits(res.counts.vocabulary)} کارت و ${toPersianDigits(res.counts.reviews)} مرور آماده شد. فایل را جایی امن نگه دارید.` }
        : { kind: 'danger', text: res.message },
    );
  };

  const doImport = async () => {
    setBusy('import');
    setBackupMsg(null);
    try {
      const picked = await pickBackupFile();
      if (picked.kind === 'cancelled') return;
      if (picked.kind === 'error') {
        const text = picked.message in BACKUP_ERROR_FA ? BACKUP_ERROR_FA[picked.message as keyof typeof BACKUP_ERROR_FA] : picked.message;
        return setBackupMsg({ kind: 'danger', text: `${text} هیچ داده‌ای تغییر نکرد.` });
      }
      const d = picked.parsed.backup.data;
      const ok = await confirmAsync({
        title: 'بازیابی از پشتیبان؟',
        message: `${toPersianDigits(d.vocabulary.length)} کارت و ${toPersianDigits(d.reviewLogs.length)} مرور در فایل «${picked.name}» پیدا شد. موارد جدید به داده‌های فعلی اضافه می‌شوند؛ کارت تکراری رد می‌شود و چیزی جایگزین یا ادغام نمی‌شود.`,
        confirmLabel: 'افزودن به داده‌های من',
      });
      if (!ok) return;
      const report: ImportReport = await importBackup(db, picked.parsed.backup, { applyPreferences: false });
      bump();
      setBackupMsg({
        kind: 'success',
        text: `${toPersianDigits(report.vocabularyAdded)} کارت اضافه شد؛ ${toPersianDigits(report.skippedSameId + report.skippedDuplicateTerm)} کارت تکراری رد شد. ${toPersianDigits(report.reviewLogsAdded)} مرور و ${toPersianDigits(report.practiceAdded)} تمرین افزوده شد.`,
      });
    } catch {
      setBackupMsg({ kind: 'danger', text: 'بازیابی انجام نشد و داده‌های فعلی شما سالم ماند.' });
    } finally {
      setBusy(null);
    }
  };

  const doClear = async () => {
    const ok = await confirmAsync({
      title: 'پاک کردن همه‌ی داده‌ها؟',
      message: 'همه‌ی کارت‌ها، جعبه‌ها، تاریخچه‌ی مرور و تمرین، تنظیمات و کلید API ذخیره‌شده از این دستگاه پاک می‌شود و برگشت‌پذیر نیست. قبلش پشتیبان بگیرید.',
      confirmLabel: 'پاک کردن همه',
      destructive: true,
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await disableDailyReminder();
      await clearOwnKey();
      await clearAllData(db);
      await updatePrefs(DEFAULT_PREFERENCES);
      bump();
      setBackupMsg({ kind: 'success', text: 'همه‌ی داده‌ها پاک شد.' });
    } catch {
      setBackupMsg({ kind: 'danger', text: 'پاک کردن انجام نشد.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="تنظیمات" back>
      <View style={styles.section}>
        <Text variant="heading">هدف روزانه</Text>
        <Text tone="muted">تعداد واژه‌ی تازه در روز. مرورها به این هدف محدود نیستند.</Text>
        <View style={styles.stepper}>
          <IconButton icon="minus" label="کم کردن هدف" onPress={() => setTarget(prefs.dailyNewTarget - 1)} disabled={prefs.dailyNewTarget <= MIN_DAILY_NEW_TARGET} />
          <Text variant="title" accessibilityLiveRegion="polite" accessibilityLabel={`${prefs.dailyNewTarget} واژه در روز`}>
            {toPersianDigits(prefs.dailyNewTarget)}
          </Text>
          <IconButton icon="plus" label="زیاد کردن هدف" onPress={() => setTarget(prefs.dailyNewTarget + 1)} disabled={prefs.dailyNewTarget >= MAX_DAILY_NEW_TARGET} />
          <Text tone="muted">واژه در روز</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="heading">ظاهر</Text>
        <ChipRow>
          {THEMES.map((t) => (
            <Chip key={t.key} label={t.label} selected={prefs.theme === t.key} onPress={() => updatePrefs({ theme: t.key })} />
          ))}
        </ChipRow>
        <Text variant="caption" tone="muted">زبان رابط: فارسی (در این نسخه زبان دیگری نیست).</Text>
      </View>

      <View style={styles.section}>
        <Text variant="heading">یادآور</Text>
        {remindersSupported ? (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.flex}>یادآور روزانه‌ی مرور</Text>
              <Switch
                value={prefs.reminderEnabled}
                onValueChange={toggleReminder}
                accessibilityLabel="یادآور روزانه‌ی مرور"
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
              />
            </View>
            {prefs.reminderEnabled ? (
              <ChipRow>
                {HOURS.map((h) => (
                  <Chip key={h} label={`${toPersianDigits(String(h).padStart(2, '0'))}:۰۰`} selected={prefs.reminderHour === h && prefs.reminderMinute === 0} onPress={() => { void updatePrefs({ reminderMinute: 0 }).then(() => setHour(h)); }} />
                ))}
              </ChipRow>
            ) : null}
            {reminderMsg ? <Banner kind={reminderMsg.kind} text={reminderMsg.text} /> : null}
          </>
        ) : (
          <Text tone="muted">یادآور در نسخه‌ی وب پشتیبانی نمی‌شود.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="heading">هوش مصنوعی</Text>
        {!aiOn ? (
          <Banner kind="warn" text="هوش مصنوعی وصل نیست؛ ساخت کارت پیشنهادی، استخراج از متن و بازخورد نوشتن کار نمی‌کنند. مرور، فهرست، تمرین خواندن و شنیدن بدون آن کار می‌کنند." />
        ) : null}
        <ByokSection />
        {prefs.aiDisclosureAccepted ? (
          <Button label="پس گرفتن موافقت ارسال به هوش مصنوعی" variant="quiet" block={false} onPress={() => updatePrefs({ aiDisclosureAccepted: false })} />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text variant="heading">پشتیبان‌گیری</Text>
        <Text tone="muted">داده‌های شما فقط روی همین دستگاه است و همگام‌سازی ابری ندارد. برای انتقال یا نگهداری، فایل JSON پشتیبان بگیرید.</Text>
        <Button label="گرفتن پشتیبان" icon="upload" variant="secondary" loading={busy === 'export'} disabled={busy !== null} onPress={doExport} />
        <Button label="بازیابی از فایل پشتیبان" icon="download" variant="secondary" loading={busy === 'import'} disabled={busy !== null} onPress={doImport} />
        {backupMsg ? <Banner kind={backupMsg.kind} text={backupMsg.text} /> : null}
      </View>

      <View style={styles.section}>
        <Text variant="heading">پاک کردن داده‌ها</Text>
        <Button label="پاک کردن همه‌ی داده‌ها" icon="trash-2" variant="danger" loading={busy === 'clear'} disabled={busy !== null} onPress={doClear} />
      </View>

      <Button label="بازگشت" variant="quiet" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
