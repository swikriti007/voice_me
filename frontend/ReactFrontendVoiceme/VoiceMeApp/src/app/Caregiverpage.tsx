import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Pressable,
  Platform,
  Switch,
  Modal,
  RefreshControl,
  TextInput,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle, Rect, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { dialPhone } from '@/constants/phone';
import { SosAlertBanner } from '@/components/sos-alert-banner';
import { LogoutButton } from '@/components/logout-button';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

// Shape returned by /api/caregiver/routines/ — the connected child's own
// routine, which the caregiver can only watch, never set or edit.
interface RoutineItem {
  id: string;
  time: string;
  title: string;
  icon: string;
  completed: boolean;
}

// The child's latest position, as the SOS device (or app) last reported it.
interface GPSStatus {
  connected: boolean;
  location_label: string | null;
  lat?: number | null;
  lng?: number | null;
  updated_at: string | null;
}

// How often the dashboard re-fetches the child's live location.
const LOCATION_REFRESH_MS = 15000;

const AUTH_TOKEN_KEY = 'voiceme.authToken';

const SELECTED_ROLE_KEY = 'voiceme.selectedRole';

// Which of the caregiver's linked children the dashboard last showed.
const SELECTED_CHILD_KEY = 'voiceme.caregiverChildId';

// One entry in the caregiver's child switcher (from /api/caregiver/dashboard/).
interface LinkedChild {
  id: string;
  name: string;
  age: string;
  avatar: string;
}

export default function Caregiverpage() {
  // Parents (the child's own "user" account) are supervisors here, not the
  // caregiver: they only get to see who the caregiver is and how to reach
  // them. The operational dashboard (bell, routine tracking, links into the
  // routine editor) belongs to the caregiver's own account only — routines
  // are set for the child, never for the caregiver.
  const { viewer } = useLocalSearchParams<{ viewer?: string }>();
  const [isParentViewer, setIsParentViewer] = useState<boolean | null>(
    viewer === 'parent' ? true : null
  );

  useEffect(() => {
    if (viewer === 'parent') return;
    AsyncStorage.getItem(SELECTED_ROLE_KEY)
      .then((role) => setIsParentViewer(role === 'user'))
      .catch(() => setIsParentViewer(false));
  }, [viewer]);

  if (isParentViewer === null) {
    return <SafeAreaView style={styles.safeArea} />;
  }
  return isParentViewer ? <CaregiverInfoView /> : <CaregiverDashboard />;
}

function CaregiverInfoView() {
  const [caregiver, setCaregiver] = useState<{ name?: string; phone?: string } | null>(null);

  useEffect(() => {
    // Same-device values saved from Parentspage, then the backend's copy
    // (the one the caregiver's connect-code registration actually updates).
    AsyncStorage.multiGet(['voiceme.caregiverName', 'voiceme.caregiverPhone'])
      .then((entries) => {
        const map = Object.fromEntries(entries);
        const name = map['voiceme.caregiverName']?.trim();
        const phone = map['voiceme.caregiverPhone']?.trim();
        if (name || phone) setCaregiver((prev) => prev ?? { name, phone });
      })
      .catch(() => {});

    (async () => {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/child/profile/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const profile = await res.json();
        if (profile.caregiver) setCaregiver(profile.caregiver);
      } catch {
        // Offline or backend unreachable: keep whatever is currently shown.
      }
    })();
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/Parentspage');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F4EFE6"
        translucent={Platform.OS === 'android'}
      />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
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
          <Text style={styles.backButtonText}>पछाडि · Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <Text style={styles.nepaliTitle}>हेरचाहकर्ता विवरण</Text>
          <Text style={styles.englishTitle}>Caregiver Info</Text>
          <Text style={styles.subtitleDesc}>
            तपाईंको बच्चाको हेरचाहकर्ताको सम्पर्क जानकारी
          </Text>
        </View>

        {caregiver?.name || caregiver?.phone ? (
          <View style={styles.childStatusCard}>
            <View style={styles.childHeaderRow}>
              <View style={styles.childAvatarCircle}>
                <Text style={styles.avatarEmoji}>💚</Text>
              </View>
              <View style={styles.childInfoText}>
                <Text style={styles.childName}>{caregiver.name || '—'}</Text>
                <Text style={styles.childMeta}>प्राथमिक हेरचाहकर्ता · Primary Caregiver</Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>📞 फोन (Phone):</Text>
              <Text style={styles.statusValue}>{caregiver.phone || '—'}</Text>
            </View>

            {caregiver.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call caregiver"
                style={({ pressed }) => [styles.dialogActionBtn, { marginTop: 12 }, pressed && styles.pressedState]}
                onPress={() => dialPhone(caregiver.phone)}
              >
                <Text style={styles.dialogActionBtnText}>📞 कल गर्नुहोस् (Call)</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.notConnectedBanner}>
            <Text style={styles.notConnectedText}>
              ⚠️ अझै कुनै हेरचाहकर्ता जोडिएको छैन।
            </Text>
            <Text style={styles.notConnectedSubText}>
              No caregiver connected yet — share your connect code with them.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CaregiverDashboard() {
  const [childName, setChildName] = useState('आरव (Aarav)');
  const [childAge, setChildAge] = useState('६ वर्ष (6 yrs)');
  const [childAvatar, setChildAvatar] = useState('👦');
  // Empty until real contact details load, so the caregiver is never
  // offered a made-up number to call in an emergency.
  const [parentName, setParentName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
  const [caregiverName, setCaregiverName] = useState('');

  const [isBellActive, setIsBellActive] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GPSStatus | null>(null);

  // A caregiver can look after several children; the dashboard shows one at
  // a time. The ref lets the polling timer follow the current selection.
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const selectedChildIdRef = useRef<string | null>(null);
  const [newConnectCode, setNewConnectCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  const completedCount = routines.filter((r) => r.completed).length;
  const progressPercent = routines.length > 0 ? Math.round((completedCount / routines.length) * 100) : 0;

  // In-app modal state for Web & Native compatibility (since Alert.alert is silent on Web)
  const [dialogInfo, setDialogInfo] = useState<{
    visible: boolean;
    titleNe: string;
    titleEn: string;
    message: string;
    phone?: string;
    actionText?: string;
  }>({
    visible: false,
    titleNe: '',
    titleEn: '',
    message: '',
  });

  // The backend is the real link between this caregiver's account and the
  // child they connected to via CaregiverRegistrationPage's code; the
  // AsyncStorage values above are just same-device fallbacks/cache.
  const loadDashboard = useCallback(async (childId?: string | null) => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    let wanted = childId !== undefined ? childId : selectedChildIdRef.current;
    if (wanted === null && childId === undefined) {
      wanted = await AsyncStorage.getItem(SELECTED_CHILD_KEY).catch(() => null);
    }
    const query = (id: string | null) => (id ? `?child_id=${encodeURIComponent(id)}` : '');

    let shownId: string | null = null;
    try {
      let res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/${query(wanted)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // The remembered child may have been unlinked since: fall back to the first.
      if (res.status === 404 && wanted) {
        res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!res.ok) return;

      const child = await res.json();
      setIsConnected(true);
      shownId = child.id ?? null;
      selectedChildIdRef.current = shownId;
      setSelectedChildId(shownId);
      if (shownId) AsyncStorage.setItem(SELECTED_CHILD_KEY, shownId).catch(() => {});
      if (Array.isArray(child.children)) setLinkedChildren(child.children);
      // Set every field, even empty ones, so switching children never leaves
      // the previous child's contacts or location on screen.
      setChildName(child.name?.trim() || '—');
      setChildAge(child.age?.trim() || '—');
      setChildAvatar(child.avatar?.trim() || '🧒');
      setParentName(child.parent?.name || '');
      setEmergencyPhone(child.parent?.phone || '');
      setDoctorName(child.doctor?.name || '');
      setDoctorPhone(child.doctor?.phone || '');
      if (child.caregiver?.name) setCaregiverName(child.caregiver.name);
      setGpsStatus(child.gps ?? null);
    } catch {
      // Offline or backend unreachable: keep whatever is currently shown.
      return;
    }

    // The routine belongs to the child and is set from the child's own
    // account; the caregiver only gets a read-only view of it.
    try {
      const res = await fetch(`${API_BASE_URL}/api/caregiver/routines/${query(shownId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setRoutines([]);
        return;
      }
      const data = await res.json();
      setRoutines(Array.isArray(data.items) ? data.items : []);
    } catch {}
  }, []);

  const handleSelectChild = (id: string) => {
    if (id === selectedChildId) return;
    try {
      Haptics.selectionAsync();
    } catch {}
    loadDashboard(id);
  };

  // Links one more child to this caregiver with that child's parent's code.
  const handleConnectAnotherChild = async () => {
    const code = newConnectCode.trim();
    if (!code) return;
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setConnecting(true);
    setConnectError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/caregiver/connect/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, name: caregiverName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnectError(
          data?.error === 'Invalid connect code.'
            ? 'गलत कोड (Invalid code — please check with the parent)'
            : 'जडान असफल भयो (Could not connect, please try again)'
        );
        return;
      }
      setNewConnectCode('');
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      await loadDashboard(data.id ?? null);
    } catch {
      setConnectError('सर्भरमा पुग्न सकिएन (Could not reach the server)');
    } finally {
      setConnecting(false);
    }
  };

  // Reload on every visit, not just the first mount, so coming back to this
  // screen shows the latest child details, location and routine.
  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const [sosRefreshKey, setSosRefreshKey] = useState(0);
  const { refreshing, onRefresh } = usePullToRefresh(
    useCallback(async () => {
      setSosRefreshKey((k) => k + 1);
      await loadDashboard();
    }, [loadDashboard])
  );

  // Load registered child, caregiver info & bell status from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.multiGet([
      'voiceme.registeredName',
      'voiceme.registeredAge',
      'voiceme.registeredAvatar',
      'voiceme.parentName',
      'voiceme.emergencyPhone',
      'voiceme.caregiverName',
      'voiceme.bellActive',
    ])
      .then((entries) => {
        const map = Object.fromEntries(entries);
        if (map['voiceme.registeredName']?.trim()) setChildName(map['voiceme.registeredName'].trim());
        if (map['voiceme.registeredAge']?.trim()) setChildAge(map['voiceme.registeredAge'].trim());
        if (map['voiceme.registeredAvatar']?.trim()) setChildAvatar(map['voiceme.registeredAvatar'].trim());
        if (map['voiceme.parentName']?.trim()) setParentName(map['voiceme.parentName'].trim());
        if (map['voiceme.emergencyPhone']?.trim()) setEmergencyPhone(map['voiceme.emergencyPhone'].trim());
        if (map['voiceme.caregiverName']?.trim()) setCaregiverName(map['voiceme.caregiverName'].trim());
        if (map['voiceme.bellActive'] !== undefined) {
          setIsBellActive(map['voiceme.bellActive'] === 'true');
        }
      })
      .catch(() => {});


    // Only periodically poll the real-time Attention Bell alert status
    const interval = setInterval(() => {
      AsyncStorage.getItem('voiceme.bellActive')
        .then((val) => {
          setIsBellActive(val === 'true');
        })
        .catch(() => {});
    }, 2500);

    // The SOS device reports its position every ~30 s; keep the card current.
    const locationInterval = setInterval(async () => {
      try {
        const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        if (!token) return;
        const id = selectedChildIdRef.current;
        const res = await fetch(
          `${API_BASE_URL}/api/caregiver/dashboard/${id ? `?child_id=${encodeURIComponent(id)}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const child = await res.json();
        // Ignore a reply for a child the caregiver has switched away from.
        if (child.id === selectedChildIdRef.current && child.gps) setGpsStatus(child.gps);
      } catch {}
    }, LOCATION_REFRESH_MS);

    return () => {
      clearInterval(interval);
      clearInterval(locationInterval);
    };
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/Homepage');
    }
  };

  const handleAcknowledgeBell = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setIsBellActive(false);
    await AsyncStorage.setItem('voiceme.bellActive', 'false').catch(() => {});
    setDialogInfo({
      visible: true,
      titleNe: 'घण्टी स्वीकार गरियो!',
      titleEn: 'Bell Alert Acknowledged',
      message: 'तपाईंले बच्चाको ध्यान घण्टी स्वीकार गरी बन्द गर्नुभयो।',
    });
  };

  const handleRingBellForChild = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    setIsBellActive(true);
    await AsyncStorage.setItem('voiceme.bellActive', 'true').catch(() => {});

    if (soundAlertsEnabled) {
      try {
        Speech.stop();
        Speech.speak('कृपया यता आउनुहोस्, हेरचाहकर्ताले बोलाउँदैछ।', {
          language: 'ne-NP',
          pitch: 1.0,
          rate: 0.95,
        });
      } catch {}
    }

    setDialogInfo({
      visible: true,
      titleNe: 'घण्टी बजाइयो!',
      titleEn: 'Bell Alert Triggered',
      message: 'बच्चालाई बोलाउन ध्यान घण्टी सक्रिय गरियो।',
    });
  };

  const handleCallParent = () => {
    if (!emergencyPhone) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setDialogInfo({
      visible: true,
      titleNe: 'अभिभावकलाई सम्पर्क',
      titleEn: 'Call Parent',
      message: `आमा/अभिभावक: ${parentName || '—'}\nफोन नम्बर: ${emergencyPhone}`,
      phone: emergencyPhone,
      actionText: 'कल गर्नुहोस् (Call Now)',
    });
  };

  const handleCallDoctor = () => {
    if (!doctorPhone) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}

    setDialogInfo({
      visible: true,
      titleNe: 'डाक्टर',
      titleEn: 'Doctor',
      message: `डाक्टर: ${doctorName || '—'}\nफोन नम्बर: ${doctorPhone}`,
      phone: doctorPhone,
      actionText: 'डाक्टरलाई फोन गर्नुहोस् (Call Doctor)',
    });
  };

  const handleSendVoiceReassurance = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const cleanChildName = childName.replace(/\s*\([^)]*\)/g, '').trim() || 'आरव';
    const reassuranceText = `म नजिकै छु, चिन्ता नलिनुहोस् ${cleanChildName}।`;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(reassuranceText);
        utterance.rate = 0.95;
        utterance.lang = 'ne-NP';
        window.speechSynthesis.speak(utterance);
      } catch {}
    } else {
      try {
        Speech.stop();
        Speech.speak(reassuranceText, {
          language: 'ne-NP',
          pitch: 1.0,
          rate: 0.95,
        });
      } catch {}
    }

    setDialogInfo({
      visible: true,
      titleNe: 'सन्देश सफलतापूर्वक पठाइयो!',
      titleEn: 'Voice Reassurance Sent',
      message: `बालबालिकाको डिभाइसमा आवाज बजाइयो:\n"${reassuranceText}"`,
      actionText: 'बुझें (Understood)',
    });
  };

  const dialPhoneNumber = (phone?: string) => {
    if (!phone) {
      setDialogInfo((prev) => ({ ...prev, visible: false }));
      return;
    }
    dialPhone(phone);
    setDialogInfo((prev) => ({ ...prev, visible: false }));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F4EFE6"
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

        <LogoutButton />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9C532B" colors={['#9C532B']} />}
      >
        <SosAlertBanner refreshKey={sosRefreshKey} />

        {/* Title Block */}
        <View style={styles.titleSection}>
          <View style={styles.caregiverBadgeRow}>
            <Text style={styles.caregiverBadgeText}>💚 हेरचाहकर्ता: {caregiverName || '—'}</Text>
          </View>
          <Text style={styles.nepaliTitle}>हेरचाहकर्ता ड्यासबोर्ड</Text>
          <Text style={styles.englishTitle}>Caregiver Dashboard</Text>
          <Text style={styles.subtitleDesc}>
            बालबालिकाको प्रत्यक्ष सुरक्षा, आवाज सन्देश र दिनचर्या निगरानी
          </Text>
        </View>

        {!isConnected && (
          <View style={styles.notConnectedBanner}>
            <Text style={styles.notConnectedText}>
              ⚠️ अझै कुनै बालबालिकासँग जोडिएको छैन। अभिभावकको जोड्ने कोड प्रयोग गरेर पुनः दर्ता गर्नुहोस्।
            </Text>
            <Text style={styles.notConnectedSubText}>
              Not connected to a child yet — register again with the parent's connect code.
            </Text>
          </View>
        )}

        {/* Child switcher: one caregiver, many children */}
        {linkedChildren.length > 1 && (
          <View style={styles.childSwitcher}>
            <Text style={styles.childSwitcherLabel}>
              बालबालिका छान्नुहोस् (Your children · {linkedChildren.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childChipRow}>
              {linkedChildren.map((c) => {
                const active = c.id === selectedChildId;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show ${c.name || 'child'}`}
                    style={({ pressed }) => [styles.childChip, active && styles.childChipActive, pressed && styles.pressedState]}
                    onPress={() => handleSelectChild(c.id)}
                  >
                    <Text style={styles.childChipAvatar}>{c.avatar || '🧒'}</Text>
                    <Text style={[styles.childChipName, active && styles.childChipNameActive]} numberOfLines={1}>
                      {c.name || '—'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 1. Child Live Status Card */}
        <View style={styles.childStatusCard}>
          <View style={styles.childHeaderRow}>
            <View style={styles.childAvatarCircle}>
              <Text style={styles.avatarEmoji}>{childAvatar}</Text>
            </View>

            <View style={styles.childInfoText}>
              <Text style={styles.childName}>{childName}</Text>
              <Text style={styles.childMeta}>उमेर: {childAge}</Text>
            </View>

            <View style={[styles.liveBadge, !gpsStatus?.connected && styles.liveBadgeOffline]}>
              <View style={[styles.liveDot, !gpsStatus?.connected && styles.liveDotOffline]} />
              <Text style={[styles.liveText, !gpsStatus?.connected && styles.liveTextOffline]}>
                {gpsStatus?.connected ? 'लाइभ (Live)' : 'अफलाइन (Offline)'}
              </Text>
            </View>
          </View>

          {/* Location & GPS line */}
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>📍 स्थान (Location):</Text>
            <Text style={styles.statusValue}>
              {gpsStatus?.location_label
                || (gpsStatus?.lat != null && gpsStatus?.lng != null
                  ? `${gpsStatus.lat.toFixed(5)}, ${gpsStatus.lng.toFixed(5)}`
                  : 'थाहा छैन (Unknown)')}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>⌚ जीपीएस ब्याण्ड:</Text>
            <Text style={styles.statusValue}>
              {gpsStatus?.connected
                ? `सक्रिय (Active)${gpsStatus.updated_at
                  ? ` · ${new Date(gpsStatus.updated_at + (gpsStatus.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString()}`
                  : ''}`
                : gpsStatus?.updated_at
                  ? `अफलाइन (Offline) · last seen ${new Date(gpsStatus.updated_at + (gpsStatus.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'जोडिएको छैन (Not connected)'}
            </Text>
          </View>

          {/* Quick Voice Reassurance Action */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send voice reassurance"
            style={({ pressed }) => [
              styles.reassuranceButton,
              pressed && styles.pressedState,
            ]}
            onPress={handleSendVoiceReassurance}
          >
            <Text style={styles.reassuranceText}>
              🔊 आवाज पठाउनुहोस् (Send Voice: "म नजिकै छु")
            </Text>
          </Pressable>
        </View>

        {/* 2. Attention Bell Alert Card */}
        <View style={[styles.bellAlertCard, isBellActive && styles.bellAlertCardActive]}>
          <View style={styles.bellCardHeader}>
            <View style={[styles.bellIconCircle, isBellActive && styles.bellIconCircleActive]}>
              <Text style={styles.bellEmoji}>{isBellActive ? '🔔' : '🔕'}</Text>
            </View>
            <View style={styles.bellTextContainer}>
              <Text style={[styles.bellAlertTitle, isBellActive && styles.bellAlertTitleActive]}>
                {isBellActive ? '⚠️ ध्यान दिनुहोस्: बच्चाले बोलाउँदैछ!' : 'ध्यान घण्टी स्थिति (Bell Alert)'}
              </Text>
              <Text style={styles.bellAlertStatus}>
                {isBellActive
                  ? 'बच्चाको डिभाइसबाट ध्यान घण्टी बजिरहेको छ'
                  : 'सामान्य · कुनै घण्टी बजेको छैन'}
              </Text>
            </View>
          </View>

          <View style={styles.bellActionBtnRow}>
            {isBellActive ? (
              <Pressable
                style={styles.bellAckButton}
                onPress={handleAcknowledgeBell}
              >
                <Text style={styles.bellAckButtonText}>✓ घण्टी स्वीकार गरी बन्द गर्नुहोस्</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.bellRingButton}
                onPress={handleRingBellForChild}
              >
                <Text style={styles.bellRingButtonText}>🔔 बच्चालाई बोलाउनुहोस् (Ring Bell)</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.bellToggleRow}>
            <Text style={styles.toggleLabel}>आवाज अलर्टहरू (Sound Alerts)</Text>
            <Switch
              value={soundAlertsEnabled}
              onValueChange={setSoundAlertsEnabled}
              trackColor={{ false: '#D4C5B0', true: '#2E5936' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 3. Care Tasks & Routine Tracking */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>दिनचर्या र हेरचाह (Daily Routine)</Text>
            <Text style={styles.sectionSub}>
              {completedCount} / {routines.length} पूरा भयो ({progressPercent}%)
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.lockedNotice}>
          <Text style={styles.lockedNoticeText}>
            🔒 दिनचर्या बच्चाको खाताबाट मात्र सेट गरिन्छ (View only — set from the child's account)
          </Text>
        </View>

        <View style={styles.taskCard}>
          {routines.length === 0 && (
            <View style={styles.taskItem}>
              <Text style={styles.taskTime}>अझै कुनै दिनचर्या छैन (No routine set yet)</Text>
            </View>
          )}
          {routines.map((item, index) => (
            <View
              key={item.id}
              style={[styles.taskItem, index > 0 && styles.taskItemBorder]}
            >
              <View style={[styles.taskCheckbox, item.completed && styles.taskCheckboxDone]}>
                {item.completed && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              <View style={styles.taskEmojiCircle}>
                <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              </View>
              <View style={styles.taskInfo}>
                <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>
                  {item.title}
                </Text>
                <Text style={styles.taskTime}>{item.time}</Text>
              </View>
              <Text style={[styles.statusTag, item.completed && styles.statusTagDone]}>
                {item.completed ? 'पूरा भयो' : 'बाँकी'}
              </Text>
            </View>
          ))}
        </View>

        {/* 4. Quick Emergency Contacts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>आपतकालीन सम्पर्क (Emergency Contacts)</Text>
        </View>

        <View style={styles.contactRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !emergencyPhone }}
            disabled={!emergencyPhone}
            style={({ pressed }) => [
              styles.contactButton,
              !emergencyPhone && styles.contactButtonDisabled,
              pressed && styles.pressedState,
            ]}
            onPress={handleCallParent}
          >
            <Text style={styles.contactIcon}>👩‍👦</Text>
            <Text style={styles.contactTitle}>आमा / अभिभावक</Text>
            <Text style={styles.contactSubtitle}>
              {emergencyPhone
                ? parentName || emergencyPhone
                : 'अझै थपिएको छैन (Not added yet)'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !doctorPhone }}
            disabled={!doctorPhone}
            style={({ pressed }) => [
              styles.contactButton,
              !doctorPhone && styles.contactButtonDisabled,
              pressed && styles.pressedState,
            ]}
            onPress={handleCallDoctor}
          >
            <Text style={styles.contactIcon}>🩺</Text>
            <Text style={styles.contactTitle}>डाक्टर (Doctor)</Text>
            <Text style={styles.contactSubtitle}>
              {doctorPhone
                ? doctorName || doctorPhone
                : 'अझै थपिएको छैन (Not added yet)'}
            </Text>
          </Pressable>
        </View>

        {/* 5. Connect another child */}
        {isConnected && (
          <View style={styles.connectCard}>
            <Text style={styles.sectionTitle}>अर्को बालबालिका जोड्नुहोस्</Text>
            <Text style={styles.sectionSub}>Connect another child with their parent's code</Text>
            <View style={styles.connectRow}>
              <TextInput
                style={styles.connectInput}
                value={newConnectCode}
                onChangeText={(t) => {
                  setNewConnectCode(t.toUpperCase());
                  setConnectError('');
                }}
                placeholder="Connect code"
                placeholderTextColor="#9A8B7D"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Connect child"
                disabled={connecting || !newConnectCode.trim()}
                style={({ pressed }) => [
                  styles.connectButton,
                  (connecting || !newConnectCode.trim()) && styles.contactButtonDisabled,
                  pressed && styles.pressedState,
                ]}
                onPress={handleConnectAnotherChild}
              >
                <Text style={styles.connectButtonText}>{connecting ? '...' : 'जोड्नुहोस् · Connect'}</Text>
              </Pressable>
            </View>
            {connectError ? <Text style={styles.connectError}>{connectError}</Text> : null}
          </View>
        )}
      </ScrollView>

      {/* Universal Action / Dialog Modal */}
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
              <Text style={{ fontSize: 24 }}>💚</Text>
            </View>

            <Text style={styles.dialogTitleNe}>{dialogInfo.titleNe}</Text>
            <Text style={styles.dialogTitleEn}>{dialogInfo.titleEn}</Text>

            <Text style={styles.dialogMessage}>{dialogInfo.message}</Text>

            <View style={styles.dialogBtnGroup}>
              {dialogInfo.phone ? (
                <Pressable
                  style={styles.dialogActionBtn}
                  onPress={() => dialPhoneNumber(dialogInfo.phone)}
                >
                  <Text style={styles.dialogActionBtnText}>
                    📞 {dialogInfo.actionText || 'सम्पर्क गर्नुहोस्'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={styles.dialogCloseBtn}
                onPress={() => setDialogInfo((prev) => ({ ...prev, visible: false }))}
              >
                <Text style={styles.dialogCloseBtnText}>बन्द गर्नुहोस् (Close)</Text>
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
    backgroundColor: '#F4EFE6',
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
  childSwitcher: {
    marginBottom: 12,
  },
  childSwitcherLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6E5C50',
    marginBottom: 8,
  },
  childChipRow: {
    columnGap: 8,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    maxWidth: 180,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4D8C6',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  childChipActive: {
    backgroundColor: '#2E5936',
    borderColor: '#2E5936',
  },
  childChipAvatar: {
    fontSize: 16,
  },
  childChipName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#342419',
  },
  childChipNameActive: {
    color: '#FFFFFF',
  },
  connectCard: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginTop: 12,
  },
  connectInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: '#E4D8C6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#342419',
    backgroundColor: '#FBF7F1',
  },
  connectButton: {
    backgroundColor: '#2E5936',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  connectError: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#B3261E',
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
    color: '#28552F',
    marginTop: 2,
  },
  subtitleDesc: {
    fontSize: 13,
    color: '#76675B',
    marginTop: 4,
    lineHeight: 18.5,
  },
  notConnectedBanner: {
    backgroundColor: '#FDECEA',
    borderWidth: 1,
    borderColor: '#F5C2BC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  notConnectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8F2F22',
    lineHeight: 18,
  },
  notConnectedSubText: {
    fontSize: 11.5,
    color: '#8F2F22',
    marginTop: 3,
  },
  childStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E8DED2',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  childHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  childAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5ECE0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#E0C8B3',
  },
  avatarEmoji: {
    fontSize: 26,
  },
  childInfoText: {
    flex: 1,
  },
  childName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#342419',
  },
  childMeta: {
    fontSize: 12.5,
    color: '#76675B',
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E5',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    columnGap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2E5936',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2E5936',
  },
  liveBadgeOffline: {
    backgroundColor: '#F1ECE5',
  },
  liveDotOffline: {
    backgroundColor: '#B0A99C',
  },
  liveTextOffline: {
    color: '#76675B',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 10,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#F4ECE2',
  },
  statusLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6E5C50',
  },
  statusValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '700',
    color: '#342419',
  },
  reassuranceButton: {
    marginTop: 12,
    backgroundColor: '#2E5936',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reassuranceText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  caregiverBadgeRow: {
    backgroundColor: '#E4F2E1',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#C8E2C2',
  },
  caregiverBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#27522B',
  },
  bellAlertCard: {
    backgroundColor: '#FAF5EE',
    borderRadius: 20,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E8DED2',
  },
  bellAlertCardActive: {
    backgroundColor: '#FFF0ED',
    borderColor: '#F2A188',
  },
  bellCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bellIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDECE0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bellIconCircleActive: {
    backgroundColor: '#FCD8CC',
  },
  bellEmoji: {
    fontSize: 22,
  },
  bellTextContainer: {
    flex: 1,
  },
  bellAlertTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#342419',
  },
  bellAlertTitleActive: {
    color: '#B83811',
  },
  bellAlertStatus: {
    fontSize: 12,
    color: '#76675B',
    marginTop: 2,
  },
  bellActionBtnRow: {
    marginVertical: 8,
  },
  bellAckButton: {
    backgroundColor: '#B83811',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  bellAckButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bellRingButton: {
    backgroundColor: '#EBE0D0',
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D7C7B2',
  },
  bellRingButtonText: {
    color: '#4A2A1A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  bellToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EBE0D3',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#342419',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionHeader: {
    marginTop: 14,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#342419',
  },
  sectionSub: {
    fontSize: 12,
    color: '#76675B',
    marginTop: 2,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#E5DBD0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2E5936',
    borderRadius: 3,
  },
  lockedNotice: {
    backgroundColor: '#F8F1E5',
    padding: 8,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8DBC9',
  },
  lockedNoticeText: {
    fontSize: 11.5,
    color: '#7A5B3E',
    textAlign: 'center',
    fontWeight: '600',
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8DED2',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  taskItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F4EFE6',
  },
  taskCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#B0A294',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  taskCheckboxDone: {
    backgroundColor: '#2E5936',
    borderColor: '#2E5936',
  },
  taskEmojiCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F6EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#342419',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#8A7B70',
  },
  taskTime: {
    fontSize: 11.5,
    color: '#8A7B70',
    marginTop: 2,
  },
  statusTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A8572A',
    backgroundColor: '#FDEAE0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusTagDone: {
    color: '#2E5936',
    backgroundColor: '#E6F4E4',
  },
  contactRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  contactButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DED2',
  },
  contactButtonDisabled: {
    opacity: 0.55,
  },
  contactIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#342419',
    textAlign: 'center',
  },
  contactSubtitle: {
    fontSize: 11,
    color: '#76675B',
    marginTop: 2,
    textAlign: 'center',
  },
  pressedState: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFDF9',
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8DED2',
    elevation: 8,
  },
  dialogBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF7EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dialogTitleNe: {
    fontSize: 20,
    fontWeight: '900',
    color: '#342419',
    textAlign: 'center',
  },
  dialogTitleEn: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#28552F',
    marginTop: 2,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 13.5,
    color: '#5E4E42',
    textAlign: 'center',
    marginVertical: 14,
    lineHeight: 20,
  },
  dialogBtnGroup: {
    width: '100%',
    rowGap: 10,
  },
  dialogActionBtn: {
    backgroundColor: '#28552F',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dialogActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  dialogCloseBtn: {
    backgroundColor: '#EFE6D8',
    borderRadius: 16,
    paddingVertical: 11,
    alignItems: 'center',
  },
  dialogCloseBtnText: {
    color: '#4B2419',
    fontSize: 13,
    fontWeight: '700',
  },
});
