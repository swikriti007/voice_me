import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Modal,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';
import { API_BASE_URL } from '@/constants/api';
import { dialPhone } from '@/constants/phone';
import { ConnectCodeCard } from '@/components/connect-code-card';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

const AUTH_TOKEN_KEY = 'voiceme.authToken';
const REGISTERED_NAME_KEY = 'voiceme.registeredName';
const REGISTERED_AGE_KEY = 'voiceme.registeredAge';
const REGISTERED_AVATAR_KEY = 'voiceme.registeredAvatar';

interface Contact {
  name?: string;
  phone?: string;
  id?: string;
}

interface ChildProfileProps {
  onBackPress?: () => void;
  onViewLocationHistory?: () => void;
  onEditProfile?: () => void;
}

export const ChildProfileScreen: React.FC<ChildProfileProps> = ({
  onBackPress,
  onViewLocationHistory,
  onEditProfile,
}) => {
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [avatar, setAvatar] = useState('👦');
  const [caregiver, setCaregiver] = useState<Contact | null>(null);
  const [locationLabel, setLocationLabel] = useState('At home');
  const [updatedLabel, setUpdatedLabel] = useState('GPS band not connected');
  const [caregiverModalVisible, setCaregiverModalVisible] = useState(false);
  const [isCaregiverView, setIsCaregiverView] = useState(false);
  const [connectCode, setConnectCode] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    // Same fallback as Homepage: show the details saved on this device first,
    // so the page never shows placeholder data when no backend profile exists.
    try {
      const [[, name], [, age], [, savedAvatar]] = await AsyncStorage.multiGet([
        REGISTERED_NAME_KEY,
        REGISTERED_AGE_KEY,
        REGISTERED_AVATAR_KEY,
      ]);
      if (name?.trim()) setChildName(name.trim());
      if (age?.trim()) setChildAge(age.trim());
      if (savedAvatar?.trim()) setAvatar(savedAvatar.trim());
    } catch {}

    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };
      let res = await fetch(`${API_BASE_URL}/api/child/profile/`, { headers });
      if (!res.ok) {
        // A caregiver account owns no child profile; show the child it is
        // linked to by connect code instead.
        res = await fetch(`${API_BASE_URL}/api/caregiver/dashboard/`, { headers });
        if (!res.ok) return;
        setIsCaregiverView(true);
      }

      const profile = await res.json();
      // Only the parent's own /api/child/profile/ carries the connect code;
      // a caregiver viewing via the dashboard doesn't see it.
      setConnectCode(typeof profile.connect_code === 'string' ? profile.connect_code : null);
      if (profile.name?.trim()) setChildName(profile.name.trim());
      if (profile.age?.trim()) setChildAge(profile.age.trim());
      if (profile.avatar?.trim()) setAvatar(profile.avatar.trim());
      if (profile.caregiver) setCaregiver(profile.caregiver);
      if (profile.gps?.location_label) setLocationLabel(profile.gps.location_label);
      if (profile.gps?.updated_at) {
        // Backend timestamps are UTC without a "Z"; add it so this shows local time.
        const updatedAt = new Date(profile.gps.updated_at + (profile.gps.updated_at.endsWith('Z') ? '' : 'Z'));
        setUpdatedLabel(profile.gps.connected
          ? 'Live · updated now'
          : `GPS band offline · last seen ${updatedAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
      }
    } catch {
      // Offline or backend unreachable: keep whatever is currently shown.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadProfile);

  const handleOpenCaregiver = () => {
    // The parent should see the caregiver's own contact details here (name,
    // phone, id) — not push them into /Caregiverpage, which is the
    // caregiver's own operational dashboard (routines, bell controls, etc.)
    // meant for the caregiver's account, not for the parent to browse.
    setCaregiverModalVisible(true);
  };

  const handleCallCaregiver = () => {
    dialPhone(caregiver?.phone);
  };

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/Homepage');
    }
  };

  const handleViewLocationHistory = () => {
    if (onViewLocationHistory) {
      onViewLocationHistory();
    } else {
      router.push('/Homepage');
    }
  };

  const handleEditProfile = () => {
    if (onEditProfile) {
      onEditProfile();
    } else {
      router.push('/ChildRegistrationPage');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4EFE6" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9C532B" colors={['#9C532B']} />}
      >
        {/* Navigation Top Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Return to Homepage"
            accessibilityRole="button"
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Child Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarEmoji}>{avatar}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.nameHindi}>{childName || 'No profile yet'}</Text>
            {!!childAge && <Text style={styles.nameSub}>{childAge}</Text>}
            <Text style={styles.managedBy}>Profile managed by parent</Text>
          </View>
        </View>

        {/* Caregiver connect code (parent/child account only) */}
        {!isCaregiverView && <ConnectCodeCard code={connectCode} />}

        {/* Current Location Card */}
        <View style={styles.locationCard}>
          <Text style={styles.sectionTitle}>Current location</Text>

          {/* Map Graphic with Curved Road Path */}
          <View style={styles.mapContainer}>
            <Svg height="100%" width="100%" viewBox="0 0 320 120" style={StyleSheet.absoluteFill}>
              {/* Smooth S-curve route */}
              <Path
                d="M 0 75 Q 80 85 130 65 T 220 40 T 320 70"
                fill="none"
                stroke="#B8BEB2"
                strokeWidth="8"
                strokeLinecap="round"
              />
              {/* Location marker halo & active pin dot */}
              <Circle cx="150" cy="55" r="14" fill="rgba(189, 94, 46, 0.22)" />
              <Circle cx="150" cy="55" r="10" fill="#BD5E2E" />
            </Svg>

            {/* Location Badge */}
            <View style={styles.mapLabelRow}>
              <Text style={styles.pinIcon}>📍</Text>
              <Text style={styles.mapLabelText} numberOfLines={2}>{locationLabel}</Text>
            </View>
          </View>

          <Text style={styles.updatedText}>{updatedLabel}</Text>
        </View>

        {/* Caregiver Information Row */}
        <TouchableOpacity
          style={styles.caregiverRow}
          onPress={handleOpenCaregiver}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open caregiver details"
        >
          {/* Caregiver Name Card */}
          <View style={[styles.caregiverCard, styles.caregiverPeachCard]}>
            <Text style={styles.caregiverLabel}>Caregiver</Text>
            <Text style={styles.caregiverValue} numberOfLines={1}>
              {caregiver?.name || 'Not assigned yet'}
            </Text>
          </View>

          {/* Caregiver ID Card */}
          <View style={[styles.caregiverCard, styles.caregiverNeutralCard]}>
            <Text style={styles.caregiverLabel}>Caregiver ID</Text>
            <Text style={styles.caregiverValue} numberOfLines={1}>
              {caregiver?.id || '—'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleViewLocationHistory}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>View Location History</Text>
          </TouchableOpacity>

          {!isCaregiverView && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleEditProfile}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Edit Child Profile</Text>
            </TouchableOpacity>
          )}

          {/* Return to Homepage Button */}
          <TouchableOpacity
            style={styles.returnButton}
            onPress={handleBack}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.returnButtonText}>🏠 Return to Homepage</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Note */}
        <Text style={styles.footerNote}>Parent controls this profile.</Text>
      </ScrollView>

      {/* Caregiver Profile Modal (read-only view for the parent) */}
      <Modal
        visible={caregiverModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCaregiverModalVisible(false)}
      >
        <Pressable
          style={styles.caregiverModalOverlay}
          onPress={() => setCaregiverModalVisible(false)}
        >
          <Pressable style={styles.caregiverModalCard} onPress={() => {}}>
            <View style={styles.caregiverModalAvatar}>
              <Text style={{ fontSize: 26 }}>💚</Text>
            </View>

            <Text style={styles.caregiverModalTitle}>Caregiver Profile</Text>

            <View style={styles.caregiverModalRow}>
              <Text style={styles.caregiverModalLabel}>Name</Text>
              <Text style={styles.caregiverModalValue}>{caregiver?.name || 'Not assigned yet'}</Text>
            </View>

            <View style={styles.caregiverModalRow}>
              <Text style={styles.caregiverModalLabel}>Phone</Text>
              <Text style={styles.caregiverModalValue}>{caregiver?.phone || '—'}</Text>
            </View>

            <View style={styles.caregiverModalRow}>
              <Text style={styles.caregiverModalLabel}>Caregiver ID</Text>
              <Text style={styles.caregiverModalValue}>{caregiver?.id || '—'}</Text>
            </View>

            <View style={styles.caregiverModalBtnGroup}>
              {caregiver?.phone ? (
                <TouchableOpacity style={styles.caregiverModalCallBtn} onPress={handleCallCaregiver}>
                  <Text style={styles.caregiverModalCallBtnText}>📞 Call Caregiver</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.caregiverModalCloseBtn}
                onPress={() => setCaregiverModalVisible(false)}
              >
                <Text style={styles.caregiverModalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

export default ChildProfileScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4EFE6', // Soft warm cream canvas
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },

  /* Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 4,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backChevron: {
    fontSize: 32,
    lineHeight: 34,
    color: '#342F2A',
    fontWeight: '300',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#342F2A',
    letterSpacing: -0.3,
    marginLeft: 6,
  },

  /* Profile Card */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DDF0D5', // Pastel sage green
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  avatarContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F6F2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameHindi: {
    fontSize: 21,
    fontWeight: '700',
    color: '#243022',
    marginBottom: 2,
  },
  nameSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3C4D3A',
    marginBottom: 2,
  },
  managedBy: {
    fontSize: 12,
    color: '#5C6D5A',
  },

  /* Location Card */
  locationCard: {
    backgroundColor: '#FFFEFB',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#362E27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#342F2A',
    marginBottom: 12,
  },
  mapContainer: {
    height: 126,
    backgroundColor: '#E7E5DC',
    borderRadius: 18,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 14,
  },
  mapLabelRow: {
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  pinIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  mapLabelText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#342F2A',
  },
  updatedText: {
    fontSize: 12,
    color: '#7C7872',
    marginTop: 10,
    marginLeft: 2,
  },

  /* Caregiver Row */
  caregiverRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  caregiverCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  caregiverPeachCard: {
    backgroundColor: '#FCE1D4', // Warm pastel peach
  },
  caregiverNeutralCard: {
    backgroundColor: '#E8E7E0', // Muted warm grey
  },
  caregiverLabel: {
    fontSize: 12,
    color: '#645B53',
    fontWeight: '500',
    marginBottom: 4,
  },
  caregiverValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2F2A25',
  },

  /* Action Buttons */
  buttonGroup: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#BD5E2E', // Terracotta rust
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#BD5E2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    backgroundColor: '#F6EEE2', // Soft warm cream
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#322C27',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  returnButton: {
    backgroundColor: '#EAE1D2',
    height: 48,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8CEBE',
  },
  returnButtonText: {
    color: '#473628',
    fontSize: 14.5,
    fontWeight: '700',
  },

  /* Footer Note */
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8A847B',
    marginTop: 8,
  },

  /* Caregiver Profile Modal */
  caregiverModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  caregiverModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFDF9',
    borderRadius: 26,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7DDD0',
  },
  caregiverModalAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DDF0D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  caregiverModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#243022',
    marginBottom: 14,
  },
  caregiverModalRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EFE6D8',
  },
  caregiverModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C6E61',
  },
  caregiverModalValue: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#2F2A25',
  },
  caregiverModalBtnGroup: {
    width: '100%',
    marginTop: 18,
    gap: 10,
  },
  caregiverModalCallBtn: {
    backgroundColor: '#3F5B39',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  caregiverModalCallBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  caregiverModalCloseBtn: {
    backgroundColor: '#EFE6D8',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  caregiverModalCloseBtnText: {
    color: '#4B2419',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
