import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { INVALID_EMAIL_MESSAGE, LAST_EMAIL_KEY, isValidGmail } from '@/constants/email';
import { CACHED_PROFILE_KEYS, clearSession } from '@/constants/session';

const AUTH_TOKEN_KEY = 'voiceme.authToken';
const AUTH_USER_KEY = 'voiceme.user';
const REGISTERED_NAME_KEY = 'voiceme.registeredName';
const REGISTERED_AGE_KEY = 'voiceme.registeredAge';

const SELECTED_ROLE_KEY = 'voiceme.selectedRole';

const persistAuthSession = async (token: string, user: { id?: string; name?: string; email?: string; age?: string | number }) => {
  await AsyncStorage.multiRemove(CACHED_PROFILE_KEYS);
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (user?.email) {
    await AsyncStorage.setItem(LAST_EMAIL_KEY, String(user.email));
  }

  if (user?.name) {
    await AsyncStorage.setItem(REGISTERED_NAME_KEY, String(user.name));
  }
  if (user?.age !== undefined && user?.age !== null && user?.age !== '') {
    await AsyncStorage.setItem(REGISTERED_AGE_KEY, String(user.age));
  }
};

export default function Loginpage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Reaching Login (via Back, a menu item, Splash, ...) means signing out:
  // clear the token, user, role and cached profile so Back can't return to the
  // previous dashboard. LAST_EMAIL_KEY is kept so the email stays pre-filled.
  // This runs only when the screen gains focus; handleLogin waits for it to
  // finish before saving the new session, so it never wipes a fresh login.
  const clearingSession = useRef<Promise<unknown>>(Promise.resolve());
  useFocusEffect(
    useCallback(() => {
      clearingSession.current = clearSession().catch(() => {});
    }, [])
  );

  // Pre-fill the last email used on this device; the password is always typed.
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY)
      .then((saved) => {
        if (saved) setEmail((current) => current || saved);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async () => {
    setFormError('');

    const errors: typeof fieldErrors = {};
    if (!email.trim()) {
      errors.email = 'कृपया आफ्नो इमेल प्रविष्ट गर्नुहोस् (Please enter your email)';
    } else if (!isValidGmail(email)) {
      errors.email = INVALID_EMAIL_MESSAGE;
    }
    if (!password.trim()) {
      errors.password = 'कृपया आफ्नो पासवर्ड प्रविष्ट गर्नुहोस् (Please enter your password)';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(data?.error || 'Login failed. Please check your credentials.');
        return;
      }

      await clearingSession.current;
      await persistAuthSession(data.token, data.user || { email: email.trim() });

      // A caregiver account is one linked to a child via a connect code;
      // send it to its own dashboard instead of the child/parent home.
      let isCaregiver = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (res.ok) {
          isCaregiver = true;
          const child = await res.json();
          await AsyncStorage.multiSet([
            ['voiceme.caregiverName', child.caregiver?.name || ''],
            ['voiceme.caregiverPhone', child.caregiver?.phone || ''],
            ['voiceme.caregiverEmail', email.trim()],
            ['voiceme.currentRole', 'caregiver'],
          ]);
        }
      } catch {}

      await AsyncStorage.setItem(SELECTED_ROLE_KEY, isCaregiver ? 'caregiver' : 'user');
      router.replace(isCaregiver ? "/Caregiverpage" : "/Homepage");
    } catch (error: any) {
      console.error('Login request failed:', error);
      setFormError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* TOP LOGO */}
            <View style={styles.topRow}>
              <View style={styles.logoCircle}>
                <Text style={styles.handIcon}>♧</Text>
              </View>

              <Text style={styles.voiceMe}>Voice Me</Text>

              <View style={styles.earCircle}>
                <Text style={styles.earIcon}>◉</Text>
              </View>
            </View>

            {/* LOGIN TITLE */}
            <View style={styles.headingContainer}>
              <Text style={styles.nepaliHeading}>लगइन गर्नुहोस्</Text>
              <Text style={styles.englishHeading}>Login</Text>
            </View>

            {/* WAVEFORM */}
            <View style={styles.waveform}>
              {[12, 20, 28, 16, 30, 40, 24, 35, 18, 28, 13].map(
                (height, index) => (
                  <View
                    key={index}
                    style={[styles.waveBar, { height }]}
                  />
                )
              )}
            </View>

            {/* FORM */}
            <View style={styles.formContainer}>
              {/* EMAIL */}
              <Text style={styles.fieldLabel}>इमेल</Text>
              <View style={[styles.inputContainer, fieldErrors.email && styles.inputContainerError]}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#443F32"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {fieldErrors.email ? <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text> : null}

              {/* PASSWORD */}
              <Text style={styles.fieldLabel}>पासवर्ड</Text>
              <View style={[styles.inputContainer, fieldErrors.password && styles.inputContainerError]}>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#443F32"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />

                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? "◉" : "◌"}
                  </Text>
                </Pressable>
              </View>
              {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}

              {formError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{formError}</Text>
                </View>
              ) : null}
            </View>

            {/* FORGOT PASSWORD */}
            <Pressable
              style={styles.forgotContainer}
              onPress={() => router.push("/Forgotpasswordpage")}
            >
              <Text style={styles.forgotNepali}>पासवर्ड बिर्सनुभयो?</Text>
              <Text style={styles.forgotEnglish}>Forgot Password?</Text>
            </Pressable>

            {/* LOGIN BUTTON */}
            <Pressable
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={() => {
                if (!isSubmitting) {
                  void handleLogin();
                }
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <ActivityIndicator color="#FFF8ED" />
                  <Text style={styles.loginEnglish}>कृपया पर्खनुहोस् · Please wait…</Text>
                </>
              ) : (
                <>
                  <Text style={styles.loginNepali}>लगइन गर्नुहोस्</Text>
                  <Text style={styles.loginEnglish}>Login</Text>
                </>
              )}
            </Pressable>

            {/* VOICE LOGIN */}
            <Pressable
              style={styles.voiceButton}
              onPress={() => setFormError('Voice login will be added later.')}
            >
              <Text style={styles.voiceButtonText}>
                or use voice to log in
              </Text>
            </Pressable>

            {/* CREATE ACCOUNT */}
            <Pressable
              style={styles.createAccount}
              onPress={() => router.push("/Registerpage")}
            >
              <Text style={styles.createNepali}>
                नयाँ खाता सिर्जना गर्नुहोस्
              </Text>
              <Text style={styles.createEnglish}>
                Create new account
              </Text>
            </Pressable>

            {/* DELETE ACCOUNT */}
            <Pressable
              style={({ pressed }) => [
                styles.deleteAccount,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => router.push("/Deleteaccountpage")}
            >
              <Text style={styles.deleteNepali}>खाता मेटाउनुहोस्</Text>
              <Text style={styles.deleteEnglish}>Delete account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#292A27",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  card: {
    width: "94%",
    minHeight: 630,
    backgroundColor: "#F6E9D0",
    borderRadius: 38,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: "#D8C7AA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 55,
  },
  logoCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F0D4B4",
    alignItems: "center",
    justifyContent: "center",
  },
  handIcon: {
    fontSize: 27,
    color: "#54231D",
  },
  voiceMe: {
    color: "#321F1C",
    fontSize: 21,
    marginLeft: 9,
    fontWeight: "500",
  },
  earCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DDEBCB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  earIcon: {
    fontSize: 20,
    color: "#486044",
  },
  headingContainer: {
    marginTop: 35,
    marginBottom: 27,
  },
  nepaliHeading: {
    color: "#4B1C19",
    fontSize: 31,
    fontWeight: "700",
    lineHeight: 40,
  },
  englishHeading: {
    color: "#3C211E",
    fontSize: 21,
  },
  waveform: {
    position: "absolute",
    right: 30,
    top: 195,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    opacity: 0.25,
  },
  waveBar: {
    width: 3,
    borderRadius: 5,
    backgroundColor: "#9A6656",
  },
  formContainer: {
    backgroundColor: "rgba(216, 235, 192, 0.65)",
    borderRadius: 23,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 15,
  },
  fieldLabel: {
    color: "#3B211D",
    fontSize: 19,
    fontWeight: "600",
    marginBottom: 5,
    marginTop: 3,
  },
  inputContainer: {
    height: 43,
    backgroundColor: "#C9D7AA",
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 9,
  },
  input: {
    flex: 1,
    height: "100%",
    color: "#30241F",
    fontSize: 15,
    paddingHorizontal: 5,
  },
  inputContainerError: {
    borderWidth: 2,
    borderColor: "#C0392B",
  },
  fieldErrorText: {
    color: "#C0392B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: -5,
    marginBottom: 9,
    marginLeft: 4,
  },
  errorBanner: {
    backgroundColor: "#FBDCDC",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E4A0A0",
  },
  errorBannerText: {
    color: "#8A1F1F",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  eyeButton: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeIcon: {
    color: "#4B201D",
    fontSize: 20,
  },
  forgotContainer: {
    alignItems: "center",
    marginTop: 13,
    marginBottom: 16,
  },
  forgotNepali: {
    color: "#4A2520",
    fontSize: 16,
    fontWeight: "700",
  },
  forgotEnglish: {
    color: "#4A2520",
    fontSize: 12,
    marginTop: 1,
  },
  loginButton: {
    height: 61,
    backgroundColor: "#28552F",
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginNepali: {
    color: "#FFF8ED",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 25,
  },
  loginEnglish: {
    color: "#FFF8ED",
    fontSize: 14,
  },
  voiceButton: {
    alignSelf: "center",
    backgroundColor: "#FFF4E3",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 18,
    marginTop: 19,
    elevation: 2,
  },
  voiceButtonText: {
    color: "#3D302A",
    fontSize: 13,
  },
  createAccount: {
    alignItems: "center",
    marginTop: 25,
  },
  createNepali: {
    color: "#54231E",
    fontSize: 17,
    fontWeight: "600",
  },
  createEnglish: {
    color: "#54231E",
    fontSize: 12,
    marginTop: 2,
  },
  deleteAccount: {
    alignItems: "center",
    marginTop: 18,
  },
  deleteNepali: {
    color: "#8A1F1F",
    fontSize: 15,
    fontWeight: "600",
  },
  deleteEnglish: {
    color: "#8A1F1F",
    fontSize: 11,
    marginTop: 2,
  },
});