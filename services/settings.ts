export interface Settings { volume: number; repeat: boolean }
const KEY = 'super-volume-v2';
export function readSettings(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (data) return { volume: typeof data.volume === 'number' && Number.isFinite(data.volume) ? Math.min(4, Math.max(0, data.volume)) : 1, repeat: data.repeat === true };
  } catch { /* Private mode or corrupted data: use defaults. */ }
  return { volume: 1, repeat: false };
}
export function writeSettings(settings: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Playback works without storage. */ }
}
