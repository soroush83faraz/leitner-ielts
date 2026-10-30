import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createVocabulary, getVocabulary } from '@/database/repositories/vocabularyRepo';

import { makeHarness, renderWithApp } from './helpers/renderApp';

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    usePreventRemove: () => () => undefined,
  };
});
jest.mock('expo-sqlite', () => ({}));
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(async () => []),
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => undefined }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const NOW = '2026-03-10T09:00:00.000Z';

// State updates that follow our async DB writes land outside RNTL's act scope; that is expected noise.
const realError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && /not wrapped in act|overlapping act/.test(args[0])) return;
    realError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

// eslint-disable-next-line import/first
import ReviewScreen from '@/app/review';
// eslint-disable-next-line import/first
import TodayScreen from '@/app/(tabs)/index';
// eslint-disable-next-line import/first
import VocabularyScreen from '@/app/(tabs)/vocabulary';
// eslint-disable-next-line import/first
import PracticeTab from '@/app/(tabs)/practice';
// eslint-disable-next-line import/first
import ProgressScreen from '@/app/(tabs)/progress';

describe('primary screens render', () => {
  it('Today shows the empty-library state', async () => {
    const h = await makeHarness();
    await renderWithApp(<TodayScreen />, h);
    expect(await screen.findByText('با چند واژه شروع کنیم')).toBeTruthy();
    expect(screen.getByText('امروز', { exact: true })).toBeTruthy();
  });

  it('Today shows due count and the primary action, with the default target of 10', async () => {
    const h = await makeHarness();
    await createVocabulary(h.db, { term: 'mitigate', meaningFa: 'کاهش دادن' }, NOW);
    await createVocabulary(h.db, { term: 'resilient', meaningFa: 'مقاوم' }, NOW);
    await renderWithApp(<TodayScreen />, h);
    expect(await screen.findByText('شروع مرور')).toBeTruthy();
    expect(screen.getByText(/۲ کارت منتظر مرور است/)).toBeTruthy();
    expect(screen.getByText(/۲ از ۱۰/)).toBeTruthy();
  });

  it('Vocabulary, Practice and Progress render their empty states', async () => {
    const h = await makeHarness();
    await renderWithApp(<VocabularyScreen />, h);
    expect(await screen.findByText('هنوز واژه‌ای ندارید')).toBeTruthy();
    screen.unmount();

    const h2 = await makeHarness();
    await renderWithApp(<PracticeTab />, h2);
    expect(await screen.findByText('ابتدا چند واژه اضافه کنید')).toBeTruthy();
    screen.unmount();

    const h3 = await makeHarness();
    await renderWithApp(<ProgressScreen />, h3);
    expect(await screen.findByText('هنوز آماری نیست')).toBeTruthy();
  });
});

describe('review flow', () => {
  async function seeded() {
    const h = await makeHarness();
    const id = await createVocabulary(h.db, { term: 'mitigate', meaningFa: 'کاهش دادن', examples: [{ sentence: 'Trees mitigate heat.' }] }, NOW);
    return { h, id };
  }
  const logs = (h: Awaited<ReturnType<typeof makeHarness>>) => h.db.all<{ result: string }>('SELECT result FROM review_log');

  it('shows only the prompt side first; the answer appears only after an explicit reveal', async () => {
    const { h } = await seeded();
    await renderWithApp(<ReviewScreen />, h);
    expect(await screen.findByText('mitigate')).toBeTruthy();
    expect(screen.queryByText('کاهش دادن')).toBeNull();
    expect(screen.queryByText('می‌دانستم')).toBeNull();
    expect(screen.queryByText('نمی‌دانستم')).toBeNull();

    await fireEvent.press(screen.getByText('نمایش پاسخ'));
    expect(await screen.findByText('کاهش دادن')).toBeTruthy();
    expect(screen.getByText('می‌دانستم')).toBeTruthy();
    expect(screen.getByText('نمی‌دانستم')).toBeTruthy();
  });

  it('records nothing on reveal; records exactly one review after the explicit choice', async () => {
    const { h, id } = await seeded();
    await renderWithApp(<ReviewScreen />, h);
    await fireEvent.press(await screen.findByText('نمایش پاسخ'));
    await screen.findByText('کاهش دادن');
    expect(await logs(h)).toHaveLength(0);
    expect((await getVocabulary(h.db, id))?.state.reviewCount).toBe(0);

    await fireEvent.press(screen.getByText('می‌دانستم'));
    await waitFor(async () => expect(await logs(h)).toHaveLength(1));
    const after = await getVocabulary(h.db, id);
    expect(after?.state).toMatchObject({ boxNumber: 2, reviewCount: 1, correctCount: 1 });
    expect(await screen.findByText('پایان مرور')).toBeTruthy();
    expect(h.bumps.count).toBeGreaterThan(0);
  });

  it('ignores repeated taps on the answer button while the first is still saving (no double review)', async () => {
    const { h, id } = await seeded();
    // Make the write slow so the 2nd and 3rd taps arrive while the 1st is in flight.
    const realTx = h.db.transaction.bind(h.db);
    h.db.transaction = async (fn) => {
      await new Promise((r) => setTimeout(r, 40));
      return realTx(fn);
    };
    await renderWithApp(<ReviewScreen />, h);
    await fireEvent.press(await screen.findByText('نمایش پاسخ'));
    const btn = await screen.findByText('نمی‌دانستم');
    await fireEvent.press(btn);
    await fireEvent.press(btn);
    await fireEvent.press(btn);
    await screen.findByText('پایان مرور');
    expect(await logs(h)).toHaveLength(1);
    expect((await getVocabulary(h.db, id))?.state).toMatchObject({ boxNumber: 1, reviewCount: 1, incorrectCount: 1 });
  });

  it('shows a helpful empty state when nothing is due', async () => {
    const h = await makeHarness();
    await renderWithApp(<ReviewScreen />, h);
    expect(await screen.findByText('کارتی برای مرور نیست')).toBeTruthy();
    expect(screen.getByText('افزودن واژه')).toBeTruthy();
    expect(screen.getByText('رفتن به تمرین')).toBeTruthy();
  });
});

void React;
