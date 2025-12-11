export interface AppSettings {
  volume: number; // 0.0 to 5.0 (Amplification factor)
  isMuted: boolean;
}

export interface AudioContextState {
  isReady: boolean;
  isPlaying: boolean;
  error: string | null;
}
