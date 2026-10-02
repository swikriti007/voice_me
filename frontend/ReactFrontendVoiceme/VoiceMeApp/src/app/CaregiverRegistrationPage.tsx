import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from '@/constants/api';
import { INVALID_EMAIL_MESSAGE, LAST_EMAIL_KEY, isValidGmail } from '@/constants/email';
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

const AUTH_TOKEN_KEY = "voiceme.authToken";
const AUTH_USER_KEY = "voiceme.user";

export default function CaregiverRegistrationPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [connectCode, setConnectCode] = useState("");

  // Email verification for the new account: /api/signup/send-code/ emails a
  // 6-digit code that create-account requires. If the email already has an
  // account, no code is needed — we sign in with it and link it instead.
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeInfo, setCodeInfo] = useState("");
  const [codeError, setCodeError] = useState("");
  const resendCountdown = useCountdown();

  const resetCodeState = () => {
    setCode("");
    setCodeSent(false);
    setAccountExists(false);
    setCodeInfo("");
    setCodeError("");
    resendCountdown.reset();
  };

  const handleEmailChange = (text: string) => {
    // A code sent to the old address won't verify a new one.
    if ((codeSent || accountExists) && text.trim() !== email.trim()) resetCodeState();
    setEmail(text);
  };

  const [dialogInfo, setDialogInfo] = useState<{
    visible: boolean;
    titleNe: string;
    titleEn: string;
    message: string;
  }>({
    visible: false,
    titleNe: "",
    titleEn: "",
    message: "",
  });

  // Pre-fill existing caregiver info if set
  useEffect(() => {
    AsyncStorage.multiGet([
      "voiceme.caregiverName",
      "voiceme.caregiverPhone",
      "voiceme.caregiverEmail",
    ])
      .then((entries) => {
        const cName = entries[0][1];
        const cPhone = entries[1][1];
        const cEmail = entries[2][1];
        if (cName?.trim()) setName(cName.trim());
        if (cPhone?.trim()) setPhone(cPhone.trim());
        if (cEmail?.trim()) setEmail(cEmail.trim());
      })
      .catch(() => {});

    (async () => {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return;

      // If this account is already connected to a child as a caregiver,
      // prefill from that (not /api/child/profile/, which is the parent's
      // own child record and won't exist under a caregiver's account).
      try {
        const res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const profile = await res.json();
        if (profile.caregiver?.name) setName(profile.caregiver.name);
        if (profile.caregiver?.phone) setPhone(profile.caregiver.phone);
      } catch {
        // Offline or backend unreachable: keep the AsyncStorage-loaded values.
      }
    })();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (isSendingCode || resendCountdown.secondsLeft > 0) return;
    setCodeError("");
    if (!isValidGmail(email)) {
      setDialogInfo({
        visible: true,
        titleNe: "अमान्य इमेल",
        titleEn: "Invalid Email",
        message: INVALID_EMAIL_MESSAGE,
      });
      return;
    }

    setIsSendingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/signup/send-code/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        resendCountdown.start(retryAfterSeconds(data));
        setCodeError(data?.error || "Please wait before requesting another code.");
        return;
      }
      if (!res.ok) {
        if (/already exists/i.test(data?.error || "")) {
          // Existing account: sign in with its password and link it instead.
          setAccountExists(true);
          setCodeSent(false);
          setCodeInfo(
            "यो इमेलको खाता पहिल्यै छ — त्यही पासवर्ड राखेर अघि बढ्नुहोस्\n(This email already has an account — enter its password to sign in and link it)"
          );
          return;
        }
        setDialogInfo({
          visible: true,
          titleNe: "कोड पठाउन सकिएन",
          titleEn: "Could Not Send Code",
          message: data?.error || "Unable to send the code right now.",
        });
        return;
      }

      setAccountExists(false);
      setCodeSent(true);
      setCodeInfo(data?.message || "");
      resendCountdown.start(RESEND_COOLDOWN_SECONDS);
    } catch {
      setDialogInfo({
        visible: true,
        titleNe: "सर्भरमा पुग्न सकिएन",
        titleEn: "Could Not Reach Server",
        message: "इन्टरनेट जडान जाँच गरेर फेरि प्रयास गर्नुहोस्\n(Please check your connection and try again)",
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  // Account creation (and the login fallback) each spend about a second
  // hashing the password server-side, so show progress and ignore extra
  // taps instead of looking frozen.
  const handleContinue = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitRegistration();
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRegistration = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !phone.trim()) {
      setDialogInfo({
        visible: true,
        titleNe: "अपूर्ण विवरण",
        titleEn: "Incomplete Details",
        message: "कृपया आफ्नो नाम, इमेल, पासवर्ड र फोन नम्बर भर्नुहोस्\n(Please fill in all required fields)",
      });
      return;
    }

    if (!isValidGmail(email)) {
      setDialogInfo({
        visible: true,
        titleNe: "अमान्य इमेल",
        titleEn: "Invalid Email",
        message: INVALID_EMAIL_MESSAGE,
      });
      return;
    }

    if (!accountExists) {
      if (!codeSent || !isValidCode(code)) {
        setDialogInfo({
          visible: true,
          titleNe: "इमेल प्रमाणीकरण",
          titleEn: "Verify Your Email",
          message: codeSent
            ? CODE_REQUIRED_MESSAGE
            : 'पहिले "कोड पठाउनुहोस्" थिचेर इमेल प्रमाणित गर्नुहोस्\n(Tap "Send code" to verify your email first)',
        });
        return;
      }

      if (!isValidPassword(password)) {
        setDialogInfo({
          visible: true,
          titleNe: "कमजोर पासवर्ड",
          titleEn: "Password Too Weak",
          message: PASSWORD_RULES_MESSAGE,
        });
        return;
      }
    }

    if (!connectCode.trim()) {
      setDialogInfo({
        visible: true,
        titleNe: "जोड्ने कोड चाहियो",
        titleEn: "Connect Code Required",
        message: "कृपया अभिभावकले दिएको जोड्ने कोड राख्नुहोस्\n(Please enter the connect code the parent shared with you)",
      });
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    // Caregiver registration completed - save caregiver specific details to AsyncStorage
    try {
      await AsyncStorage.multiSet([
        ["voiceme.caregiverName", name.trim()],
        ["voiceme.caregiverPhone", phone.trim()],
        ["voiceme.caregiverEmail", email.trim()],
        ["voiceme.currentRole", "caregiver"],
      ]);
    } catch {}

    // This screen both creates the caregiver's own account (email/password)
    // and links that account to a child by the connect code the parent
    // shared with them — the caregiver never edits the child profile directly.
    try {
      // Always sign in with the email/password typed here, even if another
      // account (e.g. the parent's) is still logged in on this device —
      // otherwise that account gets linked as the caregiver instead and the
      // caregiver's own login is never created.
      let token: string | null = null;
      let user: any = { name: name.trim(), email: email.trim() };
      let serverError = "";

      const loginExisting = async () => {
        const loginRes = await fetch(`${API_BASE_URL}/api/login/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const loginData = await loginRes.json().catch(() => ({}));
        if (loginRes.ok) {
          token = loginData.token;
          if (loginData?.user) user = loginData.user;
        } else {
          serverError = loginData?.error || "";
        }
      };

      if (accountExists) {
        // Account already exists (e.g. re-registering on this device) - log in instead.
        await loginExisting();
      } else {
        const createRes = await fetch(`${API_BASE_URL}/api/create-account/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, code: code.trim() }),
        });
        const createData = await createRes.json().catch(() => ({}));

        if (createRes.ok) {
          token = createData.token;
          if (createData?.user) user = createData.user;
        } else if (/already exists/i.test(createData?.error || "")) {
          await loginExisting();
        } else {
          serverError = createData?.error || "";
        }
      }

      if (token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
        await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        await AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim());
        await AsyncStorage.setItem("voiceme.selectedRole", "caregiver");
      }

      if (!token) {
        setDialogInfo({
          visible: true,
          titleNe: "खाता सिर्जना गर्न सकिएन",
          titleEn: "Could Not Create Account",
          message: serverError || "कृपया इमेल/पासवर्ड जाँच गरेर फेरि प्रयास गर्नुहोस्\n(Please check your email/password and try again)",
        });
        return;
      }

      const connectRes = await fetch(`${API_BASE_URL}/api/caregiver/connect/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: connectCode.trim(),
          name: name.trim(),
          phone: phone.trim(),
        }),
      });

      if (!connectRes.ok) {
        const connectData = await connectRes.json().catch(() => ({}));
        setDialogInfo({
          visible: true,
          titleNe: "जोड्न सकिएन",
          titleEn: "Could Not Connect",
          message: connectData?.error === "Invalid connect code."
            ? "गलत कोड। कृपया अभिभावकसँग जाँच गर्नुहोस्\n(Invalid code — please check with the parent)"
            : "जडान असफल भयो। पछि फेरि प्रयास गर्नुहोस्\n(Connecting failed. Please try again later)",
        });
        return;
      }
    } catch {
      setDialogInfo({
        visible: true,
        titleNe: "सर्भरमा पुग्न सकिएन",
        titleEn: "Could Not Reach Server",
        message: "इन्टरनेट जडान जाँच गरेर फेरि प्रयास गर्नुहोस्\n(Please check your connection and try again)",
      });
      return;
    }

    router.replace("/Caregiverpage");
  };

  const handleGoToLogin = () => {
    router.replace("/Loginpage");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>

            {/* Back Button */}
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backArrow}>←</Text>
            </Pressable>

            {/* Header */}
            <View style={styles.headerSection}>
              <Text style={styles.topHeaderNepali}>
                खाता व्यवस्थापन
              </Text>

              <Text style={styles.topHeaderEnglish}>
                Account Management
              </Text>
            </View>

            {/* Title */}
            <View style={styles.titleSection}>
              <Text style={styles.mainTitleNepali}>
                खाता सिर्जना गर्नुहोस्
              </Text>

              <Text style={styles.mainTitleEnglish}>
                Create Account (Caregiver)
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>

              {/* Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>नाम</Text>

                <View style={styles.inputPill}>
                  <Text style={styles.inputIcon}>👤</Text>

                  <TextInput
                    style={styles.textInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Name"
                    placeholderTextColor="#7C6356"
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>इमेल</Text>

                <View style={styles.inputPill}>
                  <Text style={styles.inputIcon}>✉️</Text>

                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={handleEmailChange}
                    placeholder="name@email.com"
                    placeholderTextColor="#7C6356"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>

                {/* Send verification code */}
                <Pressable
                  style={({ pressed }) => [
                    styles.sendCodeButton,
                    pressed && styles.buttonPressed,
                    (isSendingCode || resendCountdown.secondsLeft > 0) && styles.sendCodeButtonDisabled,
                  ]}
                  onPress={() => void handleSendCode()}
                  disabled={isSendingCode || resendCountdown.secondsLeft > 0}
                >
                  {isSendingCode ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.sendCodeButtonText}>
                      {resendCountdown.secondsLeft > 0
                        ? `फेरि पठाउन ${resendCountdown.secondsLeft}s (Resend in ${resendCountdown.secondsLeft}s)`
                        : codeSent
                          ? "कोड फेरि पठाउनुहोस् (Resend code)"
                          : "कोड पठाउनुहोस् (Send code)"}
                    </Text>
                  )}
                </Pressable>
                {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}
                {accountExists && codeInfo ? <Text style={styles.helperText}>{codeInfo}</Text> : null}
              </View>

              {/* Verification code (after it has been emailed) */}
              {codeSent && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>प्रमाणीकरण कोड (Verification Code)</Text>

                  <View style={styles.inputPill}>
                    <Text style={styles.inputIcon}>🔢</Text>

                    <TextInput
                      style={[styles.textInput, styles.codeInput]}
                      value={code}
                      onChangeText={(text) => setCode(sanitizeCode(text))}
                      placeholder="123456"
                      placeholderTextColor="#7C6356"
                      keyboardType="number-pad"
                      maxLength={CODE_LENGTH}
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                  {codeInfo ? <Text style={styles.helperText}>{codeInfo}</Text> : null}
                  <Text style={styles.helperText}>{CHECK_INBOX_MESSAGE}</Text>
                </View>
              )}

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>पासवर्ड</Text>

                <View style={styles.inputPill}>
                  <Text style={styles.inputIcon}>🔒</Text>

                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#7C6356"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    maxLength={accountExists ? undefined : PASSWORD_MAX_LENGTH}
                  />
                </View>
                {!accountExists && <PasswordChecklist password={password} />}
              </View>

              {/* Phone */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  फोन नम्बर (Phone Number)
                </Text>

                <View style={styles.inputPill}>
                  <Text style={styles.inputIcon}>📞</Text>

                  <TextInput
                    style={styles.textInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="98XXXXXXXX"
                    placeholderTextColor="#7C6356"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>

              {/* Connect Code */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  जोड्ने कोड (Connect Code)
                </Text>

                <View style={styles.inputPill}>
                  <Text style={styles.inputIcon}>🔗</Text>

                  <TextInput
                    style={styles.textInput}
                    value={connectCode}
                    onChangeText={(text) => setConnectCode(text.toUpperCase())}
                    placeholder="e.g. 4F9A2B"
                    placeholderTextColor="#7C6356"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.helperText}>
                  अभिभावकले बालबालिका दर्ता गर्दा पाएको कोड यहाँ राख्नुहोस्
                  (Enter the code the parent got when registering the child)
                </Text>
              </View>

              {/* Continue Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.continueButton,
                  pressed && styles.buttonPressed,
                  isSubmitting && { opacity: 0.75 },
                ]}
                onPress={handleContinue}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.continueEnglish}>कृपया पर्खनुहोस् · Please wait…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.continueNepali}>
                      अघि बढ्नुहोस्
                    </Text>

                    <Text style={styles.continueEnglish}>
                      Continue
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Login Link */}
              <Pressable
                style={styles.loginLink}
                onPress={handleGoToLogin}
              >
                <Text style={styles.loginTextNepali}>
                  पहिले नै खाता छ? लगइन गर्नुहोस्
                </Text>

                <Text style={styles.loginTextEnglish}>
                  Already have an account? Login
                </Text>
              </Pressable>

            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Incomplete Details Modal Dialog */}
      <Modal
        visible={dialogInfo.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDialogInfo((prev) => ({ ...prev, visible: false }))}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDialogInfo((prev) => ({ ...prev, visible: false }))}
        >
          <View style={styles.dialogCard}>
            <View style={styles.dialogBadge}>
              <Text style={{ fontSize: 26 }}>⚠️</Text>
            </View>

            <Text style={styles.dialogTitleNe}>{dialogInfo.titleNe}</Text>
            <Text style={styles.dialogTitleEn}>{dialogInfo.titleEn}</Text>

            <Text style={styles.dialogMessage}>{dialogInfo.message}</Text>

            <Pressable
              style={styles.dialogCloseBtn}
              onPress={() => setDialogInfo((prev) => ({ ...prev, visible: false }))}
            >
              <Text style={styles.dialogCloseBtnText}>बुझें (Understood)</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6EBD6",
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },

  container: {
    width: "90%",
    maxWidth: 360,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBD5B7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  backArrow: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4B1C19",
  },

  headerSection: {
    marginBottom: 20,
  },

  topHeaderNepali: {
    fontSize: 27,
    fontWeight: "900",
    color: "#4B1C19",
    letterSpacing: -0.3,
  },

  topHeaderEnglish: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4B2419",
    marginTop: 2,
  },

  titleSection: {
    marginBottom: 24,
  },

  mainTitleNepali: {
    fontSize: 28,
    fontWeight: "900",
    color: "#4B1C19",
    letterSpacing: -0.3,
  },

  mainTitleEnglish: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4B2419",
    marginTop: 2,
  },

  form: {
    width: "100%",
  },

  inputGroup: {
    marginBottom: 14,
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4B1C19",
    marginBottom: 6,
    marginLeft: 4,
  },

  inputPill: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F7D5C6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },

  inputIcon: {
    fontSize: 18,
    marginRight: 10,
  },

  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#3A2218",
  },

  helperText: {
    fontSize: 11,
    color: "#7C6E61",
    marginTop: 6,
    marginLeft: 4,
    lineHeight: 15,
  },

  sendCodeButton: {
    alignSelf: "flex-start",
    backgroundColor: "#235237",
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginTop: 10,
    marginLeft: 4,
    minHeight: 38,
    justifyContent: "center",
  },

  sendCodeButtonDisabled: {
    opacity: 0.6,
  },

  sendCodeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  codeInput: {
    letterSpacing: 6,
  },

  errorText: {
    fontSize: 12,
    color: "#C0392B",
    fontWeight: "600",
    marginTop: 6,
    marginLeft: 4,
  },

  continueButton: {
    marginTop: 24,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#235237",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },

  continueNepali: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  continueEnglish: {
    color: "#D8ECCD",
    fontSize: 12,
    marginTop: 1,
    fontWeight: "500",
  },

  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  loginLink: {
    marginTop: 24,
    alignItems: "center",
    paddingVertical: 6,
  },

  loginTextNepali: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4B1C19",
    textAlign: "center",
  },

  loginTextEnglish: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C6E61",
    marginTop: 2,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFDF9",
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DED2",
    elevation: 8,
  },
  dialogBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FDEAE0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dialogTitleNe: {
    fontSize: 20,
    fontWeight: "900",
    color: "#342419",
    textAlign: "center",
  },
  dialogTitleEn: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8C461F",
    marginTop: 2,
    textAlign: "center",
  },
  dialogMessage: {
    fontSize: 13.5,
    color: "#5E4E42",
    textAlign: "center",
    marginVertical: 14,
    lineHeight: 20,
  },
  dialogCloseBtn: {
    backgroundColor: "#EFE6D8",
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: 6,
  },
  dialogCloseBtnText: {
    color: "#4B2419",
    fontSize: 13,
    fontWeight: "700",
  },
});