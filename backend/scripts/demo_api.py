import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("=== 1. GET /health ===")
r = client.get("/health")
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}\n")

print("=== 2. GET /docs (Swagger UI) ===")
r = client.get("/docs")
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('content-type')}")
print(f"HTML snippet: {r.text[:120]}...\n")

print("=== 3. GET /chords (first 3) ===")
r = client.get("/chords")
print(f"Status: {r.status_code}")
chords = r.json()
print(f"Total chords: {len(chords)}")
print(f"Sample: {json.dumps(chords[:3], indent=2)}\n")

print("=== 4. GET /songs?limit=2 ===")
r = client.get("/songs?limit=2")
print(f"Status: {r.status_code}")
songs = r.json()
print(f"Total songs in catalogue: {songs['total']}")
print(f"First 2 items: {json.dumps(songs['items'][:2], indent=2)}\n")

print("=== 5. POST /match (known chords: G, C, D, Em) ===")
r = client.post("/match", json={"known_chords": ["G", "C", "D", "Em"]})
print(f"Status: {r.status_code}")
match_data = r.json()
print(f"Playable count: {match_data['total_playable']}")
print(f"Near count: {match_data['total_near']}")
if match_data['playable']:
    print(f"First playable: {match_data['playable'][0]['title']} by {match_data['playable'][0]['artist']} (chords: {match_data['playable'][0]['chords']})")
if match_data['near']:
    print(f"First near match: {match_data['near'][0]['song']['title']} (missing: {match_data['near'][0]['missing']})\n")

print("=== 6. POST /next-chords (known chords: G, C, D, Em) ===")
r = client.post("/next-chords", json={"known_chords": ["G", "C", "D", "Em"], "limit": 3})
print(f"Status: {r.status_code}")
next_data = r.json()
for rec in next_data["recommendations"]:
    print(f"  Chord: {rec['chord']:<5} | Unlocks: {rec['unlock_count']:<2} songs | Barre: {rec['is_barre']}")
