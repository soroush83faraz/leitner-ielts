import { usePreventRemove } from 'expo-router';
import { useEffect, useRef } from 'react';

import { confirmAsync } from '@/utils/confirm';

/**
 * Asks before leaving a screen with unsaved input (back button, swipe, hardware back).
 * Call `allowLeave()` right before a deliberate navigation after saving.
 */
export function useDiscardGuard(dirty: boolean) {
  const disableRef = useRef<() => void>(() => undefined);
  const disable = usePreventRemove(dirty, ({ repeat }) => {
    void confirmAsync({
      title: 'تغییرات ذخیره نشده',
      message: 'اگر خارج شوید، آنچه نوشته‌اید از بین می‌رود.',
      confirmLabel: 'خروج بدون ذخیره',
      cancelLabel: 'ماندن',
      destructive: true,
    }).then((ok) => {
      if (ok) {
        disableRef.current();
        repeat();
      }
    });
  });
  useEffect(() => {
    disableRef.current = disable;
  });
  return { allowLeave: () => disable() };
}
