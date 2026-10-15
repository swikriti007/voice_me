import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/constants/api';

const AUTH_TOKEN_KEY = 'voiceme.authToken';
const POLL_MS = 5000;

// Shape returned by /api/sos/latest/ — the child's newest unresolved SOS,
// raised either from the app's SOS button or the GPS SOS hardware.
interface SosAlert {
  id: string;
  source: 'app' | 'device';
  location_label: string | null;
  gps_fix: boolean;
  maps_link: string | null;
  created_at: string;
  // Which child raised it; a caregiver may look after several.
  child_id?: string;
  child_name?: string;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Red banner shown to the parent and the caregiver while the child has an
 * open SOS. Polls the backend, so an alert from the hardware button shows up
 * within a few seconds; "Mark safe" resolves it for everyone.
 */
export function SosAlertBanner({ refreshKey = 0 }: { refreshKey?: number }) {
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [resolving, setResolving] = useState(false);
  const lastAlertId = useRef<string | null>(null);

  const load = async () => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sos/latest/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const next: SosAlert | null = data.alert ?? null;
      if (next && next.id !== lastAlertId.current) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {}
      }
      lastAlertId.current = next?.id ?? null;
      setAlert(next);
    } catch {
      // Offline or backend unreachable: keep showing the last known state.
    }
  };

  // refreshKey changes on the parent's pull-to-refresh: re-check right away.
  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const handleResolve = async () => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sos/resolve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ child_id: alert?.child_id }),
      });
      if (res.ok) setAlert(null);
    } catch {}
    setResolving(false);
  };

  if (!alert) return null;

  const place = alert.location_label || 'स्थान थाहा छैन (Location unknown)';

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>
        🚨 आपतकालीन SOS!{alert.child_name ? ` · ${alert.child_name}` : ''}
      </Text>
      <Text style={styles.subtitle}>
        {alert.source === 'device' ? 'SOS उपकरणबाट (From SOS device)' : 'एपबाट (From the app)'}
        {' · '}
        {formatTime(alert.created_at)}
      </Text>
      <Text style={styles.place}>📍 {place}</Text>
      {!alert.gps_fix && (
        <Text style={styles.warning}>
          GPS संकेत छैन — अन्तिम ज्ञात स्थान (No GPS fix — last known location)
        </Text>
      )}
      <View style={styles.actions}>
        {alert.maps_link && (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
            onPress={() => Linking.openURL(alert.maps_link!).catch(() => {})}
          >
            <Text style={styles.mapButtonText}>नक्सा हेर्नुहोस् · Map</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={resolving}
          style={({ pressed }) => [styles.safeButton, (pressed || resolving) && styles.pressed]}
          onPress={handleResolve}
        >
          <Text style={styles.safeButtonText}>
            {resolving ? '...' : 'सुरक्षित छ · Mark safe'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#B3261E',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#FDE7E4',
    fontSize: 13,
    marginTop: 2,
  },
  place: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  warning: {
    color: '#FFD8A8',
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  mapButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  mapButtonText: {
    color: '#B3261E',
    fontWeight: '700',
  },
  safeButton: {
    backgroundColor: '#28552F',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  safeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
