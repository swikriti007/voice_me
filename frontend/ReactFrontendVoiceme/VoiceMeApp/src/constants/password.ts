// Password policy for new passwords (sign-up and reset). The backend enforces
// the same rules. Login does NOT use this: older accounts may have passwords
// created before the policy existed.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 14;

export const PASSWORD_RULES_MESSAGE =
  'पासवर्ड ८–१४ अक्षर, कम्तिमा १ ठूलो, १ सानो अक्षर र १ विशेष चिन्ह (8–14 characters with an uppercase, a lowercase and a special character)';

export type PasswordRule = {
  key: 'length' | 'upper' | 'lower' | 'special';
  label: string;
  test: (pw: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: 'length',
    label: '८–१४ अक्षर (8–14 characters)',
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH && pw.length <= PASSWORD_MAX_LENGTH,
  },
  { key: 'upper', label: '१ ठूलो अक्षर (1 uppercase A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', label: '१ सानो अक्षर (1 lowercase a-z)', test: (pw) => /[a-z]/.test(pw) },
  {
    key: 'special',
    label: '१ विशेष चिन्ह (1 special character, e.g. @ # !)',
    // Anything that is not a letter or digit counts as special.
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

// Every rule with whether `pw` satisfies it, for a live checklist in the UI.
export const getPasswordChecks = (pw: string) =>
  PASSWORD_RULES.map((rule) => ({ key: rule.key, label: rule.label, met: rule.test(pw) }));

// Only the rules `pw` does not satisfy yet (empty array means valid).
export const getUnmetPasswordRules = (pw: string) => PASSWORD_RULES.filter((rule) => !rule.test(pw));

export const isValidPassword = (pw: string): boolean => getUnmetPasswordRules(pw).length === 0;
