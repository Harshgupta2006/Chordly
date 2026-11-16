"use client";

import { useEffect, useState } from "react";
import { emptyProfile, PROFILE_EVENT, PROFILE_KEY, readProfile } from "./personalizationStorage";

export function usePersonalization() {
  const [state, setState] = useState({ profile: emptyProfile(), persistent: true, loaded: false });
  useEffect(() => {
    const refresh = () => setState({ ...readProfile(), loaded: true });
    const onStorage = (event: StorageEvent) => {
      if (event.key === PROFILE_KEY || event.key === null) refresh();
    };
    refresh();
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleNextDay = () => {
      const nextDay = new Date();
      nextDay.setHours(24, 0, 0, 100);
      midnightTimer = setTimeout(() => { refresh(); scheduleNextDay(); }, nextDay.getTime() - Date.now());
    };
    scheduleNextDay();
    window.addEventListener(PROFILE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(midnightTimer);
      window.removeEventListener(PROFILE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return state;
}
