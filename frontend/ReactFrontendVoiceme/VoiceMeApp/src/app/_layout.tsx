import { useEffect } from "react";
import { Stack } from "expo-router";
import { setAudioModeAsync } from "expo-audio";

export default function Layout() {
  // iOS mutes app audio (bell, SOS speech, flashcards) when the ring/silent
  // switch is on unless we opt in. Android ignores this.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  return (
    <Stack
      initialRouteName="Splashpage"
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
