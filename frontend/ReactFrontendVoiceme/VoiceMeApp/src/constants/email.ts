// Accounts must use a Gmail address (e.g. "name@gmail.com"); the backend
// enforces the same rule, so a bare "name@" is rejected on both sides.
const GMAIL_RE = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

export const isValidGmail = (email: string): boolean => GMAIL_RE.test(email.trim());

// The last email that logged in or registered on this device, pre-filled on
// the Login screen so only the password has to be typed.
export const LAST_EMAIL_KEY = 'voiceme.lastEmail';

export const INVALID_EMAIL_MESSAGE =
  'अमान्य इमेल। कृपया Gmail ठेगाना प्रयोग गर्नुहोस् (Invalid email — use example@gmail.com)';
