import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Switch,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { SosAlertBanner } from '@/components/sos-alert-banner';
import { LogoutButton } from '@/components/logout-button';
import { dialPhone } from '@/constants/phone';

interface RoutineItem {
  id: string;
  time: string;
  nepaliTitle: string;
  englishTitle: string;
  icon: string;
  completed: boolean;
}

const ROUTINE_STORAGE_KEY = 'voiceme.daily_routine_state';

const DEFAULT_ROUTINES: RoutineItem[] = [
  { id: '1', time: '०७:३० AM', nepaliTitle: 'दाँत माझ्नु', englishTitle: 'Brush teeth', icon: '🪥', completed: true },
  { id: '2', time: '०८:०० AM', nepaliTitle: 'बिहानको खाजा', englishTitle: 'Morning breakfast', icon: '🥣', completed: true },
  { id: '3', time: '०८:३० AM', nepaliTitle: 'औषधि खानु', englishTitle: 'Morning medicine', icon: '💊', completed: true },
  { id: '4', time: '१०:०० AM', nepaliTitle: 'पढाइ र सिकाइ', englishTitle: 'Learning & study', icon: '📚', completed: false },
  { id: '5', time: '०१:०० PM', nepaliTitle: 'दिउँसोको खाना', englishTitle: 'Lunch time', icon: '🍱', completed: false },
  { id: '6', time: '०४:३० PM', nepaliTitle: 'खेलकुद र रमाइलो', englishTitle: 'Playtime & activity', icon: '⚽', completed: false },
  { id: '7', time: '०८:०० PM', nepaliTitle: 'साँझको खाना र सुत्ने', englishTitle: 'Dinner & bedtime', icon: '🌙', completed: false },
];

export default function Parentspage() {
  const { width } = useWindowDimensions();
  const [childName, setChildName] = useState('आरव (Aarav)');
  const [childAge, setChildAge] = useState('७ वर्ष (7 yrs)');
  const [selectedAvatar, setSelectedAvatar] = useState('👦');
  const [parentName, setParentName] = useState('सिता शर्मा (Sita Sharma)');
  const [emergencyPhone, setEmergencyPhone] = useState('९८४१११२२३३');
  const [caregiverName, setCaregiverName] = useState('माया घिमिरे (Maya Ghimire)');
  const [caregiverPhone, setCaregiverPhone] = useState('९८४१११२२३३');
  const [doctor, setDoctor] = useState<{ name?: string; phone?: string } | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(0.95);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [bellPushNotification, setBellPushNotification] = useState(true);
  const [isBellActive, setIsBellActive] = useState(false);
  const [routines, setRoutines] = useState<RoutineItem[]>(DEFAULT_ROUTINES);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);

  // Parent settings belong to the child's own account; a caregiver who lands
  // here (deep link, stale back stack) is sent back to their own dashboard.
  useEffect(() => {
    AsyncStorage.getItem('voiceme.selectedRole')
      .then((role) => {
        if (role === 'caregiver') router.replace('/Caregiverpage');
      })
      .catch(() => {});
  }, []);

  // Load existing profile & daily routines from storage once on mount
  useEffect(() => {
    AsyncStorage.multiGet([
      'voiceme.registeredName',
      'voiceme.registeredAge',
      'voiceme.registeredAvatar',
      'voiceme.parentName',
      'voiceme.emergencyPhone',
      'voiceme.caregiverName',
      'voiceme.caregiverPhone',
      'voiceme.doctorName',
      'voiceme.doctorPhone',
      'voiceme.speechRate',
      'voiceme.geofenceEnabled',
      'voiceme.bellPushNotification',
      'voiceme.bellActive',
      ROUTINE_STORAGE_KEY,
    ])
      .then((stores) => {
        const saved = Object.fromEntries(stores);
        if (saved['voiceme.doctorName'] || saved['voiceme.doctorPhone']) {
          setDoctor((prev) => prev ?? {
            name: saved['voiceme.doctorName'] || undefined,
            phone: saved['voiceme.doctorPhone'] || undefined,
          });
        }
        stores.forEach(([key, val]) => {
          if (!val) return;
          if (key === 'voiceme.registeredName') setChildName(val);
          if (key === 'voiceme.registeredAge') setChildAge(val);
          if (key === 'voiceme.registeredAvatar') setSelectedAvatar(val);
          if (key === 'voiceme.parentName') setParentName(val);
          if (key === 'voiceme.emergencyPhone') setEmergencyPhone(val);
          if (key === 'voiceme.caregiverName') setCaregiverName(val);
          if (key === 'voiceme.caregiverPhone') setCaregiverPhone(val);
          if (key === 'voiceme.speechRate') setSpeechRate(parseFloat(val) || 0.95);
          if (key === 'voiceme.geofenceEnabled') setGeofenceEnabled(val === 'true');
          if (key === 'voiceme.bellPushNotification') setBellPushNotification(val === 'true');
          if (key === 'voiceme.bellActive') setIsBellActive(val === 'true');
          if (key === ROUTINE_STORAGE_KEY) {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setRoutines(parsed);
              }
            } catch {}
          }
        });
      })
      .catch(() => {});

    // The doctor is entered at child registration and stored on the
    // backend profile; this page only shows it (edit via Register).
    (async () => {
      const token = await AsyncStorage.getItem('voiceme.authToken');
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/child/profile/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const profile = await res.json();
        if (profile.doctor) setDoctor(profile.doctor);
      } catch {}
    })();

    // Only periodically poll the real-time Attention Bell alert status (never overwrite typed fields)
    const interval = setInterval(() => {
      AsyncStorage.getItem('voiceme.bellActive')
        .then((val) => {
          setIsBellActive(val === 'true');
        })
        .catch(() => {});
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/Homepage');
    }
  };

  const testVoice = (rate: number) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setSpeechRate(rate);
    setIsSpeaking(true);

    const spokenName = childName.replace(/\s*\([^)]*\)/g, '').trim() || 'आरव';
    const textToSpeak = `नमस्ते, म ${spokenName} हुँ। Voice Me मा स्वागत छ।`;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = rate;

        const voices = window.speechSynthesis.getVoices();
        const nepaliOrHindiVoice = voices.find(
          (v) => v.lang.startsWith('ne') || v.lang.startsWith('hi')
        );
        if (nepaliOrHindiVoice) {
          utterance.voice = nepaliOrHindiVoice;
          utterance.lang = nepaliOrHindiVoice.lang;
        } else {
          utterance.lang = 'ne-NP';
        }

        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        return;
      } catch {
        setIsSpeaking(false);
      }
    }

    try {
      Speech.stop();
      Speech.speak(textToSpeak, {
        language: 'ne-NP',
        pitch: 1.05,
        rate: rate,
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } catch {
      setIsSpeaking(false);
    }
  };

  const handleClearBell = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setIsBellActive(false);
    await AsyncStorage.setItem('voiceme.bellActive', 'false').catch(() => {});
  };

  const handleTriggerBell = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
    setIsBellActive(true);
    await AsyncStorage.setItem('voiceme.bellActive', 'true').catch(() => {});
  };

  const handleToggleRoutine = async (id: string) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    const updated = routines.map((r) =>
      r.id === id ? { ...r, completed: !r.completed } : r
    );
    setRoutines(updated);
    await AsyncStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const handleResetRoutines = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    const reset = routines.map((r) => ({ ...r, completed: false }));
    setRoutines(reset);
    await AsyncStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(reset)).catch(() => {});
  };

  const handleSaveSettings = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    try {
      await AsyncStorage.multiSet([
        ['voiceme.registeredName', childName.trim()],
        ['voiceme.registeredAge', childAge.trim()],
        ['voiceme.registeredAvatar', selectedAvatar],
        ['voiceme.parentName', parentName.trim()],
        ['voiceme.emergencyPhone', emergencyPhone.trim()],
        ['voiceme.caregiverName', caregiverName.trim()],
        ['voiceme.caregiverPhone', caregiverPhone.trim()],
        ['voiceme.speechRate', speechRate.toString()],
        ['voiceme.geofenceEnabled', geofenceEnabled.toString()],
        ['voiceme.bellPushNotification', bellPushNotification.toString()],
      ]);
    } catch {}

    setSaveSuccessVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F5ECD9"
        translucent={Platform.OS === 'android'}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to home"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedState]}
          onPress={handleBack}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 18L9 12L15 6"
              stroke="#342419"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.backButtonText}>गृहपृष्ठ · Home</Text>
        </Pressable>

        {/* Home + Logout already fill a small phone's width; drop the brand there. */}
        {width >= 360 && <Text style={styles.brandTitle}>Voice Me</Text>}

        <LogoutButton />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SosAlertBanner />

        {/* Title Header */}
        <View style={styles.titleSection}>
          <Text style={styles.nepaliTitle}>अभिभावक र बालबालिका</Text>
          <Text style={styles.englishTitle}>Parents & Child Controls</Text>
          <Text style={styles.subtitle}>
            बालबालिकाको प्रोफाइल, आवाजको गति, सुरक्षा क्षेत्र र हेरचाहकर्ता सेटिङहरू व्यवस्थापन गर्नुहोस्
          </Text>
        </View>

        {/* 1. Child Profile & Details */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>१. बालबालिकाको प्रोफाइल (Child Profile)</Text>
            <View style={styles.avatarPreviewDisc}>
              <Text style={{ fontSize: 24 }}>{selectedAvatar}</Text>
            </View>
          </View>

          {/* Child Name Input */}
          <Text style={styles.fieldLabel}>बालबालिकाको नाम (Child's Name):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>👦</Text>
            <TextInput
              style={styles.textInput}
              value={childName}
              onChangeText={setChildName}
              placeholder="e.g. Aarav"
              placeholderTextColor="#8C7D70"
            />
          </View>

          {/* Child Age Input */}
          <Text style={styles.fieldLabel}>उमेर (Child's Age):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>🎂</Text>
            <TextInput
              style={styles.textInput}
              value={childAge}
              onChangeText={setChildAge}
              placeholder="e.g. 7 वर्ष (7 yrs)"
              placeholderTextColor="#8C7D70"
            />
          </View>

          {/* Avatar selector */}
          <Text style={styles.fieldLabel}>अवतार छान्नुहोस् (Choose Avatar):</Text>
          <View style={styles.avatarRow}>
            {['👦', '👧', '🧒', '🦊', '🦁', '🐼', '⭐', '🚀'].map((emoji) => (
              <Pressable
                key={emoji}
                style={[
                  styles.avatarPill,
                  selectedAvatar === emoji && styles.avatarPillActive,
                ]}
                onPress={() => {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                  setSelectedAvatar(emoji);
                }}
              >
                <Text style={styles.avatarEmoji}>{emoji}</Text>
                {selectedAvatar === emoji && (
                  <View style={styles.miniCheck}>
                    <Text style={styles.miniCheckText}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* 2. Nepali Voice & Speech Tuning */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>२. नेपाली आवाज सेटिङ (Nepali Speech Speed)</Text>
          <Text style={styles.cardHint}>
            बच्चाले सुन्ने आवाजको गति परिवर्तन गरी परीक्षण गर्नुहोस्
          </Text>

          <View style={styles.speedRow}>
            {[
              { label: 'सुस्त (0.8x)', rate: 0.8 },
              { label: 'सामान्य (1.0x)', rate: 0.95 },
              { label: 'छिटो (1.2x)', rate: 1.2 },
            ].map((item) => (
              <Pressable
                key={item.rate}
                style={[
                  styles.speedBtn,
                  speechRate === item.rate && styles.speedBtnActive,
                ]}
                onPress={() => testVoice(item.rate)}
              >
                <Text
                  style={[
                    styles.speedBtnText,
                    speechRate === item.rate && styles.speedBtnTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Test Speech Action Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Test Nepali voice"
            style={({ pressed }) => [
              styles.testVoiceButton,
              isSpeaking && styles.testVoiceButtonActive,
              pressed && styles.pressedState,
            ]}
            onPress={() => testVoice(speechRate)}
          >
            <Text style={styles.testVoiceEmoji}>{isSpeaking ? '🔊' : '▶'}</Text>
            <Text style={styles.testVoiceText}>
              {isSpeaking ? 'आवाज बोल्दैछ... (Speaking)' : 'आवाज परीक्षण गर्नुहोस् (Test Voice)'}
            </Text>
          </Pressable>
        </View>

        {/* 3. Safety, GPS & Bell Alerts */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>३. सुरक्षा र चेतावनी (Safety & Alerts)</Text>

          {/* Real-time Attention Bell Alert Status */}
          <View style={[styles.bellStatusBox, isBellActive && styles.bellStatusBoxActive]}>
            <View style={[styles.bellStatusIconBox, isBellActive && styles.bellStatusIconBoxActive]}>
              <Text style={{ fontSize: 22 }}>{isBellActive ? '🔔' : '🔕'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.bellStatusTitle, isBellActive && styles.bellStatusTitleActive]}>
                {isBellActive ? '⚠️ ध्यान घण्टी सक्रिय छ!' : 'घण्टी स्थिति: सामान्य'}
              </Text>
              <Text style={styles.bellStatusSub}>
                {isBellActive
                  ? 'बच्चाले ध्यान घण्टी बजाउँदैछ'
                  : 'कुनै सक्रिय घण्टी बजेको छैन'}
              </Text>
            </View>
            {isBellActive ? (
              <Pressable
                style={styles.bellMuteBtn}
                onPress={handleClearBell}
              >
                <Text style={styles.bellMuteBtnText}>घण्टी रोक्नुहोस्</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.bellTriggerBtn}
                onPress={handleTriggerBell}
              >
                <Text style={styles.bellTriggerBtnText}>घण्टी बजाउनुहोस्</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.toggleRow, { marginTop: 10 }]}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleTitle}>सुरक्षित क्षेत्र चेतावनी (Geofence Alert)</Text>
              <Text style={styles.toggleSub}>घर वा विद्यालय बाहिर जाँदा तुरुन्तै सतर्कता आउनेछ</Text>
            </View>
            <Switch
              value={geofenceEnabled}
              onValueChange={setGeofenceEnabled}
              trackColor={{ false: '#D4C5B0', true: '#28552F' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.toggleRow, styles.toggleBorder]}>
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleTitle}>घण्टी पुश सूचना (Bell Notifications)</Text>
              <Text style={styles.toggleSub}>बच्चाले ध्यान घण्टी बजाउँदा अभिभावकलाई अलर्ट पठाउने</Text>
            </View>
            <Switch
              value={bellPushNotification}
              onValueChange={setBellPushNotification}
              trackColor={{ false: '#D4C5B0', true: '#28552F' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 4. Parent Contacts & Linked Caregiver */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>४. अभिभावक र हेरचाहकर्ता सम्पर्क</Text>

          {/* Parent Name */}
          <Text style={styles.fieldLabel}>अभिभावकको नाम (Parent's Name):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput
              style={styles.textInput}
              value={parentName}
              onChangeText={setParentName}
              placeholder="e.g. Sita Sharma"
              placeholderTextColor="#8C7D70"
            />
          </View>

          {/* Emergency Phone */}
          <Text style={styles.fieldLabel}>आपतकालीन सम्पर्क नम्बर (Emergency Phone):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>📞</Text>
            <TextInput
              style={styles.textInput}
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              placeholder="98XXXXXXXX"
              placeholderTextColor="#8C7D70"
              keyboardType="phone-pad"
            />
          </View>

          {/* Caregiver Name Input */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>हेरचाहकर्ताको नाम (Caregiver's Name):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>💚</Text>
            <TextInput
              style={styles.textInput}
              value={caregiverName}
              onChangeText={setCaregiverName}
              placeholder="e.g. Maya Ghimire"
              placeholderTextColor="#8C7D70"
            />
          </View>

          {/* Caregiver Phone Input */}
          <Text style={styles.fieldLabel}>हेरचाहकर्ताको फोन (Caregiver's Phone):</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>📱</Text>
            <TextInput
              style={styles.textInput}
              value={caregiverPhone}
              onChangeText={setCaregiverPhone}
              placeholder="98XXXXXXXX"
              placeholderTextColor="#8C7D70"
              keyboardType="phone-pad"
            />
          </View>

          {/* Caregiver summary card */}
          <View style={[styles.caregiverBox, { marginTop: 8 }]}>
            <View style={styles.caregiverIcon}>
              <Text style={{ fontSize: 24 }}>💚</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.caregiverName}>{caregiverName || 'माया घिमिरे'}</Text>
              <Text style={styles.caregiverRole}>प्राथमिक हेरचाहकर्ता · Primary Caregiver</Text>
              <Text style={styles.caregiverPhone}>📞 {caregiverPhone || '९८४१११२२३३'}</Text>
            </View>
            <Pressable
              style={styles.caregiverCallBtn}
              onPress={() => {
                router.push({ pathname: '/Caregiverpage', params: { viewer: 'parent' } });
              }}
            >
              <Text style={styles.caregiverCallText}>ड्यासबोर्ड ›</Text>
            </Pressable>
          </View>

          {/* Doctor (view only — set at child registration) */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>डाक्टर (Doctor):</Text>
          <View style={styles.caregiverBox}>
            <View style={styles.caregiverIcon}>
              <Text style={{ fontSize: 24 }}>🩺</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.caregiverName}>{doctor?.name || 'अझै थपिएको छैन (Not added yet)'}</Text>
              <Text style={styles.caregiverRole}>बालबालिकाको डाक्टर · Child's Doctor</Text>
              {doctor?.phone ? (
                <Text style={styles.caregiverPhone}>📞 {doctor.phone}</Text>
              ) : null}
            </View>
            {doctor?.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call doctor"
                style={styles.caregiverCallBtn}
                onPress={() => dialPhone(doctor.phone)}
              >
                <Text style={styles.caregiverCallText}>📞 कल</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* 5. Daily Routine Monitoring & Controls */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardSectionTitle}>५. दैनिक दिनचर्या अनुगमन (Daily Routine)</Text>
              <Text style={styles.cardHint}>
                {routines.filter((r) => r.completed).length} / {routines.length} कार्यहरू पूरा भयो (Tasks Completed)
              </Text>
            </View>
            <Pressable
              style={styles.routineResetBtn}
              onPress={handleResetRoutines}
            >
              <Text style={styles.routineResetBtnText}>🔄 आजका कार्य रिसेट</Text>
            </Pressable>
          </View>

          {/* Routine List */}
          <View style={styles.routineList}>
            {routines.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.routineItemRow,
                  item.completed && styles.routineItemRowCompleted,
                ]}
                onPress={() => handleToggleRoutine(item.id)}
              >
                <View style={[styles.routineCheckbox, item.completed && styles.routineCheckboxChecked]}>
                  <Text style={[styles.routineCheckboxText, item.completed && styles.routineCheckboxTextChecked]}>
                    {item.completed ? '✓' : ''}
                  </Text>
                </View>
                <Text style={styles.routineItemIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routineItemTitle, item.completed && styles.routineItemTitleCompleted]}>
                    {item.nepaliTitle}
                  </Text>
                  <Text style={styles.routineItemSub}>
                    {item.englishTitle} · {item.time}
                  </Text>
                </View>
                <Text style={[styles.routineBadge, item.completed ? styles.routineBadgeDone : styles.routineBadgePending]}>
                  {item.completed ? 'सम्पन्न' : 'बाँकी'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.openRoutinePageBtn}
            onPress={() => router.push('/Dailyroutinepage')}
          >
            <Text style={styles.openRoutinePageBtnText}>
              📅 पूर्ण दिनचर्या तालिका खोल्नुहोस् (Open Full Schedule) ›
            </Text>
          </Pressable>
        </View>

        {/* 6. Quick App Navigation Hub */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>६. द्रुत नेभिगेसन (Quick App Hub)</Text>
          <Text style={styles.cardHint}>
            एपका मुख्य सुविधाहरूमा सिधै जानुहोस्
          </Text>

          <View style={styles.quickNavGrid}>
            {[
              { title: 'गृहपृष्ठ (Home)', icon: '🏠', route: '/Homepage' as const },
              { title: 'हेरचाहकर्ता (Caregiver)', icon: '💚', route: '/Caregiverpage?viewer=parent' as const },
              { title: 'दिनचर्या (Routine)', icon: '📅', route: '/Dailyroutinepage' as const },
              { title: 'ध्यान घण्टी (Bell)', icon: '🔔', route: '/Attentionbellpage' as const },
              { title: 'फ्ल्यासकार्ड (Cards)', icon: '🗂️', route: '/Flashcardpage' as const },
              { title: 'दर्ता / परिवर्तन (Register)', icon: '📝', route: '/ChildRegistrationPage' as const },
            ].map((navItem) => (
              <Pressable
                key={navItem.route}
                style={styles.quickNavTile}
                onPress={() => router.push(navItem.route)}
              >
                <Text style={styles.quickNavTileIcon}>{navItem.icon}</Text>
                <Text style={styles.quickNavTileText}>{navItem.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Save Settings Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save parents and child settings"
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressedState]}
          onPress={handleSaveSettings}
        >
          <Text style={styles.saveButtonText}>
            ✓ सेटिङहरू सुरक्षित गर्नुहोस् (Save Settings)
          </Text>
        </Pressable>
      </ScrollView>

      {/* Success Modal Confirmation Dialog */}
      <Modal
        visible={saveSuccessVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSaveSuccessVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSaveSuccessVisible(false)}
        >
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconEmoji}>✓</Text>
            </View>

            <Text style={styles.successTitleNe}>सेटिङहरू सुरक्षित भयो!</Text>
            <Text style={styles.successTitleEn}>Settings Saved Successfully</Text>

            <Text style={styles.successDesc}>
              बालबालिकाको नाम, अवतार र सबै अभिभावक प्राथमिकताहरू सुरक्षित गरियो।
            </Text>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.homeActionButton}
                onPress={() => {
                  setSaveSuccessVisible(false);
                  router.replace('/Homepage');
                }}
              >
                <Text style={styles.homeActionText}>गृहपृष्ठ जानुहोस् · Go to Home</Text>
              </Pressable>

              <Pressable
                style={styles.stayActionButton}
                onPress={() => setSaveSuccessVisible(false)}
              >
                <Text style={styles.stayActionText}>यहाँ नै बस्नुहोस् · Stay Here</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5ECD9',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAE0CE',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    columnGap: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#342419',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4B2419',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  titleSection: {
    marginVertical: 12,
  },
  nepaliTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: '#342419',
    letterSpacing: -0.4,
  },
  englishTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#8C461F',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#76675B',
    marginTop: 4,
    lineHeight: 18.5,
  },
  card: {
    backgroundColor: '#FFFDF9',
    borderRadius: 22,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E8DED2',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardSectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#342419',
    marginBottom: 8,
  },
  cardHint: {
    fontSize: 12,
    color: '#76675B',
    marginBottom: 12,
  },
  avatarPreviewDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F7EDE1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#8C461F',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5C4A3E',
    marginBottom: 6,
    marginTop: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6EFE6',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2D5C7',
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: '#342419',
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  avatarPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5ECE0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  avatarPillActive: {
    borderColor: '#8C461F',
    backgroundColor: '#FDEAE0',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  miniCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#28552F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCheckText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  speedBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F4EDE1',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  speedBtnActive: {
    backgroundColor: '#8C461F',
    borderColor: '#733716',
  },
  speedBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#54251B',
  },
  speedBtnTextActive: {
    color: '#FFFFFF',
  },
  testVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EBE2D3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    columnGap: 8,
    borderWidth: 1,
    borderColor: '#DACDBE',
  },
  testVoiceButtonActive: {
    backgroundColor: '#28552F',
    borderColor: '#28552F',
  },
  testVoiceEmoji: {
    fontSize: 15,
  },
  testVoiceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#342419',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toggleBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F0E7DA',
    marginTop: 6,
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#342419',
  },
  toggleSub: {
    fontSize: 11.5,
    color: '#76675B',
    marginTop: 2,
  },
  caregiverBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF7EC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D7EACF',
  },
  caregiverIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D7EACF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#28552F',
  },
  caregiverRole: {
    fontSize: 11,
    color: '#4B6B4F',
    marginTop: 1,
  },
  caregiverPhone: {
    fontSize: 11,
    fontWeight: '600',
    color: '#28552F',
    marginTop: 2,
  },
  caregiverCallBtn: {
    backgroundColor: '#DDEED7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BEDBB7',
  },
  caregiverCallText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#28552F',
  },
  saveButton: {
    backgroundColor: '#28552F',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  pressedState: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFDF9',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DED2',
    elevation: 8,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#28552F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconEmoji: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  successTitleNe: {
    fontSize: 22,
    fontWeight: '900',
    color: '#342419',
    textAlign: 'center',
  },
  successTitleEn: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#8C461F',
    marginTop: 2,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 13,
    color: '#76675B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    marginBottom: 20,
  },
  modalActionRow: {
    width: '100%',
    rowGap: 10,
  },
  homeActionButton: {
    backgroundColor: '#28552F',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  homeActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stayActionButton: {
    backgroundColor: '#EFE5D6',
    borderRadius: 16,
    paddingVertical: 11,
    alignItems: 'center',
  },
  stayActionText: {
    color: '#4B2419',
    fontSize: 13,
    fontWeight: '700',
  },
  bellStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7EFE4',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8D9C8',
  },
  bellStatusBoxActive: {
    backgroundColor: '#FDECE4',
    borderColor: '#E8A382',
  },
  bellStatusIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EDE1D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellStatusIconBoxActive: {
    backgroundColor: '#FAD8C8',
  },
  bellStatusTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#342419',
  },
  bellStatusTitleActive: {
    color: '#BA3A10',
  },
  bellStatusSub: {
    fontSize: 11.5,
    color: '#76675B',
    marginTop: 2,
  },
  bellMuteBtn: {
    backgroundColor: '#BA3A10',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  bellMuteBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  bellTriggerBtn: {
    backgroundColor: '#8C461F',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  bellTriggerBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  routineResetBtn: {
    backgroundColor: '#F3E9DA',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2D3C0',
  },
  routineResetBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5C4A3E',
  },
  routineList: {
    marginTop: 4,
    marginBottom: 10,
    rowGap: 8,
  },
  routineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7EFE4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DCCD',
    columnGap: 10,
  },
  routineItemRowCompleted: {
    backgroundColor: '#EDF5EB',
    borderColor: '#CBE2C8',
  },
  routineCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#8C7D70',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  routineCheckboxChecked: {
    backgroundColor: '#28552F',
    borderColor: '#28552F',
  },
  routineCheckboxText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: 'transparent',
  },
  routineCheckboxTextChecked: {
    color: '#FFFFFF',
  },
  routineItemIcon: {
    fontSize: 20,
  },
  routineItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#342419',
  },
  routineItemTitleCompleted: {
    color: '#28552F',
    textDecorationLine: 'line-through',
  },
  routineItemSub: {
    fontSize: 11,
    color: '#76675B',
    marginTop: 1,
  },
  routineBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  routineBadgeDone: {
    backgroundColor: '#D7EACF',
    color: '#28552F',
  },
  routineBadgePending: {
    backgroundColor: '#EBE2D3',
    color: '#76675B',
  },
  openRoutinePageBtn: {
    backgroundColor: '#EFE5D6',
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DED1C0',
  },
  openRoutinePageBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#54251B',
  },
  quickNavGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  quickNavTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6EFE6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5D8C9',
    columnGap: 8,
  },
  quickNavTileIcon: {
    fontSize: 18,
  },
  quickNavTileText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#342419',
    flex: 1,
  },
});

