import { useCallback, useEffect, useState } from 'react';

// Seconds left before an action (e.g. resending a verification code) is
// allowed again. start(n) begins counting down from n to 0, once per second.
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => setSecondsLeft(Math.max(0, Math.ceil(seconds))), []);
  const reset = useCallback(() => setSecondsLeft(0), []);

  return { secondsLeft, start, reset };
}
