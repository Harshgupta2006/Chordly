import { fileURLToPath } from "node:url";
import { loadTypeScript } from "./recommendation-runtime.mjs";

const ranker = loadTypeScript(fileURLToPath(new URL("../lib/personalization.ts", import.meta.url)));
const engine = loadTypeScript(fileURLToPath(new URL("../lib/matchingEngine.ts", import.meta.url)));
const firstPage = engine.getAllSongs({ limit: 100 });
const songs = Array.from({ length: firstPage.total_pages }, (_, page) => engine.getAllSongs({ page: page + 1, limit: 100 }).items).flat();
let input = "";
for await (const chunk of process.stdin) input += chunk;
const requests = JSON.parse(input);
const output = requests.map(request => {
  const ranked = ranker.rankPersonalizedSongs({ ...request, songs });
  const eligible = new Set(ranked.map(item => item.song.id));
  const baseline = engine.matchSongs(request.knownChords, { difficulty_max: request.profile.preferences.maxDifficulty });
  return {
    personalized: ranked.map(item => item.song.id),
    baseline: [...baseline.playable, ...baseline.near.map(item => item.song)].map(song => song.id).filter(id => eligible.has(id)),
  };
});
process.stdout.write(JSON.stringify(output));
