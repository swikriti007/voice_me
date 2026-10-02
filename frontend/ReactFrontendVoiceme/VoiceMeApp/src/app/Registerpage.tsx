import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Pressable,
    SafeAreaView,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { INVALID_EMAIL_MESSAGE, LAST_EMAIL_KEY, isValidGmail } from '@/constants/email';

const REGISTERED_NAME_KEY = 'voiceme.registeredName';
const REGISTERED_AGE_KEY = 'voiceme.registeredAge';
const AUTH_TOKEN_KEY = 'voiceme.authToken';
const AUTH_USER_KEY = 'voiceme.user';

const persistAuthSession = async (token: string, user: { id?: string; name?: string; email?: string; age?: string | number }) => {
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

export default function CreateAccountScreen() {
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<{ name?: string; age?: string; email?: string; password?: string }>({});

    const handleContinue = async () => {
        setFormError('');

        const errors: typeof fieldErrors = {};
        if (!name.trim()) {
            errors.name = 'कृपया आफ्नो नाम प्रविष्ट गर्नुहोस् (Please enter your name)';
        }
        if (!age.trim()) {
            errors.age = 'कृपया आफ्नो उमेर प्रविष्ट गर्नुहोस् (Please enter your age)';
        } else if (Number.isNaN(Number(age)) || Number(age) <= 0) {
            errors.age = 'मान्य उमेर प्रविष्ट गर्नुहोस् (Please enter a valid age)';
        }
        if (!email.trim()) {
            errors.email = 'कृपया आफ्नो इमेल प्रविष्ट गर्नुहोस् (Please enter your email)';
        } else if (!isValidGmail(email)) {
            errors.email = INVALID_EMAIL_MESSAGE;
        }
        if (!password || password.length < 6) {
            errors.password = 'पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ (Password must be at least 6 characters)';
        }

        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            return;
        }

        setIsSubmitting(true);

        try {
            console.log('Sending registration request', {
                name: name.trim(),
                age: Number(age),
                email: email.trim(),
            });

            const response = await fetch(`${API_BASE_URL}/api/create-account/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.trim(),
                    age: Number(age),
                    email: email.trim(),
                    password,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const message = data?.error || 'Unable to create account right now.';
                if (/email/i.test(message)) {
                    setFieldErrors((prev) => ({ ...prev, email: message }));
                } else {
                    setFormError(message);
                }
                return;
            }

            await persistAuthSession(data.token, data.user || {
                id: data.user_id,
                name: name.trim(),
                email: email.trim(),
                age: Number(age),
            });

            router.replace('/RoleSelectionpage');
        } catch (error: any) {
            console.error('Registration request failed:', error);
            setFormError('Unable to reach the server. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLoginPress = () => {
        router.push('/Loginpage');
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F7EEDA" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header Section: Account Management */}
                    <View style={styles.headerBlock}>
                        <Text style={styles.mainHeaderNepali}>खाता व्यवस्थापन</Text>
                        <Text style={styles.mainHeaderEnglish}>Account Management</Text>
                    </View>

                    {/* Sub Header Section: Create Account */}
                    <View style={styles.sectionHeaderBlock}>
                        <Text style={styles.sectionHeaderNepali}>खाता सिर्जना गर्नुहोस्</Text>
                        <Text style={styles.sectionHeaderEnglish}>Create Account</Text>
                    </View>

                    {/* Form Container */}
                    <View style={styles.formContainer}>
                        {/* Field 1: Name */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.fieldLabel}>नाम</Text>
                            <View style={[styles.inputPill, fieldErrors.name && styles.inputPillError]}>
                                {/* User Avatar Icon */}
                                <View style={styles.iconWrapper}>
                                    <View style={styles.avatarHead} />
                                    <View style={styles.avatarBody} />
                                </View>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Name"
                                    placeholderTextColor="#7C5044"
                                    value={name}
                                    onChangeText={(text) => {
                                        setName(text);
                                        if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                                    }}
                                    autoCapitalize="words"
                                    autoCorrect={false}
                                />
                            </View>
                            {fieldErrors.name ? <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text> : null}
                        </View>

                        {/* Field 2: Age */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.fieldLabel}>उमेर</Text>
                            <View style={[styles.inputPill, fieldErrors.age && styles.inputPillError]}>
                                <View style={styles.iconWrapper}>
                                    <Text style={styles.ageIcon}>#</Text>
                                </View>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Age"
                                    placeholderTextColor="#7C5044"
                                    value={age}
                                    onChangeText={(text) => {
                                        setAge(text);
                                        if (fieldErrors.age) setFieldErrors((prev) => ({ ...prev, age: undefined }));
                                    }}
                                    keyboardType="numeric"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                            {fieldErrors.age ? <Text style={styles.fieldErrorText}>{fieldErrors.age}</Text> : null}
                        </View>

                        {/* Field 3: Email */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.fieldLabel}>इमेल</Text>
                            <View style={[styles.inputPill, fieldErrors.email && styles.inputPillError]}>
                                {/* Padlock Icon */}
                                <View style={styles.iconWrapper}>
                                    <View style={styles.lockShackle} />
                                    <View style={styles.lockBody} />
                                </View>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="name@email.com"
                                    placeholderTextColor="#7C5044"
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
                        </View>

                        {/* Field 4: Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.fieldLabel}>पासवर्ड</Text>
                            <View style={[styles.inputPill, fieldErrors.password && styles.inputPillError]}>
                                {/* Padlock Icon */}
                                <View style={styles.iconWrapper}>
                                    <View style={styles.lockShackle} />
                                    <View style={styles.lockBody} />
                                </View>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Password"
                                    placeholderTextColor="#7C5044"
                                    value={password}
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                                    }}
                                    secureTextEntry={!isPasswordVisible}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                                    style={styles.eyeToggle}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.eyeToggleText}>
                                        {isPasswordVisible ? 'लुकाउनुहोस्' : 'हेर्नुहोस्'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}
                        </View>

                        {/* General error banner (server / network errors) */}
                        {formError ? (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorBannerText}>{formError}</Text>
                            </View>
                        ) : null}

                        {/* Submit Button */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.continueButton,
                                pressed && styles.continueButtonPressed,
                                isSubmitting && styles.continueButtonDisabled,
                            ]}
                            onPress={() => {
                                if (!isSubmitting) {
                                    void handleContinue();
                                }
                            }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <ActivityIndicator color="#FFFFFF" />
                                    <Text style={styles.buttonTextEnglish}>कृपया पर्खनुहोस् · Please wait…</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.buttonTextNepali}>अघि बढ्नुहोस्</Text>
                                    <Text style={styles.buttonTextEnglish}>Continue</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Footer: Already have an account? Login */}
                        <TouchableOpacity
                            onPress={handleLoginPress}
                            style={styles.footerLinkContainer}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.footerTextNepali}>पहिल्यै खाता छ? लगइन गर्नुहोस्</Text>
                            <Text style={styles.footerTextEnglish}>
                                Already have an account? <Text style={styles.footerLoginHighlight}>Login</Text>
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7EEDA', // Warm cream background from design
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 26,
        paddingTop: Platform.OS === 'ios' ? 24 : 40,
        paddingBottom: 32,
    },
    headerBlock: {
        marginBottom: 26,
    },
    mainHeaderNepali: {
        fontSize: 27,
        fontWeight: '800',
        color: '#3E1C14', // Deep dark maroon brown
        letterSpacing: -0.2,
        marginBottom: 4,
    },
    mainHeaderEnglish: {
        fontSize: 18,
        fontWeight: '500',
        color: '#3E1C14',
        letterSpacing: 0.1,
    },
    sectionHeaderBlock: {
        marginBottom: 28,
    },
    sectionHeaderNepali: {
        fontSize: 27,
        fontWeight: '800',
        color: '#3E1C14',
        letterSpacing: -0.2,
        marginBottom: 4,
    },
    sectionHeaderEnglish: {
        fontSize: 18,
        fontWeight: '500',
        color: '#3E1C14',
        letterSpacing: 0.1,
    },
    formContainer: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: 18,
    },
    fieldLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#3E1C14',
        marginBottom: 7,
        marginLeft: 18,
    },
    inputPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3CFC2', // Soft blush peach from design
        borderRadius: 30,
        height: 54,
        paddingHorizontal: 18,
    },
    inputPillError: {
        borderWidth: 2,
        borderColor: '#C0392B',
    },
    fieldErrorText: {
        color: '#C0392B',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 6,
        marginLeft: 18,
    },
    iconWrapper: {
        width: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarHead: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#3E1C14',
        marginBottom: 2,
    },
    avatarBody: {
        width: 15,
        height: 8,
        borderTopLeftRadius: 7,
        borderTopRightRadius: 7,
        backgroundColor: '#3E1C14',
    },
    ageIcon: {
        color: '#3E1C14',
        fontSize: 18,
        fontWeight: '800',
    },
    lockShackle: {
        width: 10,
        height: 7,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderWidth: 2,
        borderColor: '#3E1C14',
        borderBottomWidth: 0,
        marginBottom: -1,
    },
    lockBody: {
        width: 14,
        height: 10,
        borderRadius: 2.5,
        backgroundColor: '#3E1C14',
    },
    textInput: {
        flex: 1,
        height: '100%',
        fontSize: 16,
        color: '#3E1C14',
        fontWeight: '500',
    },
    eyeToggle: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    eyeToggleText: {
        fontSize: 11,
        color: '#7C5044',
        fontWeight: '600',
    },
    errorBanner: {
        backgroundColor: '#FBDCDC',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#E4A0A0',
    },
    errorBannerText: {
        color: '#8A1F1F',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    continueButton: {
        backgroundColor: '#26533A', // Deep evergreen forest
        borderRadius: 30,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 26,
        marginBottom: 24,
        shadowColor: '#173624',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.16,
        shadowRadius: 5,
        elevation: 3,
    },
    continueButtonPressed: {
        opacity: 0.9,
        transform: [{ scale: 0.99 }],
    },
    continueButtonDisabled: {
        opacity: 0.7,
    },
    buttonTextNepali: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        lineHeight: 22,
    },
    buttonTextEnglish: {
        color: '#CFE0D5',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 1,
    },
    footerLinkContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    footerTextNepali: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3E1C14',
        textAlign: 'center',
        marginBottom: 4,
    },
    footerTextEnglish: {
        fontSize: 13,
        fontWeight: '500',
        color: '#3E1C14',
        textAlign: 'center',
    },
    footerLoginHighlight: {
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
});