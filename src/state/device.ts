import NetInfo from '@react-native-community/netinfo';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

/** true / false once known; null while unknown. */
export function useOnline(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(s.isConnected === false || s.isInternetReachable === false ? false : true));
    return unsub;
  }, []);
  return online;
}

/**
 * English text-to-speech through the platform engine. `available` is only true
 * when an English voice is actually installed, so the UI never shows a dead
 * play button.
 */
export function useEnglishSpeech() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let alive = true;
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (alive) setAvailable(voices.some((v) => v.language?.toLowerCase().startsWith('en')));
      })
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
      Speech.stop();
    };
  }, []);

  const speak = useCallback((text: string, slow = false) => {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      rate: slow ? 0.7 : 0.95,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, []);

  return { available, speaking, speak, stop: () => Speech.stop() };
}
