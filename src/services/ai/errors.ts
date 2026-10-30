import type { AiErrorCode } from '../../../supabase/functions/_shared/contracts';

export type { AiErrorCode };

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message ?? code);
    this.name = 'AiError';
  }
}

/** User-facing Persian messages. They never include provider details or user text. */
export const AI_ERROR_FA: Record<AiErrorCode, string> = {
  not_configured: 'سرویس هوش مصنوعی روی این نسخه تنظیم نشده است. می‌توانید بدون آن، دستی کارت بسازید.',
  offline: 'اتصال اینترنت برقرار نیست. متن شما نگه داشته شده؛ بعداً دوباره تلاش کنید.',
  timeout: 'پاسخ دیر رسید. متن شما نگه داشته شده؛ دوباره تلاش کنید.',
  rate_limited: 'تعداد درخواست‌ها از حد مجاز گذشته است. کمی بعد دوباره تلاش کنید.',
  unauthorized: 'اتصال به سرویس ممکن نشد (احراز هویت). کمی بعد دوباره تلاش کنید.',
  too_large: 'ورودی بزرگ‌تر از حد مجاز است.',
  bad_request: 'ورودی معتبر نیست؛ آن را بررسی کنید.',
  invalid_response: 'پاسخ سرویس قابل‌استفاده نبود. دوباره تلاش کنید؛ ورودی شما حفظ شده است.',
  provider_error: 'سرویس هوش مصنوعی موقتاً در دسترس نیست. دوباره تلاش کنید.',
  server_error: 'خطای سرور. دوباره تلاش کنید.',
};

export function describeAiError(e: unknown): { code: AiErrorCode; message: string } {
  if (e instanceof AiError) return { code: e.code, message: AI_ERROR_FA[e.code] };
  return { code: 'server_error', message: AI_ERROR_FA.server_error };
}

/** Errors worth offering a "try again" button for. */
export function isRetryableAiError(code: AiErrorCode): boolean {
  return ['offline', 'timeout', 'rate_limited', 'provider_error', 'server_error', 'invalid_response', 'unauthorized'].includes(code);
}
