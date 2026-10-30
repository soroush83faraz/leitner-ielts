# لایتنر آیلتس — Persian IELTS vocabulary app (Leitner)

React Native + Expo (SDK 58) + TypeScript, Expo Router, local-first `expo-sqlite`. Persian RTL UI; English text stays LTR.
AI (card suggestions, text extraction, practice, writing feedback) runs behind Supabase Edge Functions and is **optional**: review, library, bulk import, reading/listening practice, progress and backup all work offline with no AI configured.

## Run

```bash
npm install                 # .npmrc sets legacy-peer-deps (react-dom peer mismatch in SDK 58)
npx expo start              # then press a (Android) / i (iOS) or scan with a dev build
npx expo start --web        # browser preview (SQLite via wasm) — for development only
```
Native modules used (SQLite, notifications, secure-store…) may require a development build instead of Expo Go: `npx expo run:android` / `npx expo run:ios`.
First launch on a device not already RTL reloads the app once to apply RTL.

## Checks

```bash
npm test            # Jest: 160+ tests (Leitner, DB, parsers, AI client/server logic, UI flows, contrast)
npm run typecheck
npm run lint
npm run check       # all three
```
Tests use Node's built-in `node:sqlite` (Node >= 22.5) for real-SQL repository tests.

## Architecture

| Path | Role |
|---|---|
| `src/features/leitner/algorithm.ts` | **Pure** scheduling (no React/SQL/clock). Intervals in `src/constants/leitner.ts`. |
| `src/utils/dates.ts` | Time-zone-aware local-day math (DST-safe, no date lib). |
| `src/database/` | `SqlDb` interface, migrations (`PRAGMA user_version`), repositories. UI never contains SQL. |
| `src/features/*` | vocabulary model/forms/bulk parser, practice, progress, backup, settings. |
| `src/services/ai/` | Provider-agnostic client, anonymous auth, typed errors. |
| `supabase/functions/` | Edge Functions + shared Zod contracts (also imported by the app). |
| `src/app/` | Expo Router screens (Today, Vocabulary, Practice, Progress tabs; review; add; word; settings). |

### Leitner policy (and nuances)
- Boxes 1-5; intervals on entering a box: 1, 2, 4, 8, 16 days. Correct: +1 box (max 5). Incorrect: box 1.
- "N days" = local calendar days: due at **local midnight** N days after the local date of the **review time** (never from the old due date; DST-safe).
- **Nuance:** a never-reviewed card moves 1→2 on its first success but is scheduled **1 day** out (spec's new-card rule); change `FIRST_SUCCESS_INTERVAL_DAYS` to use the box-2 interval instead.
- New cards are due immediately. Reviews come before new cards; most overdue first. Overdue cards are never dropped.
- A result is stored only after the learner reveals the answer and explicitly picks "knew / did not know". `recordReview` writes state + log in one transaction, is idempotent by a per-presentation `submissionId`, and refuses stale views.
- The daily new-word target (default 10) is a **soft goal** counting entries created today; it never blocks adding or reviewing.
- Reviewing a not-yet-due card from the library is allowed with a visible notice; the explicit result does reschedule it.
- Deleting a card detaches (keeps) its review log so global accuracy stays truthful; editing never touches Leitner state.

### Data
`vocabulary` (+ examples/collocations/word_family tables), `review_state` (source of truth for box/due/counters), `review_log`, `practice_session`, `user_preference`. Timestamps are ISO-8601 UTC strings. Migrations are append-only in `src/database/migrations.ts`; each runs in a transaction so a failure leaves data intact.

### Backup
Settings → export JSON (share sheet) / import. Import is validated by Zod first, then merged in one transaction: existing cards are never overwritten or merged; duplicates (same id or normalised term) are skipped and reported. Preferences are not overwritten on import.

## AI setup (optional)

1. Create a Supabase project; enable **Anonymous sign-ins** (Auth settings).
2. `supabase db push` (applies `supabase/migrations/*_ai_quota.sql`: atomic per-user/day/global quota).
3. Set secrets (never in the app): `supabase secrets set ANTHROPIC_API_KEY=... AI_MODEL=claude-sonnet-5-5` (see `.env.example` for limits).
4. `supabase functions deploy generate-card extract-vocabulary generate-practice evaluate-writing`
5. App env (`.env.local`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only these two are read by the client; a test fails if any provider key appears in client code.

Without these, the app shows "AI not configured" and returns **no** fake content.

**Abuse protection:** each install gets an anonymous Supabase JWT; functions verify it server-side (the publishable key alone is rejected), enforce body/field limits, a per-minute and per-day quota and a global daily ceiling in Postgres, and fail closed if the limiter is down. Anonymous accounts are a *throttle*, not strong identity — for public launch add device attestation (Play Integrity / App Attest) or real accounts, and Supabase's anonymous sign-in rate limits/CAPTCHA.

**Privacy:** the app asks once before sending text to the AI path and sends only what a feature needs (term/context, pasted text ≤ 10,000 chars, your typed answer when you press "get feedback"). Server logs contain function name, status and timing only.

## Verified vs. not verified

Verified here: Jest suite (Leitner logic incl. DST, real-SQL repositories, parsers, backup, AI client + server operations with a fake provider, UI review flow, palette contrast), TypeScript, ESLint, and a manual browser run (web build) of add → reload persistence → review → progress with real SQLite.

**Not verified:** running on a physical/emulated Android or iOS device (native RTL reload, TTS voices, notifications, file share/picker); the Deno Edge Functions were not run or deployed (their pure logic is unit-tested; `auth.ts`, `quota.ts`, `provider.ts`, `handler.ts` and the SQL migration need a real deploy to verify); no live LLM call has been made.

## Known limitations / out of scope
No cloud sync, accounts, audio recording or pronunciation scoring, mock exams, band-score prediction. Listening uses the platform TTS voice if an English voice is installed; otherwise it falls back to spelling-from-meaning. Reminders are local notifications (not on web). Persian is the only UI language. Web preview is not a supported target.
