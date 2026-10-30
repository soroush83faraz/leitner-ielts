import { Alert, Platform } from 'react-native';

/** Native confirmation dialog (window.confirm on web). Resolves true only on explicit confirmation. */
export function confirmAsync(opts: { title: string; message?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    const g = globalThis as { confirm?: (m: string) => boolean };
    return Promise.resolve(g.confirm ? g.confirm(`${opts.title}\n${opts.message ?? ''}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'انصراف', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    (globalThis as { alert?: (m: string) => void }).alert?.(`${title}\n${message ?? ''}`);
    return;
  }
  Alert.alert(title, message);
}
