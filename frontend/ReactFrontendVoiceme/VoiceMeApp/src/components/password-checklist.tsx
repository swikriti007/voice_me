import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getPasswordChecks } from '@/constants/password';

// Live list of the password rules under a new-password field: each rule turns
// green with a tick as soon as the typed password satisfies it.
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.list}>
      {getPasswordChecks(password).map((check) => (
        <Text key={check.key} style={[styles.item, check.met ? styles.met : styles.unmet]}>
          {check.met ? '✓' : '○'} {check.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 6,
    marginLeft: 18,
  },
  item: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  met: {
    color: '#26533A',
  },
  unmet: {
    color: '#7C5044',
  },
});
