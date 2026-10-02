import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_TOKEN_KEY = 'voiceme.authToken';
export const AUTH_USER_KEY = 'voiceme.user';
export const SELECTED_ROLE_KEY = 'voiceme.selectedRole';

// Cached details of whoever is signed in on this device. Cleared on login
// and logout so the next account never shows the previous person's info.
// voiceme.lastEmail is deliberately kept so Login can pre-fill it.
export const CACHED_PROFILE_KEYS = [
  'voiceme.registeredName',
  'voiceme.registeredAge',
  'voiceme.registeredAvatar',
  'voiceme.parentName',
  'voiceme.emergencyPhone',
  'voiceme.doctorName',
  'voiceme.doctorPhone',
  'voiceme.caregiverName',
  'voiceme.caregiverPhone',
  'voiceme.caregiverEmail',
  'voiceme.currentRole',
  'voiceme.bellActive',
  'voiceme.daily_routine_state',
];

export const clearSession = () =>
  AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY, SELECTED_ROLE_KEY, ...CACHED_PROFILE_KEYS]);
