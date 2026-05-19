import { useCallback, useEffect, useRef, useState } from 'react';

export const PENDING_ROUND_SECONDS = 60;

export function usePendingRoundCountdown({
  enabled,
  pendingKey,
  onElapsed,
}: {
  enabled: boolean;
  pendingKey: string;
  onElapsed: () => void;
}) {
  const [remaining, setRemaining] = useState(PENDING_ROUND_SECONDS);
  const [paused, setPaused] = useState(false);
  const keyRef = useRef('');
  const elapsedRef = useRef(false);
  const onElapsedRef = useRef(onElapsed);

  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    if (!enabled) {
      setRemaining(PENDING_ROUND_SECONDS);
      setPaused(false);
      elapsedRef.current = false;
      keyRef.current = '';
      return;
    }

    if (keyRef.current !== pendingKey) {
      keyRef.current = pendingKey;
      elapsedRef.current = false;
      setRemaining(PENDING_ROUND_SECONDS);
      setPaused(false);
    }
  }, [enabled, pendingKey]);

  useEffect(() => {
    if (!enabled || paused || elapsedRef.current) return;

    const interval = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (!elapsedRef.current) {
            elapsedRef.current = true;
            window.setTimeout(() => onElapsedRef.current(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [enabled, paused]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const skip = useCallback(() => {
    if (!enabled || elapsedRef.current) return;
    elapsedRef.current = true;
    setRemaining(0);
    onElapsedRef.current();
  }, [enabled]);

  return {
    remaining,
    paused,
    pause,
    resume,
    skip,
  };
}
