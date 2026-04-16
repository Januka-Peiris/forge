import { useState } from 'react';

const PROFILE_KEY = 'forge:agent-profile';
const DEFAULT_PROFILE_ID = 'claude-default';

export function useAgentProfile(): [string, (id: string) => void] {
  const [profileId, setProfileIdState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(PROFILE_KEY) ?? DEFAULT_PROFILE_ID;
    } catch {
      return DEFAULT_PROFILE_ID;
    }
  });

  const setProfileId = (id: string) => {
    setProfileIdState(id);
    try {
      window.localStorage.setItem(PROFILE_KEY, id);
    } catch {
      // ignore storage errors
    }
  };

  return [profileId, setProfileId];
}
