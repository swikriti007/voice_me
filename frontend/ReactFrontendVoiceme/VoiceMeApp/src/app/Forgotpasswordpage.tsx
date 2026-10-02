import React, { useState } from "react";
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
import { router } from "expo-router";

import { API_BASE_URL } from '@/constants/api';
import { INVALID_EMAIL_MESSAGE, isValidGmail } from '@/constants/email';
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES_MESSAGE, isValidPassword } from '@/constants/password';
import {
  CHECK_INBOX_MESSAGE,
  CODE_LENGTH,
  CODE_REQUIRED_MESSAGE,
  RESEND_COOLDOWN_SECONDS,
  isValidCode,
  retryAfterSeconds,
  sanitizeCode,
} from '@/constants/verification';
import { PasswordChecklist } from '@/components/password-checklist';
import { useCountdown } from '@/hooks/use-countdown';

type Step = "email" | "reset" | "done";

const NETWORK_ERROR = "सर्भरमा पुग्न सकिएन (Unable to reach the server. Please check your connection and try again.)";

// Two steps on one screen: (1) email a 6-digit code to the Gmail address,
// (2) enter that code with a new password. No browser link is involved.
export default function Forgotpasswordpage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [formError, setFormError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const resendCountdown = useCountdown();

  // Returns true when the code was (re)sent.
  const requestCode = async (): Promise<boolean> => {
    const response = await fetch(`${API_BASE_URL}/api/forgot-password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 429) {
      resendCountdown.start(retryAfterSeconds(data));
      setFormError(data?.error || 'Please wait before requesting another code.');
      return false;
    }
    if (!response.ok) {
      setFormError(data?.error || 'Unable to send a reset code right now.');
      return false;
    }

    setInfoMessage(data?.message || '');
    resendCountdown.start(RESEND_COOLDOWN_SECONDS);
    return true;
  };

  const handleSendCode = async () => {
    setFormError("");
    if (!isValidGmail(email)) {
      setFormError(INVALID_EMAIL_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      if (await requestCode()) setStep("reset");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isResending || resendCountdown.secondsLeft > 0) return;
    setFormError("");
    setIsResending(true);
    try {
      await requestCode();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setIsResending(false);
    }
  };

  const handleResetPassword = async () => {
    setFormError("");
    if (!isValidCode(code)) {
      setFormError(CODE_REQUIRED_MESSAGE);
      return;
    }
    if (!isValidPassword(newPassword)) {
      setFormError(PASSWORD_RULES_MESSAGE);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("पासवर्ड मेल खाएन (Passwords do not match)");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/reset-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          new_password: newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(data?.error || 'Unable to reset the password right now.');
        return;
      }

      setSuccessMessage(data?.message || 'Your password has been reset.');
      setStep("done");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseDifferentEmail = () => {
    setStep("email");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setFormError("");
    setInfoMessage("");
    resendCountdown.reset();
  };

  const errorBanner = formError ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{formError}</Text>
    </View>
  ) : null;

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

            {/* TITLE */}
            <View style={styles.headingContainer}>
              <Text style={styles.nepaliHeading}>पासवर्ड बिर्सनुभयो?</Text>
              <Text style={styles.englishHeading}>Forgot Password</Text>
            </View>

            {step === "email" && (
              <>
                <Text style={styles.helperText}>
                  तपाईंको Gmail मा ६ अंकको कोड पठाइनेछ।{"\n"}
                  We&apos;ll email you a 6-digit code to reset your password.
                </Text>

                {/* FORM */}
                <View style={styles.formContainer}>
                  <Text style={styles.fieldLabel}>इमेल</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="name@gmail.com"
                      placeholderTextColor="#443F32"
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        if (formError) setFormError("");
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {errorBanner}

                {/* SEND CODE BUTTON */}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    if (!isSubmitting) {
                      void handleSendCode();
                    }
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF8ED" />
                  ) : (
                    <>
                      <Text style={styles.primaryNepali}>कोड पठाउनुहोस्</Text>
                      <Text style={styles.primaryEnglish}>Send code</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}

            {step === "reset" && (
              <>
                <Text style={styles.helperText}>
                  {infoMessage ? `${infoMessage}\n` : ""}
                  {CHECK_INBOX_MESSAGE}
                </Text>

                <View style={styles.formContainer}>
                  {/* CODE */}
                  <Text style={styles.fieldLabel}>कोड (Code)</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[styles.input, styles.codeInput]}
                      placeholder="123456"
                      placeholderTextColor="#443F32"
                      value={code}
                      onChangeText={(text) => setCode(sanitizeCode(text))}
                      keyboardType="number-pad"
                      maxLength={CODE_LENGTH}
                      autoCorrect={false}
                    />
                  </View>

                  {/* NEW PASSWORD */}
                  <Text style={styles.fieldLabel}>नयाँ पासवर्ड (New password)</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="New password"
                      placeholderTextColor="#443F32"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={PASSWORD_MAX_LENGTH}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.eyeToggleText}>
                        {showPassword ? 'लुकाउनुहोस्' : 'हेर्नुहोस्'}
                      </Text>
                    </Pressable>
                  </View>
                  <PasswordChecklist password={newPassword} />

                  {/* CONFIRM PASSWORD */}
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>पासवर्ड पुष्टि (Confirm password)</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm password"
                      placeholderTextColor="#443F32"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={PASSWORD_MAX_LENGTH}
                    />
                  </View>
                  {confirmPassword.length > 0 && confirmPassword !== newPassword ? (
                    <Text style={styles.mismatchText}>पासवर्ड मेल खाएन (Passwords do not match)</Text>
                  ) : null}
                </View>

                {errorBanner}

                {/* RESET BUTTON */}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={() => {
                    if (!isSubmitting) {
                      void handleResetPassword();
                    }
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF8ED" />
                  ) : (
                    <>
                      <Text style={styles.primaryNepali}>पासवर्ड रिसेट गर्नुहोस्</Text>
                      <Text style={styles.primaryEnglish}>Reset password</Text>
                    </>
                  )}
                </Pressable>

                {/* RESEND CODE */}
                <Pressable
                  style={[
                    styles.secondaryButton,
                    (isResending || resendCountdown.secondsLeft > 0) && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleResend()}
                  disabled={isResending || resendCountdown.secondsLeft > 0}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isResending
                      ? 'पठाउँदै… (Sending…)'
                      : resendCountdown.secondsLeft > 0
                        ? `फेरि पठाउन ${resendCountdown.secondsLeft}s (Resend code in ${resendCountdown.secondsLeft}s)`
                        : 'कोड फेरि पठाउनुहोस् (Resend code)'}
                  </Text>
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={handleUseDifferentEmail}>
                  <Text style={styles.secondaryButtonText}>
                    अर्को इमेल प्रयोग गर्नुहोस् (Use a different email)
                  </Text>
                </Pressable>
              </>
            )}

            {step === "done" && (
              <>
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmNepali}>पासवर्ड परिवर्तन भयो</Text>
                  <Text style={styles.confirmEnglish}>
                    {successMessage}{"\n"}
                    Log in with your new password.
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  onPress={() => router.replace("/Loginpage")}
                >
                  <Text style={styles.primaryNepali}>लगइन गर्नुहोस्</Text>
                  <Text style={styles.primaryEnglish}>Go to login</Text>
                </Pressable>
              </>
            )}

            {/* BACK TO LOGIN */}
            {step !== "done" && (
              <Pressable
                style={styles.backToLogin}
                onPress={() => router.replace("/Loginpage")}
              >
                <Text style={styles.backNepali}>लगइनमा फर्कनुहोस्</Text>
                <Text style={styles.backEnglish}>Back to login</Text>
              </Pressable>
            )}
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
    minHeight: 500,
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
    marginBottom: 10,
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
  helperText: {
    color: "#5A3A33",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
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
  primaryButton: {
    height: 61,
    backgroundColor: "#28552F",
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
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
  primaryNepali: {
    color: "#FFF8ED",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 25,
  },
  primaryEnglish: {
    color: "#FFF8ED",
    fontSize: 14,
  },
  confirmBox: {
    backgroundColor: "rgba(216, 235, 192, 0.65)",
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  confirmNepali: {
    color: "#3B211D",
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 8,
  },
  confirmEnglish: {
    color: "#3B211D",
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryButton: {
    alignSelf: "center",
    backgroundColor: "#FFF4E3",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 18,
    marginTop: 15,
    elevation: 2,
  },
  codeInput: {
    letterSpacing: 6,
    fontWeight: "700",
  },
  eyeToggleText: {
    fontSize: 11,
    color: "#443F32",
    fontWeight: "600",
    paddingHorizontal: 6,
  },
  mismatchText: {
    color: "#C0392B",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  errorBox: {
    backgroundColor: "#FBDCDC",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E4A0A0",
  },
  errorText: {
    color: "#8A1F1F",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  secondaryButtonText: {
    color: "#3D302A",
    fontSize: 13,
  },
  backToLogin: {
    alignItems: "center",
    marginTop: 25,
  },
  backNepali: {
    color: "#54231E",
    fontSize: 17,
    fontWeight: "600",
  },
  backEnglish: {
    color: "#54231E",
    fontSize: 12,
    marginTop: 2,
  },
});
