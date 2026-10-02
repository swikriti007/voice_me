import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_PORT = 8000;

// Reuse the host the Expo dev server is running on (e.g. "10.59.51.108:8081"),
// so the app always reaches the Django backend on the same machine without a hardcoded IP.
const getBackendHost = (): string => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  // Android emulator maps the host machine's localhost to 10.0.2.2
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
};

// EXPO_PUBLIC_API_URL (e.g. http://192.168.1.5:8000) overrides the guess above.
// Needed with `npx expo start --tunnel`, where hostUri is the tunnel's public
// domain rather than this machine, so the backend isn't on it.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || `http://${getBackendHost()}:${BACKEND_PORT}`;
