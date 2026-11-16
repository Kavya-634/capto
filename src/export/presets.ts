import type { CaptionStyle } from '../captions';

export type SavedPreset = { id: string; name: string; style: CaptionStyle; savedAt: number };

const KEY = 'capto-style-presets-v1';
const MAX_PRESETS = 24;

function read(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPreset) : [];
  } catch {
    return [];
  }
}
function write(list: SavedPreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false; // quota or private mode; caller shows a message
  }
}
function isPreset(p: unknown): p is SavedPreset {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  const s = o.style as Record<string, unknown> | undefined;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    !!s &&
    typeof s.font === 'string' &&
    typeof s.size === 'number' &&
    typeof s.color === 'string' &&
    typeof s.animation === 'string'
  );
}

export const stylePresets = {
  list: read,
  save(name: string, style: CaptionStyle): { ok: true; preset: SavedPreset } | { ok: false; reason: string } {
    const clean = name.trim().slice(0, 40);
    if (!clean) return { ok: false, reason: 'Give the preset a name.' };
    const list = read();
    if (list.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
      return {
        ok: false,
        reason: 'A preset with that name already exists. Delete it first or pick another name.',
      };
    if (list.length >= MAX_PRESETS)
      return { ok: false, reason: `You can keep up to ${MAX_PRESETS} presets.` };
    const preset: SavedPreset = {
      id: crypto.randomUUID(),
      name: clean,
      style: { ...style },
      savedAt: Date.now(),
    };
    return write([preset, ...list])
      ? { ok: true, preset }
      : { ok: false, reason: 'Could not save to this browser (storage full or disabled).' };
  },
  remove(id: string) {
    return write(read().filter((p) => p.id !== id));
  },
  rename(id: string, name: string) {
    const clean = name.trim().slice(0, 40);
    if (!clean) return false;
    return write(read().map((p) => (p.id === id ? { ...p, name: clean } : p)));
  },
  exportAll(): string {
    return JSON.stringify({ schema: 'capto.style-presets.v1', presets: read() }, null, 2);
  },
  importAll(json: string): { added: number; skipped: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { added: 0, skipped: 0 };
    }
    const incoming = (parsed as { presets?: unknown[] })?.presets;
    if (!Array.isArray(incoming)) return { added: 0, skipped: 0 };
    const existing = read();
    const names = new Set(existing.map((p) => p.name.toLowerCase()));
    const fresh: SavedPreset[] = [];
    let skipped = 0;
    for (const p of incoming) {
      if (!isPreset(p) || names.has(p.name.toLowerCase())) {
        skipped++;
        continue;
      }
      fresh.push({ ...p, id: crypto.randomUUID(), savedAt: Date.now() });
      names.add(p.name.toLowerCase());
    }
    write([...fresh, ...existing]);
    return { added: fresh.length, skipped };
  },
};
