import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  Pressable,
  Platform,
  useWindowDimensions,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { API_BASE_URL } from '@/constants/api';

const REGISTERED_NAME_KEY = 'voiceme.registeredName';
const REGISTERED_AGE_KEY = 'voiceme.registeredAge';
const REGISTERED_AVATAR_KEY = 'voiceme.registeredAvatar';
const AUTH_TOKEN_KEY = 'voiceme.authToken';

interface GPSStatus {
  connected: boolean;
  location_label: string | null;
  updated_at: string | null;
}

export interface HomeDashboardProps {
  onNavigateToFlashcards?: () => void;
  onNavigateToGPS?: () => void;
  onNavigateToRoutine?: () => void;
  onNavigateToBell?: () => void;
}

export default function Homepage({
  onNavigateToFlashcards,
  onNavigateToGPS,
  onNavigateToRoutine,
  onNavigateToBell,
}: HomeDashboardProps) {
  const { width } = useWindowDimensions();
  // 2 columns with 20px padding and 14px gap
  const cardWidth = Math.floor((width - 40 - 14) / 2);

  const [bellActive, setBellActive] = useState(false);
  const [registeredName, setRegisteredName] = useState('आरव (Aarav)');
  const [registeredAge, setRegisteredAge] = useState('६ वर्ष (6 yrs)');
  const [registeredAvatar, setRegisteredAvatar] = useState('👦');
  const [menuVisible, setMenuVisible] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GPSStatus | null>(null);
  const [routineSummary, setRoutineSummary] = useState<{ done: number; total: number } | null>(null);

  const loadUserData = useCallback(() => {
    AsyncStorage.multiGet([REGISTERED_NAME_KEY, REGISTERED_AGE_KEY, REGISTERED_AVATAR_KEY])
      .then((entries) => {
        const name = entries[0][1];
        const age = entries[1][1];
        const avatar = entries[2][1];
        if (name?.trim()) setRegisteredName(name.trim());
        if (age?.trim()) setRegisteredAge(age.trim());
        if (avatar?.trim()) setRegisteredAvatar(avatar.trim());
      })
      .catch(() => { });
  }, []);

  // Backend is the source of truth once a child profile exists; AsyncStorage
  // above just keeps showing the last known values while this is in flight
  // or if the device is offline / no profile has been created yet.
  const loadBackendData = useCallback(async () => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const profileRes = await fetch(`${API_BASE_URL}/api/child/profile/`, { headers });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.name?.trim()) setRegisteredName(profile.name.trim());
        if (profile.age?.trim()) setRegisteredAge(profile.age.trim());
        if (profile.avatar?.trim()) setRegisteredAvatar(profile.avatar.trim());
        if (profile.gps) setGpsStatus(profile.gps);
      } else if (profileRes.status === 404) {
        // No child of its own: if this account is a caregiver linked by
        // connect code (e.g. a session from before the role was remembered),
        // it belongs on the caregiver dashboard, not the child's home.
        const cgRes = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, { headers });
        if (cgRes.ok) {
          await AsyncStorage.setItem('voiceme.selectedRole', 'caregiver');
          router.replace('/Caregiverpage');
          return;
        }
      }
    } catch {
      // Offline or backend unreachable: keep whatever AsyncStorage/defaults are showing.
    }

    try {
      const gpsRes = await fetch(`${API_BASE_URL}/api/child/gps/`, { headers });
      if (gpsRes.ok) setGpsStatus(await gpsRes.json());
    } catch { }

    try {
      const routinesRes = await fetch(`${API_BASE_URL}/api/routines/`, { headers });
      if (routinesRes.ok) {
        const data = await routinesRes.json();
        const items = Array.isArray(data.items) ? data.items : [];
        setRoutineSummary({
          done: items.filter((i: { completed?: boolean }) => i.completed).length,
          total: items.length,
        });
      }
    } catch { }
  }, []);

  useEffect(() => {
    loadUserData();
    loadBackendData();
  }, [loadUserData, loadBackendData]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      loadBackendData();

      // The SOS device reports its position every ~30 s; keep the live
      // location current while this screen is open.
      const interval = setInterval(async () => {
        try {
          const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
          if (!token) return;
          const res = await fetch(`${API_BASE_URL}/api/child/gps/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setGpsStatus(await res.json());
        } catch { }
      }, 15000);
      return () => clearInterval(interval);
    }, [loadUserData, loadBackendData])
  );

  // Attention bell chime & voice prompt
  const handleRingAttentionBell = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch { }

    setBellActive(true);

    try {
      Speech.stop();
      Speech.speak('ध्यान दिनुहोस्', {
        language: 'ne-NP',
        pitch: 1.1,
        rate: 0.9,
        onDone: () => setBellActive(false),
        onError: () => setBellActive(false),
      });
    } catch {
      setTimeout(() => setBellActive(false), 1200);
    }
  };

  const handleGPSPress = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    if (onNavigateToGPS) {
      onNavigateToGPS();
      return;
    }

    const connected = gpsStatus?.connected ?? false;
    const locationLabel = gpsStatus?.location_label || 'थाहा छैन (Unknown)';
    const updatedAt = gpsStatus?.updated_at
      // Backend timestamps are UTC without a "Z"; add it so this shows local time.
      ? new Date(gpsStatus.updated_at + (gpsStatus.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString()
      : 'भर्खरै (Just now)';

    Alert.alert(
      '📍 जीपीएस ब्याण्ड स्थिति (GPS Status)',
      `स्थिति: ${connected ? 'जोडिएको छ · Live' : 'जोडिएको छैन (Disconnected)'}\nस्थान: ${locationLabel}\nअन्तिम अपडेट: ${updatedAt}`
    );
  };

  const handleTriggerSOS = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch { }

    router.push('/SOSpage');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F4EFE6"
        translucent={Platform.OS === 'android'}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Header Profile (Directs to Child Profile) */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Child Profile"
            style={({ pressed }) => [styles.profileRow, pressed && styles.pressedState]}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch { }
              router.push('/Childpage');
            }}
          >
            {/* Child Avatar Disc */}
            <View style={styles.avatarDisc}>
              <Text style={styles.avatarEmoji}>{registeredAvatar}</Text>
            </View>

            {/* Name & Age Info */}
            <View style={styles.nameBlock}>
              <View style={styles.greetingTitleRow}>
                <Text style={styles.greetingTitle}>नमस्ते, {registeredName}</Text>
                <Text style={styles.profileArrow}> ›</Text>
              </View>
              <Text style={styles.greetingSubtitle}>
                {registeredName} · {registeredAge}
              </Text>
            </View>
          </Pressable>

          <View style={styles.headerRightActions}>
            {/* Top-Right Parents Dashboard Icon Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Parents Dashboard"
              style={({ pressed }) => [styles.actionCircle, pressed && styles.pressedState]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch { }
                router.push('/Parentspage');
              }}
            >
              <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                  stroke="#9C532B"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Circle cx={9} cy={7} r={4} stroke="#9C532B" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                <Path
                  d="M23 21v-2a4 4 0 0 0-3-3.87"
                  stroke="#9C532B"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d="M16 3.13a4 4 0 0 1 0 7.75"
                  stroke="#9C532B"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>

            {/* Top-Right Settings / Menu Emblem Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings menu"
              style={({ pressed }) => [styles.actionCircle, pressed && styles.pressedState]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch { }
                setMenuVisible(true);
              }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={6} r={2.5} fill="#9C532B" />
                <Circle cx={12} cy={12} r={2.5} fill="#9C532B" />
                <Circle cx={12} cy={18} r={2.5} fill="#9C532B" />
              </Svg>
            </Pressable>
          </View>
        </View>

        {/* 2. Live Location Status Banner (घरमा · At home) */}
        <View style={styles.locationBanner}>
          <View style={styles.locationLeft}>
            {/* GPS Target / Crosshair Icon */}
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={6.5} stroke="#3F5B39" strokeWidth={2.2} />
              <Line x1={12} y1={2} x2={12} y2={5} stroke="#3F5B39" strokeWidth={2.2} strokeLinecap="round" />
              <Line x1={12} y1={19} x2={12} y2={22} stroke="#3F5B39" strokeWidth={2.2} strokeLinecap="round" />
              <Line x1={2} y1={12} x2={5} y2={12} stroke="#3F5B39" strokeWidth={2.2} strokeLinecap="round" />
              <Line x1={19} y1={12} x2={22} y2={12} stroke="#3F5B39" strokeWidth={2.2} strokeLinecap="round" />
            </Svg>

            <View style={styles.locationTextBlock}>
              <Text style={styles.locationMainText}>
                {gpsStatus?.location_label || 'घरमा · At home'}
              </Text>
              <Text style={styles.locationSubText}>
                {gpsStatus?.connected ? 'live location · updated now' : 'GPS band not connected'}
              </Text>
            </View>
          </View>

          {/* Active status indicator dot */}
          <View style={[styles.statusDot, !gpsStatus?.connected && styles.statusDotInactive]} />
        </View>

        {/* 3. 2x2 Feature Cards Grid */}
        <View style={styles.grid}>
          {/* Card 1: फ्लैशकार्ड (Flashcards) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Flashcards"
            onPress={onNavigateToFlashcards ?? (() => router.push('/Flashcardpage'))}
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth, backgroundColor: '#FCE6D9' },
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardIconBox}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Rect x={3} y={3} width={18} height={18} rx={4} stroke="#8A4A28" strokeWidth={2.2} />
                <Rect x={8} y={8} width={8} height={8} rx={1.5} stroke="#8A4A28" strokeWidth={2} />
              </Svg>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>फ्लैशकार्ड</Text>
              <Text style={styles.cardSubtitle}>Flashcards</Text>
              <Text style={styles.cardMeta}>8 cards · offline</Text>
            </View>
          </Pressable>

          {/* Card 2: जीपीएस ब्याण्ड (GPS band) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View GPS Band Status"
            onPress={handleGPSPress}
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth, backgroundColor: '#D8E9CA' },
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardIconBox}>
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 2a3.5 3.5 0 0 0-3.5 3.5c0 1.93 1.57 3.5 3.5 3.5S15.5 7.43 15.5 5.5A3.5 3.5 0 0 0 12 2Z"
                  fill="#3E5C37"
                />
                <Path
                  d="M6.5 7.5A3.5 3.5 0 0 0 3 11c0 1.93 1.57 3.5 3.5 3.5S10 12.93 10 11a3.5 3.5 0 0 0-3.5-3.5Z"
                  fill="#3E5C37"
                />
                <Path
                  d="M17.5 7.5A3.5 3.5 0 0 0 14 11c0 1.93 1.57 3.5 3.5 3.5s3.5-1.57 3.5-3.5a3.5 3.5 0 0 0-3.5-3.5Z"
                  fill="#3E5C37"
                />
                <Path
                  d="M12 13a3.5 3.5 0 0 0-3.5 3.5c0 1.93 1.57 3.5 3.5 3.5s3.5-1.57 3.5-3.5A3.5 3.5 0 0 0 12 13Z"
                  fill="#3E5C37"
                />
              </Svg>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>जीपीएस ब्याण्ड</Text>
              <Text style={styles.cardSubtitle}>GPS band</Text>
            </View>
          </Pressable>

          {/* Card 3: ध्यान घण्टी (Attention bell) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ring Attention Bell"
            onPress={
              onNavigateToBell ??
              (() => {
                handleRingAttentionBell();
                router.push('/Attentionbellpage');
              })
            }
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth, backgroundColor: '#F8EBE3' },
              bellActive && styles.bellCardActive,
              pressed && styles.cardPressed,
            ]}
          >
            {/* Bell graphic in circular badge */}
            <View style={styles.bellBadge}>
              <Svg width={30} height={30} viewBox="0 0 100 100" fill="none">
                <Circle cx={50} cy={24} r={9} stroke="#8C461F" strokeWidth={6} />
                <Path
                  d="M26 62 C26 36, 74 36, 74 62 L82 72 L18 72 Z"
                  fill="#FFFDF8"
                  stroke="#8C461F"
                  strokeWidth={6}
                  strokeLinejoin="round"
                />
                <Circle cx={50} cy={80} r={7} fill="#8C461F" />
              </Svg>
            </View>

            <View style={styles.cardContent}>
              <View style={styles.bellTitleRow}>
                <Text style={styles.cardTitle}>ध्यान घण्टी</Text>
                {/* Speaker icon */}
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M11 5L6 9H2V15H6L11 19V5Z"
                    stroke="#8A786C"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M15.54 8.46C16.48 9.4 17 10.68 17 12"
                    stroke="#8A786C"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <Text style={styles.cardSubtitle}>Attention bell</Text>
              <Text style={styles.cardMeta}>
                {bellActive ? 'chiming...' : 'tap to chime'}
              </Text>
            </View>
          </Pressable>

          {/* Card 4: दिनचर्या (Daily routine) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Daily Routine"
            onPress={onNavigateToRoutine ?? (() => router.push('/Dailyroutinepage'))}
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth, backgroundColor: '#E7E3D8' },
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardIconBox}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Polyline
                  points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
                  stroke="#574B40"
                  strokeWidth={2.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>दिनचर्या</Text>
              <Text style={styles.cardSubtitle}>Daily routine</Text>
              <Text style={styles.cardMeta}>
                {routineSummary
                  ? routineSummary.total > 0
                    ? `${routineSummary.done} of ${routineSummary.total} done`
                    : 'set up your day'
                  : '...'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* 4. AI HELPER — a distinct banner below the feature grid, not one
            of its cards, since this isn't a fixed feature like the four
            above but a context-aware helper layered on top of them. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open AI Helper"
          style={({ pressed }) => [
            styles.aiHelperButton,
            pressed && styles.aiHelperButtonPressed,
          ]}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch { }
            router.push('/AIFlashcardsPage');
          }}
        >
          <View style={styles.aiHelperContentRow}>
            <View style={styles.aiHelperIconBadge}>
              <Text style={styles.aiHelperEmoji}>🤖</Text>
            </View>

            <View style={styles.aiHelperInfo}>
              <Text style={styles.aiHelperTitle}>AI HELPER</Text>
              <Text style={styles.aiHelperSubtitle}>
                समय र स्थान अनुसार अहिले के गर्ने भन्ने देखाउँछ
              </Text>
            </View>

            <View style={styles.aiHelperArrowBadge}>
              <Text style={styles.aiHelperArrowText}>›</Text>
            </View>
          </View>
        </Pressable>

        {/* 5. SOS Emergency Button Banner */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="आपतकालीन SOS (Emergency Alert)"
          style={({ pressed }) => [
            styles.sosButton,
            pressed && styles.sosButtonPressed,
          ]}
          onPress={handleTriggerSOS}
        >
          <View style={styles.sosContentRow}>
            <View style={styles.sosIconBadge}>
              <Text style={styles.sosEmoji}>🚨</Text>
            </View>

            <View style={styles.sosInfo}>
              <View style={styles.sosTitleRow}>
                <Text style={styles.sosTitle}>आपतकालीन SOS</Text>
                <View style={styles.sosPill}>
                  <Text style={styles.sosPillText}>EMERGENCY</Text>
                </View>
              </View>
              <Text style={styles.sosSubtitle}>
                मद्दत चाहिन्छ? हेरचाहकर्ता र परिवारलाई तुरून्त खबर गर्नुहोस्
              </Text>
            </View>

            <View style={styles.sosArrowBadge}>
              <Text style={styles.sosArrowText}>›</Text>
            </View>
          </View>
        </Pressable>
      </ScrollView>

      {/* Emergency SOS Active Modal */}
      <Modal
        visible={sosModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSosModalVisible(false)}
      >
        <View style={styles.sosModalOverlay}>
          <View style={styles.sosModalCard}>
            <View style={styles.sosModalPulseCircle}>
              <Text style={styles.sosModalIcon}>🚨</Text>
            </View>

            <Text style={styles.sosModalTitleNepali}>
              आपतकालीन सतर्कता पठाइयो!
            </Text>
            <Text style={styles.sosModalTitleEnglish}>
              Emergency SOS Alert Broadcasted
            </Text>

            <View style={styles.sosLocationBox}>
              <Text style={styles.sosLocationHeading}>📍 वर्तमान स्थान (Live Location):</Text>
              <Text style={styles.sosLocationText}>
                घर (Ward 4 Home Safe Zone) • 27.7172° N, 85.3240° E
              </Text>
              <Text style={styles.sosDispatchText}>
                ✓ स्याहारकर्ता (Maya Sharma) लाई सूचना पठाइयो
              </Text>
              <Text style={styles.sosDispatchText}>
                ✓ अभिभावक (Sita Sharma) लाई सूचना पठाइयो
              </Text>
            </View>

            {/* Quick Emergency Call Button */}
            <Pressable
              style={({ pressed }) => [
                styles.sosCallButton,
                pressed && styles.pressedState,
              ]}
              onPress={() => {
                Alert.alert(
                  '📞 आपतकालीन कल (Emergency Call)',
                  'स्याहारकर्ता (Maya Sharma) वा नेपाल प्रहरी (100) लाई कल गर्नुहोस्?',
                  [
                    { text: 'रद्द गर्नुहोस् (Cancel)', style: 'cancel' },
                    { text: 'स्याहारकर्तालाई कल (Call Caregiver)', onPress: () => Alert.alert('Calling Maya Sharma...', '९८४१११२२३३') },
                    { text: 'प्रहरी (Call 100)', onPress: () => Alert.alert('Calling Police 100...', 'Dialing 100') },
                  ]
                );
              }}
            >
              <Text style={styles.sosCallButtonText}>📞 तुरुन्त कल गर्नुहोस् (Call Caregiver)</Text>
            </Pressable>

            {/* Safe / Dismiss Button */}
            <Pressable
              style={({ pressed }) => [
                styles.sosSafeButton,
                pressed && styles.pressedState,
              ]}
              onPress={() => {
                try {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch { }
                setSosModalVisible(false);
              }}
            >
              <Text style={styles.sosSafeButtonText}>✓ म सुरक्षित छु (I am Safe / Cancel)</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Quick Menu Modal for Settings / Navigation */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Voice Me विकल्पहरू (Options)</Text>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push({ pathname: '/Caregiverpage', params: { viewer: 'parent' } });
              }}
            >
              <Text style={styles.menuItemText}>💚 हेरचाहकर्ता ड्यासबोर्ड (Caregiver)</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/Childpage');
              }}
            >
              <Text style={styles.menuItemText}>🧒 बालबालिका प्रोफाइल (Child Profile)</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/Parentspage');
              }}
            >
              <Text style={styles.menuItemText}>👨‍👩‍👧 अभिभावक ड्यासबोर्ड (Parent Dashboard)</Text>
            </Pressable>

            <Pressable
              style={[styles.menuItem, { backgroundColor: '#FDECEA' }]}
              onPress={() => {
                setMenuVisible(false);
                router.push('/SOSpage');
              }}
            >
              <Text style={[styles.menuItemText, { color: '#C02C1D' }]}>🚨 आपतकालीन SOS (Emergency SOS)</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/RoleSelectionpage');
              }}
            >
              <Text style={styles.menuItemText}>👥 भूमिका छान्नुहोस् (Switch Role)</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/Loginpage');
              }}
            >
              <Text style={styles.menuItemText}>🔑 लगइन पृष्ठ (Login Page)</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/Splashpage');
              }}
            >
              <Text style={styles.menuItemText}>✨ स्प्लास पृष्ठ (Splash Screen)</Text>
            </Pressable>

            <Pressable
              style={[styles.menuItem, styles.menuCancelItem]}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.menuCancelText}>रद्द गर्नुहोस् (Close)</Text>
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
    backgroundColor: '#F4EFE6', // Warm oatmeal background
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#C6DBC3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#B3CDB0',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  nameBlock: {
    marginLeft: 12,
    flex: 1,
  },
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileArrow: {
    fontSize: 18,
    fontWeight: '800',
    color: '#8C461F',
  },
  greetingTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#342419',
    letterSpacing: -0.4,
  },
  greetingSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#76675B',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  parentQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE1D1',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    columnGap: 5,
    borderWidth: 1,
    borderColor: '#DBCBBB',
  },
  parentQuickIcon: {
    fontSize: 15,
  },
  parentQuickText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B2419',
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FCE5D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedState: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#D6E7CA',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTextBlock: {
    marginLeft: 12,
  },
  locationMainText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2F472A',
  },
  locationSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#55714F',
    marginTop: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3F6838',
  },
  statusDotInactive: {
    backgroundColor: '#B0A99C',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  card: {
    height: 178,
    borderRadius: 26,
    padding: 16,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 5,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardIconBox: {
    alignItems: 'flex-start',
  },
  bellBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFE3DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCardActive: {
    borderWidth: 2,
    borderColor: '#B85827',
  },
  bellTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardContent: {
    marginTop: 'auto',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#342419',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#664F40',
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#8A786C',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFDF9',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E7DDD0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#342419',
    marginBottom: 14,
    textAlign: 'center',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F5EFE6',
    marginBottom: 8,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#342419',
  },
  menuCancelItem: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 0,
  },
  menuCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A786C',
  },

  /* AI Helper Banner Styles */
  aiHelperButton: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: '#DCE6F2',
    borderWidth: 1.5,
    borderColor: '#B7CBE8',
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#2A4F8C',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  aiHelperButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
    backgroundColor: '#CBDBEF',
  },
  aiHelperContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiHelperIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#C6D9F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#A9C3E8',
  },
  aiHelperEmoji: {
    fontSize: 22,
  },
  aiHelperInfo: {
    flex: 1,
  },
  aiHelperTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F3A63',
    letterSpacing: 0.3,
  },
  aiHelperSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#3F5A85',
    lineHeight: 16,
  },
  aiHelperArrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C6D9F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  aiHelperArrowText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F3A63',
    marginTop: -2,
  },

  /* SOS Emergency Button Styles */
  sosButton: {
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 22,
    backgroundColor: '#FFE9E4',
    borderWidth: 1.5,
    borderColor: '#F8B6AA',
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#C42B1C',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  sosButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
    backgroundColor: '#FDD8D2',
  },
  sosContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sosIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDE0DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#F7BCB1',
  },
  sosEmoji: {
    fontSize: 22,
  },
  sosInfo: {
    flex: 1,
  },
  sosTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sosTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B82819',
  },
  sosPill: {
    backgroundColor: '#BA2A1A',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  sosPillText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sosSubtitle: {
    fontSize: 11.5,
    color: '#844D42',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  sosArrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F7CDC5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sosArrowText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#BA2A1A',
    marginTop: -2,
  },

  /* SOS Modal Styles */
  sosModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 14, 11, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sosModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFDFB',
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F7C6BC',
    ...Platform.select({
      ios: {
        shadowColor: '#C42B1C',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sosModalPulseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FDE0DB',
    borderWidth: 3,
    borderColor: '#C73222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sosModalIcon: {
    fontSize: 34,
  },
  sosModalTitleNepali: {
    fontSize: 20,
    fontWeight: '800',
    color: '#B32517',
    textAlign: 'center',
  },
  sosModalTitleEnglish: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7D473E',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  sosLocationBox: {
    width: '100%',
    backgroundColor: '#FAF5EE',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFE3D5',
    gap: 4,
  },
  sosLocationHeading: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#342419',
  },
  sosLocationText: {
    fontSize: 12,
    color: '#5B4E44',
    fontWeight: '500',
  },
  sosDispatchText: {
    fontSize: 11.5,
    color: '#286B26',
    fontWeight: '600',
    marginTop: 2,
  },
  sosCallButton: {
    width: '100%',
    backgroundColor: '#BA2A1A',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 3,
  },
  sosCallButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  sosSafeButton: {
    width: '100%',
    backgroundColor: '#EAE1D3',
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8CABB',
  },
  sosSafeButtonText: {
    color: '#4B382A',
    fontSize: 14,
    fontWeight: '700',
  },
});
