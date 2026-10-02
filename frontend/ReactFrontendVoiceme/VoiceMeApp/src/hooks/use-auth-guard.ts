import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY } from '@/constants/session';

// Screens reachable without being signed in. The sign-up chain
// (Registerpage -> RoleSelectionpage -> Child/CaregiverRegistrationPage) is
// public too; those screens read the token Registerpage saved themselves.
const PUBLIC_ROUTES = new Set(
  [
    'index',
    'Splashpage',
    'Loginpage',
    'Registerpage',
    'RoleSelectionpage',
    'ChildRegistrationPage',
    'CaregiverRegistrationPage',
    'Forgotpasswordpage',
    'Deleteaccountpage',
  ].map((name) => name.toLowerCase())
);

const isPublicPath = (pathname: string): boolean => {
  const first = pathname.split('?')[0].split('/').filter(Boolean)[0] ?? 'index';
  return PUBLIC_ROUTES.has(first.toLowerCase());
};

// After logout (or once Login has cleared the session), Back — Android
// hardware back, browser back, iOS swipe — must not land on a dashboard.
// On every route change, a protected screen without a saved token is
// replaced by Login.
export function useAuthGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || isPublicPath(pathname)) return;

    let cancelled = false;
    AsyncStorage.getItem(AUTH_TOKEN_KEY)
      .catch(() => null)
      .then((token) => {
        if (!cancelled && !token) router.replace('/Loginpage');
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);
}
