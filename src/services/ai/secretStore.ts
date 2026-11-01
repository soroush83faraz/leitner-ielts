import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where a user's own API key lives. Never the app database (so it can never end up in a backup
 * file) and never sent anywhere except the provider the user chose.
 * Native: the OS keychain/keystore via SecureStore. Web (preview only): browser storage.
 */
const KEY = 'byok_config_v1';

export async function readSecret(): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? await Storage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeSecret(value: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') await Storage.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
    return true;
  } catch {
    return false;
  }
}

export async function deleteSecret(): Promise<void> {
  try {
    if (Platform.OS === 'web') await Storage.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to do
  }
}
