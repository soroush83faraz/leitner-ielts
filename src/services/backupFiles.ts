import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackup } from '@/database/repositories/backupRepo';
import type { SqlDb } from '@/database/types';
import { MAX_BACKUP_BYTES, parseBackupText, type BackupParseResult } from '@/features/backup/schema';

export type ExportResult = { ok: true; counts: { vocabulary: number; reviews: number; practice: number } } | { ok: false; message: string };

/** Writes a JSON backup to the cache folder and opens the system share sheet. */
export async function exportBackupFile(db: SqlDb, nowIso: string): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, message: 'اشتراک‌گذاری فایل روی این دستگاه ممکن نیست.' };
    const backup = await exportBackup(db, nowIso);
    const file = new File(Paths.cache, `leitner-backup-${nowIso.slice(0, 10)}.json`);
    file.create({ overwrite: true });
    await file.write(JSON.stringify(backup));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'ذخیره‌ی پشتیبان' });
    return { ok: true, counts: { vocabulary: backup.data.vocabulary.length, reviews: backup.data.reviewLogs.length, practice: backup.data.practiceSessions.length } };
  } catch {
    return { ok: false, message: 'ساخت فایل پشتیبان انجام نشد. داده‌های شما تغییری نکرد.' };
  }
}

export type PickResult = { kind: 'cancelled' } | { kind: 'error'; message: string } | { kind: 'ok'; parsed: Extract<BackupParseResult, { ok: true }>; name: string };

/** Lets the user choose a backup file and validates it. Never writes to the database. */
export async function pickBackupFile(): Promise<PickResult> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return { kind: 'cancelled' };
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_BACKUP_BYTES) return { kind: 'error', message: 'فایل بیش از حد بزرگ است.' };
    const text = await new File(asset.uri).text();
    const parsed = parseBackupText(text);
    if (!parsed.ok) return { kind: 'error', message: parsed.reason };
    return { kind: 'ok', parsed, name: asset.name };
  } catch {
    return { kind: 'error', message: 'خواندن فایل ممکن نشد.' };
  }
}
