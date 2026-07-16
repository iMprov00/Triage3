const STORAGE_KEY = "stage2_arrival_sound_played";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

type Store = Record<string, number>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || !parsed) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* private mode / quota */
  }
}

function prune(store: Store): Store {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(store)
      .filter(([, ts]) => now - ts < MAX_AGE_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES)
  );
}

export function wasArrivalSoundPlayed(patientId: number): boolean {
  const ts = readStore()[String(patientId)];
  if (!ts) return false;
  return Date.now() - ts < MAX_AGE_MS;
}

export function markArrivalSoundPlayed(patientId: number): void {
  writeStore(prune({ ...readStore(), [String(patientId)]: Date.now() }));
}
