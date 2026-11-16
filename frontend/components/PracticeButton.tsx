"use client";

import { localDay, recordPractice, removePractice } from "@/lib/personalizationStorage";
import { usePersonalization } from "@/lib/usePersonalization";

export function PracticeButton({ songId }: { songId: number }) {
  const { profile, loaded } = usePersonalization();
  const practicedToday = profile.history.some(entry => entry.songId === songId && localDay(entry.practicedAt) === localDay(Date.now()));
  return (
    <button type="button" disabled={!loaded} aria-pressed={practicedToday}
      onClick={() => practicedToday ? removePractice(songId, localDay(Date.now())) : recordPractice(songId)}
      className="personal-practice-button" aria-label={practicedToday ? "Unmark today's practice" : "Mark this song as practised"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      {practicedToday ? "Practised today" : "Mark as practised"}
    </button>
  );
}
