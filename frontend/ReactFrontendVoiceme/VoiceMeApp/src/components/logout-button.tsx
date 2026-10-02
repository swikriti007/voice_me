import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { clearSession } from '@/constants/session';

const CONFIRM_TITLE = 'लगआउट (Logout)';
const CONFIRM_MESSAGE = 'के तपाईं लगआउट गर्न चाहनुहुन्छ?\n(Do you want to log out?)';

// Signs out of the current account and returns to Login, where the email is
// pre-filled and only the password needs typing again.
export function LogoutButton() {
  const logout = async () => {
    await clearSession().catch(() => {});
    router.replace('/Loginpage');
  };

  const handlePress = () => {
    try {
      Haptics.selectionAsync();
    } catch {}

    // Alert buttons don't render on web, so fall back to the browser dialog.
    if (Platform.OS === 'web') {
      if (window.confirm(`${CONFIRM_TITLE}\n\n${CONFIRM_MESSAGE}`)) logout();
      return;
    }
    Alert.alert(CONFIRM_TITLE, CONFIRM_MESSAGE, [
      { text: 'रद्द (Cancel)', style: 'cancel' },
      { text: 'लगआउट (Logout)', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Log out"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <Text style={styles.text}>लगआउट · Logout</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FDECEA',
    borderColor: '#E7B2AB',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    color: '#C02C1D',
    fontWeight: '700',
    fontSize: 13,
  },
});
