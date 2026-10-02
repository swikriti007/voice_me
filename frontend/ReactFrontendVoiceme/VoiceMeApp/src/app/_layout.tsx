import { useEffect } from "react";
import { Stack } from "expo-router";
import { setAudioModeAsync } from "expo-audio";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import "@/global.css";

export default function Layout() {
  // Protected screens bounce to Login when no one is signed in (e.g. Back
  // after logging out).
  useAuthGuard();

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
