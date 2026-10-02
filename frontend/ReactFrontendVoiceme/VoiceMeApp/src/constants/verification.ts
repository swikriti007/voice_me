// 6-digit codes the backend emails for sign-up verification and password reset.
export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;

export const isValidCode = (code: string): boolean => /^\d{6}$/.test(code.trim());

// Keep only digits, capped at the code length (for the code input's onChangeText).
export const sanitizeCode = (text: string): string => text.replace(/\D/g, '').slice(0, CODE_LENGTH);

// Seconds to wait from a 429 response's `retry_after`, else the default cooldown.
export const retryAfterSeconds = (data: any): number => {
  const value = Number(data?.retry_after);
  return Number.isFinite(value) && value > 0 ? value : RESEND_COOLDOWN_SECONDS;
};

export const CODE_REQUIRED_MESSAGE =
  'कृपया इमेलमा आएको ६ अंकको कोड राख्नुहोस् (Please enter the 6-digit code from your email)';

export const CHECK_INBOX_MESSAGE =
  'तपाईंको Gmail इनबक्स (र Spam फोल्डर) मा ६ अंकको कोड हेर्नुहोस् (Check your Gmail inbox — and Spam — for the 6-digit code)';
