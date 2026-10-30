---
name: persian-rtl-leitner
description: Rules for editing this Persian-first, RTL React Native (Expo) IELTS Leitner app. Use when changing UI text, layout, fonts, review/scheduling logic, the SQLite layer, or AI features in this repo.
---

# Persian RTL + Leitner invariants

## UI / RTL
- The UI is Persian and RTL (`I18nManager.forceRTL` + root `direction: 'rtl'`). Never use `left`/`right`; use `start`/`end`, `row` order, `gap`.
- English (terms, IPA, examples, inputs) must use `<EnText>` or `Field ltr`: forces LTR + left alignment so bidi never reorders it. Persian uses `<Text>`.
- Persian digits for display: `toPersianDigits()`. Dates: `utils/format.ts` (Jalali via `fa-IR`). Store Persian with `ی`/`ک` (`normalizePersian`).
- Back arrow is `arrow-right`, "enter" chevron is `chevron-left` (`ICON_BACK`, `ICON_ENTER`). One icon family (Feather). No emoji or unicode glyphs as icons.
- Colours only from `theme/tokens.ts`; box state is always colour **plus number**; `tests/theme.test.ts` guards contrast (4.5:1 text) in both themes.
- Every icon-only control needs an accessible label (`IconButton` requires one). Touch target >= 48. Respect reduced motion (`Reveal`).
- No eyebrow labels, gradient text, nested cards, or hero-metric blocks. Copy is calm and non-punitive (no guilt about missed days).

## Leitner / data
- Algorithm lives only in `features/leitner/algorithm.ts` (pure, tz passed in). Intervals only in `constants/leitner.ts`. Due = local midnight N days after the **review time**, never the old due date.
- A result is recorded **only** after reveal + explicit "knew / did not know". `recordReview` is one transaction, idempotent by `submissionId`, and guarded by `expectedReviewCount`.
- UI never touches SQL; use `database/repositories/*`. Schema changes = new migration appended to `database/migrations.ts` (never edit shipped ones).
- Keep `now()` identity stable (module-level): effects depending on it must not re-run on every `bump()`.
- Deleting a card detaches (does not delete) its review log. Editing never touches `review_state`/`review_log`.

## AI
- Contracts are single-sourced in `supabase/functions/_shared/contracts.ts` (client + server). Treat AI output as untrusted: validate with Zod, never store an unverified `sourceSentence`, never fake results when unconfigured (`createUnconfiguredAiService`).
- No provider keys in the client. The only public env vars are `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a test enforces this).

## Before finishing
`npm run check` (typecheck + lint + jest). Web preview: `npx expo start --web` (SQLite runs via wasm; for visual/flow checks only).
