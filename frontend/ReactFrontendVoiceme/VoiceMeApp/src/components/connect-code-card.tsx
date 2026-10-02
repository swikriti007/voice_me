import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

const MONOSPACE = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// The code a parent shares so a caregiver can link their account to this
// child. Renders nothing when there is no code (e.g. a caregiver viewing).
export function ConnectCodeCard({ code }: { code?: string | null }) {
  if (!code?.trim()) return null;

  return (
    <View style={styles.card} accessibilityLabel={`Caregiver connect code ${code}`}>
      <Text style={styles.title}>🔗 स्याहारकर्ता जोड्ने कोड (Caregiver connect code)</Text>
      <Text style={styles.code} selectable>
        {code.trim()}
      </Text>
      <Text style={styles.hint}>
        यो कोड स्याहारकर्ताको खातामा राख्नुहोस् (Enter this code in the caregiver&apos;s account to link it)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFDF9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8DED2',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4B1C19',
    textAlign: 'center',
  },
  code: {
    fontFamily: MONOSPACE,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    color: '#235237',
    marginVertical: 8,
  },
  hint: {
    fontSize: 12,
    color: '#7C6E61',
    textAlign: 'center',
    lineHeight: 17,
  },
});
