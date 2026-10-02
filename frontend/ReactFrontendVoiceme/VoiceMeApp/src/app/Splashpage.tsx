import React, { useEffect } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_EMAIL_KEY } from '@/constants/email';

const AUTH_TOKEN_KEY = 'voiceme.authToken';

// Every app start asks for the password again (the email is pre-filled on
// the Login screen); only a device that has never signed in goes to Register.
async function goToNextScreen() {
  const [[, authToken], [, lastEmail]] = await AsyncStorage.multiGet([AUTH_TOKEN_KEY, LAST_EMAIL_KEY]);
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY).catch(() => {});
  router.replace(authToken || lastEmail ? '/Loginpage' : '/Registerpage');
}

export default function Splashpage() {
  const handlePress = () => {
    goToNextScreen();
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      goToNextScreen();
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#C96F38" />
      <Pressable
        accessibilityLabel="Voice Me - Tap to enter"
        accessibilityRole="button"
        onPress={handlePress}
        style={({ pressed }) => [styles.content, pressed && styles.pressedContent]}
      >
        {/* Decorative central logo emblem */}
        <View style={styles.logoBadge}>
          <Text style={styles.badgeEmoji}>🎙️</Text>
        </View>

        <View accessibilityLabel="Voice Me logo" style={styles.titleContainer}>
          <Text style={styles.logoText}>Voice Me</Text>
          <Text style={styles.nepaliTagline}>आवाज मेरो साथी</Text>
          <Text style={styles.tagline}>One tap opens Voice Me</Text>
        </View>

        <View style={styles.bottomPrompt}>
          <View style={styles.continueButton}>
            <Text style={styles.tapPrompt}>सुरु गर्नुहोस् · Tap to Start</Text>
            <Text style={styles.arrowIcon}>→</Text>
          </View>
        </View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C96F38',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pressedContent: {
    opacity: 0.92,
  },
  logoBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 241, 229, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 241, 229, 0.4)',
  },
  badgeEmoji: {
    fontSize: 42,
  },
  titleContainer: {
    alignItems: 'center',
  },
  logoText: {
    color: '#FFF1E5',
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  nepaliTagline: {
    color: '#FFE4CF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  tagline: {
    color: '#FFF1E5',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.85,
  },
  bottomPrompt: {
    position: 'absolute',
    bottom: 44,
    alignItems: 'center',
    width: '100%',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 241, 229, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 241, 229, 0.4)',
    columnGap: 8,
  },
  tapPrompt: {
    color: '#FFF1E5',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  arrowIcon: {
    color: '#FFF1E5',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
