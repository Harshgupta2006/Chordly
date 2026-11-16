"use client";

import { NextChordRecommendation } from "../lib/types";

interface LearnNextPanelProps {
  recommendations: NextChordRecommendation[];
  personalizedRecommendation?: NextChordRecommendation;
  onAddChord: (chord: string) => void;
  onPreviewChord: (chord: string) => void;
  loading: boolean;
}

export function LearnNextPanel({
  recommendations,
  personalizedRecommendation,
  onAddChord,
  onPreviewChord,
  loading,
}: LearnNextPanelProps) {
  const suggestions = personalizedRecommendation
    ? [personalizedRecommendation, ...recommendations]
    : recommendations;

  if (loading && suggestions.length === 0) {
    return (
      <div className="learn-next-grid" aria-label="Loading chord suggestions" aria-busy="true">
        {[0, 1, 2].map(index => <div key={index} className="learning-card learning-card-loading animate-pulse" />)}
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="learn-next-grid" aria-busy={loading}>
      {suggestions.map(rec => {
        const personalized = rec === personalizedRecommendation;
        return (
          <article key={rec.chord} className="learning-card">
            <div className="learning-card-heading">
              <p className="learning-card-label">{personalized ? "For your next practice" : "More chords to explore"}</p>
              {rec.is_barre && <span className="learning-barre">Barre</span>}
            </div>
            <div className="learning-card-chord">
              <h3>{rec.chord}</h3>
              <span>{rec.unlock_count} {rec.unlock_count === 1 ? "song opens up" : "songs open up"}</span>
            </div>
            <p className="learning-card-description">
              {personalized
                ? <>Try it with <span>{rec.unlocked_songs[0]}</span>.</>
                : <>Unlocks <span>{rec.unlocked_songs.slice(0, 3).join(", ")}{rec.unlocked_songs.length > 3 && ` +${rec.unlocked_songs.length - 3} more`}</span>.</>}
            </p>
            <div className="learning-card-actions">
              <button type="button" className="learning-shape-button" onClick={() => onPreviewChord(rec.chord)} aria-label={`View ${rec.chord} chord shape`}>
                View shape
              </button>
              <button type="button" className="learning-add-button" onClick={() => onAddChord(rec.chord)}>
                Add {rec.chord} to my chords
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
