import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';

const PROFILE_KEY = 'forge:agent-profile';
const DEFAULT_PROFILE_ID = 'claude-default';

export function getStoredAgentProfileId(): string {
  try {
    return window.localStorage.getItem(PROFILE_KEY) ?? DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function setStoredAgentProfileId(profileId: string): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, profileId);
  } catch {
    // ignore storage errors
  }
}

export function useAgentProfile(): [string, Dispatch<SetStateAction<string>>] {
  const [profileId, setProfileIdState] = useState<string>(() => getStoredAgentProfileId());

  const setProfileId = useCallback((next: SetStateAction<string>) => {
    setProfileIdState((current) => {
      const resolved = typeof next === 'function' ? (next as (prev: string) => string)(current) : next;
      setStoredAgentProfileId(resolved);
      return resolved;
    });
  }, []);

  return [profileId, setProfileId];
}
