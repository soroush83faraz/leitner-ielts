import type { Preferences } from '@/features/settings/preferences';
import { confirmAsync } from '@/utils/confirm';

/**
 * The first time anything is sent to the AI provider the user must agree once.
 * Resolves true if they have agreed (now or before).
 */
export async function ensureAiConsent(prefs: Preferences, updatePrefs: (p: Partial<Preferences>) => Promise<void>, what: string): Promise<boolean> {
  if (prefs.aiDisclosureAccepted) return true;
  const ok = await confirmAsync({
    title: 'ارسال به سرویس هوش مصنوعی',
    message: `${what} برای پردازش به سرور برنامه و از آنجا به یک ارائه‌دهنده‌ی هوش مصنوعی ارسال می‌شود. چیزی در سرور ذخیره نمی‌شود و کارت‌های شما فقط روی همین دستگاه می‌مانند. ادامه می‌دهید؟`,
    confirmLabel: 'موافقم، ادامه',
  });
  if (ok) await updatePrefs({ aiDisclosureAccepted: true });
  return ok;
}
