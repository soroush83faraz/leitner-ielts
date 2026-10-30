import { z } from 'zod';

import { DEFAULT_DAILY_NEW_TARGET, MAX_DAILY_NEW_TARGET, MIN_DAILY_NEW_TARGET } from '@/constants/leitner';

export const preferencesSchema = z.object({
  dailyNewTarget: z.number().int().min(MIN_DAILY_NEW_TARGET).max(MAX_DAILY_NEW_TARGET).default(DEFAULT_DAILY_NEW_TARGET),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  reminderEnabled: z.boolean().default(false),
  reminderHour: z.number().int().min(0).max(23).default(20),
  reminderMinute: z.number().int().min(0).max(59).default(0),
  /** The user has acknowledged that pasted text / words are sent to an AI provider. */
  aiDisclosureAccepted: z.boolean().default(false),
  /** Only Persian is supported in this MVP; kept so a second language can be added later. */
  uiLanguage: z.enum(['fa']).default('fa'),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});
