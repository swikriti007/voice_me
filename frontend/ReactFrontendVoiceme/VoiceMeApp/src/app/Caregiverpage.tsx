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
  Switch,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle, Rect, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';
import { dialPhone } from '@/constants/phone';
import { SosAlertBanner } from '@/components/sos-alert-banner';

// Shape returned by /api/caregiver/routines/ — the connected child's own
// routine, which the caregiver can only watch, never set or edit.
interface RoutineItem {
  id: string;
  time: string;
  title: string;
  icon: string;
  completed: boolean;
}

const AUTH_TOKEN_KEY = 'voiceme.authToken';

const SELECTED_ROLE_KEY = 'voiceme.selectedRole';

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
  const [caregiverName, setCaregiverName] = useState('माया घिमिरे (Maya Ghimire)');

  const [isBellActive, setIsBellActive] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);

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

    // The backend is the real link between this caregiver's account and the
    // child they connected to via CaregiverRegistrationPage's code; the
    // AsyncStorage values above are just same-device fallbacks/cache.
    (async () => {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const child = await res.json();
        setIsConnected(true);
        if (child.name?.trim()) setChildName(child.name.trim());
        if (child.age?.trim()) setChildAge(child.age.trim());
        if (child.avatar?.trim()) setChildAvatar(child.avatar.trim());
        if (child.parent?.name) setParentName(child.parent.name);
        if (child.parent?.phone) setEmergencyPhone(child.parent.phone);
        if (child.doctor?.name) setDoctorName(child.doctor.name);
        if (child.doctor?.phone) setDoctorPhone(child.doctor.phone);
        if (child.caregiver?.name) setCaregiverName(child.caregiver.name);
      } catch {
        // Offline or backend unreachable: keep whatever is currently shown.
      }

      // The routine belongs to the child and is set from the child's own
      // account; the caregiver only gets a read-only view of it.
      try {
        const res = await fetch(`${API_BASE_URL}/api/caregiver/routines/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.items)) setRoutines(data.items);
      } catch {}
    })();

    // Only periodically poll the real-time Attention Bell alert status
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SosAlertBanner />

        {/* Title Block */}
        <View style={styles.titleSection}>
          <View style={styles.caregiverBadgeRow}>
            <Text style={styles.caregiverBadgeText}>💚 हेरचाहकर्ता: {caregiverName}</Text>
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

            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>लाइभ (Live)</Text>
            </View>
          </View>

          {/* Location & GPS line */}
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>📍 स्थान (Location):</Text>
            <Text style={styles.statusValue}>घर · बैठक कोठा (Living Room)</Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>⌚ जीपीएस ब्याण्ड:</Text>
            <Text style={styles.statusValue}>सक्रिय · सुरक्षित क्षेत्र भित्र (Active)</Text>
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
