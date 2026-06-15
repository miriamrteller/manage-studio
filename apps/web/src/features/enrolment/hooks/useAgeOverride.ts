import { useCallback, useState } from 'react';

export interface AgeOverrideState {
  confirmed: boolean;
  reason: string;
}

const INITIAL_AGE_OVERRIDE: AgeOverrideState = { confirmed: false, reason: '' };

export function useAgeOverride() {
  const [classAgeOverride, setClassAgeOverride] = useState<AgeOverrideState>(INITIAL_AGE_OVERRIDE);

  const handleClassAgeOverrideChange = useCallback((confirmed: boolean, reason: string) => {
    setClassAgeOverride((prev) => {
      if (prev.confirmed === confirmed && prev.reason === reason) {
        return prev;
      }
      return { confirmed, reason };
    });
  }, []);

  const resetAgeOverride = useCallback(() => {
    setClassAgeOverride(INITIAL_AGE_OVERRIDE);
  }, []);

  return {
    classAgeOverride,
    setClassAgeOverride,
    handleClassAgeOverrideChange,
    resetAgeOverride,
  };
}
