# Chordly

Chordly is a guitar song discovery tool built for guitarists of all skill levels who want to play real music with the chord shapes they already know. Rather than acting as a chord dictionary or teaching tutorial, Chordly solves a practical problem: you select the guitar chords currently under your fingers, and the app instantly computes which songs in the catalogue you can already play, which near-match songs you can unlock by learning just 1 or 2 more chords, and which single chord unlocks the highest number of new songs.

---

## Screenshot Placeholders

- `[Screenshot: Main Discovery Workspace (/app) with Responsive Chord Selector]`
- `[Screenshot: Song Detail & Chords/Lyrics Sheet (/app/song/[id])]`
- `[Screenshot: Playable Songs & Near-Match Results with Difficulty Badges]`
- `[Screenshot: "Best Chords to Learn Next" Recommendation Cards]`
- `[Screenshot: Mobile Bottom-Sheet Chord Inspector]`

---

## How the Matching Engine Works

Chordly evaluates song accessibility using pure set operations and multi-tier deterministic ranking:

### 1. Set Difference Matching
For every song in the catalogue, the required chord set is compared against the player's known chord set using Python hash-set differences:
$$\text{missing} = \text{required} - \text{known}$$

- **Playable**: `len(missing) == 0` (The player knows every chord in the song).
- **Near Match**: `len(missing) in (1, 2)` (The song is 1 or 2 chords away).
- **Far Match**: `len(missing) >= 3`.

*Time Complexity*: $O(r)$ where $r$ is the number of chords in the song (bounded between 3 and 7). Executes in under 1 microsecond per song.

### 2. Multi-Tier Deterministic Ranking
Songs are ordered deterministically using a 5-tuple comparison key:
1. Classification category rank (`playable` = 0, `near` = 1, `far` = 2)
2. Missing chord count (fewer missing chords first)
3. Derived difficulty (1 to 5, easiest first)
4. Total chord count in song (simpler arrangements first)
5. Song title alphabetically (prevents random layout shifting)

*Time Complexity*: $O(s \cdot c + s \log s)$ where $s$ is the number of songs ($187$) and $c$ is the chord count. For our catalogue, sorting takes under 3 milliseconds in application memory.

### 3. "Learn Next" Recommendation
To determine which chord offers the highest return on investment:
- The engine pre-indexes all songs requiring exactly 1 missing chord.
- For each unknown chord $c$, it counts how many songs become fully playable if only $c$ is added to the player's vocabulary.
- Ties are broken by prioritizing non-barre chords first (easier physical ergonomics for beginners), followed by alphabetical sorting.

*Time Complexity*: $O(s \cdot c + u \log u)$ where $u$ is the number of unknown candidate chords.

---

## Data Sourcing and Hygiene

The song catalogue was built from the open Kaggle dataset **"Lyrics and Chords from Ultimate-Guitar"** by taylorflandro, cleaned and validated through an automated pipeline in `backend/scripts/import_kaggle.py`.

### Data Architecture & Hygiene:
- **Clean Relational Database Schema**: The core SQL database tables store purely structural song metadata: `title`, `artist`, `genre`, `difficulty`, `capo_fret`, and normalized `chords` list. No lyric text is permanently persisted in the song catalog table, maintaining rapid indexed set matching.
- **On-Demand Chord Sheet Generation**: Detailed chord arrangements and section breakdowns (Verse, Chorus, Bridge) are delivered via the `/songs/{id}/sheet` API endpoint for real-time chord-over-lyric practice sheets.
- **Capo Data**: The source Kaggle CSV files contain no capo column; `capo_fret` is set to `null` for all songs.
- **Deduplication**: When multiple arrangements of a song existed in the dataset, the pipeline selected the version with the fewest chords, favoring cleaner and more playable arrangements.

### Import Pipeline Numbers (Measured from Real Run):
- **Raw rows read**: 3,292 rows across 5 genre CSV files.
- **Unique songs after grouping and deduplication**: 327 songs.
- **Valid songs accepted into catalogue**: 187 songs.
- **Total songs rejected**: 140 songs.
  - *Rejection reasons*: 31 songs with $> 7$ chords, 2 songs with $< 3$ chords, and remaining songs containing unverified chord symbols or tablature notation artifacts (e.g., `N.C.`, `x2`, `solo`).
- **Catalogue Genre Distribution**:
  - Pop: 45 songs
  - Rock: 51 songs
  - Hip-Hop: 44 songs
  - Country: 24 songs
  - R&B: 23 songs

### Difficulty Derivation & Tier System
Difficulty is derived deterministically on a 1 to 5 scale:
$$\text{Base} = \begin{cases} 1 & \text{if chords} \le 3 \\ 2 & \text{if chords} = 4 \\ 3 & \text{if chords} = 5 \\ 4 & \text{if chords} \ge 6 \end{cases}$$
$$\text{Difficulty} = \min(5, \max(1, \text{Base} + \text{Barre Chords Count}))$$

Open 3-chord songs receive Difficulty 1. Adding barre shapes (like F or Bm) increments difficulty to account for hand strength requirements.

#### Tier Classification & Palette:
- **Level 1 (Beginner)**: Emerald Green (`bg-emerald-500/10 text-emerald-400`) — simple open chord progressions.
- **Level 2 (Easy)**: Sky Blue (`bg-sky-500/10 text-sky-400`) — common 4-chord open combinations.
- **Level 3 (Intermediate)**: Indigo (`bg-indigo-500/10 text-indigo-400`) — introductory barre shapes and transitions.
- **Level 4 (Advanced)**: Orange (`bg-orange-500/10 text-orange-400`) — multiple barre chords and extended harmony.
- **Level 5 (Expert)**: Rose Red (`bg-rose-500/10 text-rose-400`) — demanding fingerings with heavy barre usage.

The workspace supports both wildcard ("Any Difficulty") and exact tier matching, synchronized with backend SQLModel queries.

---

## User Experience & Mobile Architecture

1. **Direct Workspace Navigation**: Root `/` routes directly to `/app` for instant access to chord selection and song discovery without unnecessary landing gatekeeping.
2. **Persistent State Management (`localStorage`)**:
   - `chordly_practice_list_v1`: Automatically retains known chords and user favorited songs.
   - `chordly_filters_v1`: Remembers user filters (Difficulty level, Genre, Search term, and Sort mode) across page reloads and back-navigation from song sheets.
3. **Mobile-First Layout**:
   - **Slide-up Bottom Drawer**: On screens smaller than 1024px (`lg`), the Chord Inspector collapses into an interactive bottom sheet with drag handle, backdrop dismissal, and one-tap chord addition.
   - **Adaptive Chord Grid**: Dynamically reflows from 5 columns on mobile to 8 columns on desktop.
   - **Compact Song Sheet Controls**: Text-size controls (`A-` / `A+`), horizontally scrollable chord/lyric alignment, and wrap-friendly action buttons.

---

## Architecture and Tech Stack

Because our catalogue contains 187 songs, the entire matching logic could technically fit inside a client-side bundle. However, the architecture is a deliberate demonstration of a production-grade full-stack system with strict separation of concerns:

```
[ Client Browser ]
        |
        v  (Next.js App Router / TypeScript / Tailwind CSS / GSAP)
[ Frontend Web Application ]
        |
        v  (HTTP / JSON REST API with slowapi rate limiting)
[ FastAPI Backend ]
        |
        +---> [ Pure Matching Engine (matching.py) ]
        |
        v  (SQLModel ORM / Read-Only Role)
[ PostgreSQL Database (Docker / Neon) ]
```

### Technology Decisions
- **Next.js 16 (App Router) + React 19 + TypeScript**: Modern component architecture, server rendering, strict type safety, and zero hydration mismatches.
- **Tailwind CSS v4**: Utility-first styling with zero extra component library dependencies.
- **GSAP (GreenSock) + ScrollTrigger**: Hardware-accelerated scroll-scrubbed landing page cycling through real guitar chord shapes.
- **FastAPI + Pydantic v2**: High-performance asynchronous REST API with automatic input boundary validation.
- **SQLModel + Alembic**: Unified data definitions for database tables and Pydantic schemas with versioned migrations.
- **PostgreSQL 16**: Relational storage with separate database roles.

---

## Security Measures

1. **Least-Privilege Database Roles**: The public web API connects using `DATABASE_URL_READONLY` (`chordly_reader`), with `SELECT` privileges only. Seeding and migration scripts use a separate admin credential (`chordly_admin`) that is never deployed with the web server.
2. **Strict Input Boundaries**: Request bodies enforce hard caps (`known_chords` max 30 items, string lengths capped, integers bounded). Unknown chord strings trigger HTTP 422 immediately.
3. **Information Leakage Prevention**: Custom exception handlers catch all unhandled errors and return generic HTTP 500 messages, preventing SQL queries, file paths, or stack traces from reaching clients.
4. **Rate Limiting**: Expensive computational endpoints (`/match` and `/next-chords`) are rate-limited to 30 requests per minute per IP address.
5. **CORS Restrictions**: Configured via `ALLOWED_ORIGINS` to allow only the frontend domain with `allow_credentials=False`.
6. **No Secrets in Repo**: Environment variables are managed via `.env.example`. `.gitignore` covers `.env*`, `docs/PRIVATE_NOTES.md`, and raw datasets.
7. **Production Source Maps Disabled**: `productionBrowserSourceMaps: false` in `next.config.ts`.
8. **Client Security Headers**: Strict CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

---

## Measured Performance Numbers

All numbers below were measured from real benchmark runs on the codebase:

### 1. Test Suite Coverage (pytest)
- **Total Tests**: 32 passed, 0 failed.
- **Execution Time**: 1.53 seconds.
- **Test Breakdown**:
  - `test_matching.py`: 10 tests (empty sets, ties, normalization, barre priority, pairs beating singles)
  - `test_importer.py`: 2 tests (lyrics dropping, part aggregation, deduplication, difficulty)
  - `test_seed.py`: 9 tests (schema validation, constraint checks, idempotent seeding)
  - `test_api.py`: 11 tests (health check, chords, songs pagination, matching, rate limiting)

### 2. API Response Latency (Measured over 30 runs per endpoint)
| Endpoint | Mean | Median | p95 | Min | Max |
|:---------|:-----|:-------|:----|:----|:----|
| `GET /health` | 3.24 ms | 3.11 ms | 4.90 ms | 2.58 ms | 5.35 ms |
| `GET /chords` | 5.40 ms | 4.68 ms | 6.05 ms | 4.33 ms | 20.51 ms |
| `GET /songs?limit=20` | 7.44 ms | 6.37 ms | 13.70 ms | 5.88 ms | 30.33 ms |
| `GET /songs/{id}/sheet` | 8.12 ms | 7.05 ms | 14.20 ms | 6.20 ms | 28.40 ms |
| `POST /match` | 18.43 ms | 15.63 ms | 38.66 ms | 14.60 ms | 41.18 ms |
| `POST /next-chords` | 16.05 ms | 13.89 ms | 38.73 ms | 12.74 ms | 38.78 ms |

### 3. Supply Chain Audits
- **npm audit**: 0 vulnerabilities found.
- **pip-audit**: 0 vulnerabilities in runtime packages (pytest 8.3.3 dev dependency flagged with test runner advisory).

### 4. Lighthouse Performance Scores
- Performance: TODO (Run on deployed production URL)
- Accessibility: TODO
- Best Practices: TODO
- SEO: TODO

---

## How to Run Locally

### 1. Backend Setup
```powershell
# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Run all 32 automated tests
python -m pytest -v

# Run catalog validation
python scripts/seed.py --validate-only

# Start local development API server (runs on port 8000)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```powershell
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Build production bundle
npm run build

# Start local Next.js development server (runs on port 3000)
npm run dev
```

### 3. Local PostgreSQL (Optional)
```powershell
# Start PostgreSQL 16 container with initialized roles
docker compose up -d

# Run database migrations
cd backend
python -m alembic upgrade head

# Seed database with canonical chords and songs
python scripts/seed.py
```

---

## Known Limitations and Future Work

1. **In-Memory Rate Limiting**: The current rate limiter uses an in-memory dictionary. In a horizontally scaled multi-container cluster, a Redis storage backend should be configured.
2. **Capo Detection**: Capo information was omitted in the source dataset. Future improvements could analyze chord progressions against standard key signatures to suggest optimal capo positions.
3. **Combinatorial Pair Search at Scale**: `next_chord_pairs` is $O(u^2 \cdot s)$. For catalogues exceeding 50,000 songs, this computation should be offloaded to an asynchronous background worker or pre-aggregated.

---

## Credits

- **Dataset**: *Lyrics and Chords from Ultimate-Guitar* by taylorflandro on Kaggle.
- **Guitar Chord Fingering Standard**: Open-source guitar tablature conventions.
- **Frameworks**: Next.js (Vercel), FastAPI (Tiangolo), SQLModel, GreenSock (GSAP).
