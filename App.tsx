import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, FolderOpen, Music2, Pause, Play, Repeat2, RotateCcw, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { audioService, clampVolume, type EngineMode, type Meter } from './services/audioService';
import { readSettings, writeSettings } from './services/settings';
import YouTubePanel, { type YouTubePanelHandle } from './components/YouTubePanel';

const time = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';

export default function App() {
  const [settings] = useState(readSettings);
  const [volume, setVolume] = useState(settings.volume);
  const [repeat, setRepeat] = useState(settings.repeat);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [engine, setEngine] = useState<EngineMode>('ready');
  const [meter, setMeter] = useState<Meter>({ reductionDb: 0, peak: 0 });
  const [inputMode, setInputMode] = useState<'file' | 'youtube'>('file');
  const [capturing, setCapturing] = useState(false);
  const youtube = useRef<YouTubePanelHandle>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const fileUrl = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => { audioService.setVolume(muted ? 0 : volume); }, [volume, muted]);
  useEffect(() => {
    const timer = window.setTimeout(() => writeSettings({ volume, repeat }), 350);
    const flush = () => writeSettings({ volume, repeat });
    window.addEventListener('pagehide', flush);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', flush); };
  }, [volume, repeat]);
  useEffect(() => {
    if (!playing && !capturing) { setMeter({ reductionDb: 0, peak: 0 }); return; }
    const timer = window.setInterval(() => setMeter({ ...audioService.getMeter() }), 100);
    return () => window.clearInterval(timer);
  }, [playing, capturing]);
  useEffect(() => () => {
    generation.current++;
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
  }, []);

  const loadFile = useCallback((selected?: File) => {
    if (!selected || !audio.current) return;
    const supported = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|aif|aiff|mp4)$/i.test(selected.name);
    if (selected.size === 0 || (!selected.type.startsWith('audio/') && !supported)) {
      setError('비어 있지 않은 음원 파일을 선택해 주세요.'); return;
    }
    youtube.current?.deactivate();
    audioService.disconnectInput(); setInputMode('file'); setCapturing(false); setEngine('ready');
    const token = ++generation.current;
    const element = audio.current;
    element.pause();
    element.removeAttribute('src');
    element.load();
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    const url = URL.createObjectURL(selected);
    fileUrl.current = url;
    element.src = url;
    element.load();
    setFile(selected); setArtwork(null); setPosition(0); setDuration(0); setError(''); setBusy(false);
    jsmediatags.read(selected, {
      onSuccess: result => {
        if (generation.current !== token) return;
        const picture = result.tags.picture;
        if (!picture || !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(picture.format) || picture.data.length > 5 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () => { if (generation.current === token) setArtwork(String(reader.result)); };
        reader.readAsDataURL(new Blob([new Uint8Array(picture.data)], { type: picture.format }));
      }, onError: () => { /* Album art is optional. */ },
    });
  }, []);

  const toggle = useCallback(async () => {
    const element = audio.current;
    if (!element || !file || busy) return;
    if (!element.paused) { element.pause(); return; }
    if (inputMode === 'youtube') { youtube.current?.deactivate(); generation.current++; setInputMode('file'); }
    const token = generation.current;
    setBusy(true); setError('');
    try {
      await audioService.prepare(element);
      if (generation.current !== token) return;
      setEngine(audioService.mode);
      await element.play();
    } catch {
      if (generation.current === token) {
        element.pause();
        setError('재생할 수 없습니다. 지원하는 음원인지 확인하고 다시 재생해 주세요.');
      }
    } finally { if (generation.current === token) setBusy(false); }
  }, [file, busy, inputMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button,input,textarea,select,a,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space') { event.preventDefault(); void toggle(); }
      if (inputMode === 'youtube' && !capturing) return;
      if (event.key.toLowerCase() === 'm') setMuted(value => !value);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); setMuted(false);
        setVolume(value => clampVolume(value + (event.key === 'ArrowUp' ? 0.1 : -0.1)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, inputMode, capturing]);

  const onCapture = useCallback((active: boolean) => {
    setCapturing(active);
    setEngine(active ? audioService.mode : 'ready');
  }, []);
  const activateYouTube = useCallback(() => {
    generation.current++; audio.current?.pause(); audioService.disconnectInput();
    setPlaying(false); setBusy(false); setError(''); setEngine('ready'); setInputMode('youtube');
  }, []);
  const closeYouTube = useCallback(() => { setInputMode('file'); }, []);
  const boostAvailable = inputMode === 'file' || capturing;

  const changeVolume = (value: number) => { setVolume(clampVolume(value)); setMuted(false); };
  const percentage = Math.round(volume * 100);
  const reduction = Math.max(0, meter.reductionDb);

  return <div className="app-shell">
    <header className="header"><div className="brand"><span className="brand-icon"><AudioLines size={30} /></span><h1>슈퍼음량</h1></div><p>듣고 싶은 소리를<br className="mobile-break" /> 더 크게 재생하세요!</p></header>
    <main>
      <div className="workspace">
        <section className="player-card" aria-label="음원 재생">
          <div className="card-heading"><span className="step">1</span><h2>음악을 골라요</h2><Music2 className="heading-icon" size={28} /></div>
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
            <button className="file-button" onClick={() => picker.current?.click()}><span className="file-icon">{artwork ? <img src={artwork} alt="" /> : <FolderOpen size={34} />}</span><span className="file-copy"><strong>{file ? '다른 음악 고르기' : '음악 파일 고르기'}</strong><span>{file ? file.name : '내 기기에 있는 음악을 골라요'}</span></span></button>
            <input aria-label="음원 파일 선택" ref={picker} type="file" accept="audio/*,.m4a,.flac,.opus" hidden onChange={event => { loadFile(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          {file && <div className="file-controls">
            <div className="timeline"><label className="sr-only" htmlFor="position">재생 위치</label><input id="position" type="range" min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 0)} disabled={!duration || inputMode !== 'file'} aria-valuetext={`${time(position)} / ${time(duration)}`} onChange={event => { if (audio.current && duration) { audio.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); } }} /><div className="time-labels"><span>{time(position)}</span><span>{time(duration)}</span></div></div>
            <div className="playback"><button className={`icon-button ${repeat ? 'selected' : ''}`} title="한 곡 반복" aria-label="한 곡 반복" aria-pressed={repeat} onClick={() => setRepeat(value => !value)}><Repeat2 size={24} /></button><button className="play-button" disabled={busy} onClick={() => void toggle()}>{playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}<span>{busy ? '준비 중…' : playing ? '잠깐 멈추기' : '재생하기'}</span></button><button className="icon-button" title="처음부터" aria-label="처음부터" onClick={() => { if (audio.current) { audio.current.currentTime = 0; setPosition(0); } }}><RotateCcw size={24} /></button></div>
          </div>}
          <div className="or-divider"><span>또는 유튜브로 듣기</span></div>
          <YouTubePanel ref={youtube} onCapture={onCapture} onActivate={activateYouTube} onClose={closeYouTube} />
        </section>
        <section className="volume-card" aria-label="음량 조절">
          <div className="card-heading"><span className="step">2</span><h2>소리를 키워요</h2><Volume2 className="heading-icon" size={28} /></div>
          <div className="volume-display"><span className="volume-caption">{!boostAvailable ? '유튜브는 원래 소리로 재생 중' : muted || volume === 0 ? '소리가 꺼져 있어요' : volume > 1 ? '더 크게, 슈퍼음량!' : '원래 크기로 들어요'}</span><div className={muted || !boostAvailable ? 'muted' : ''}><strong>{!boostAvailable ? '—' : muted ? 0 : percentage}</strong><span>%</span></div></div>
          <label className="sr-only" htmlFor="volume">음량, 원본 100%, 최대 400%</label><input disabled={!boostAvailable} className="volume-range" id="volume" type="range" min={0} max={4} step={0.05} value={volume} style={{ '--fill': `${volume / 4 * 100}%` } as React.CSSProperties} onChange={event => changeVolume(Number(event.target.value))} aria-valuetext={`${percentage}%, 원본 대비 ${volume.toFixed(2)}배${muted ? ', 음소거 중' : ''}`} /><div className="range-labels"><span>작게</span><span>크게</span></div>
          <div className="presets">{[1, 2, 3, 4].map(value => <button disabled={!boostAvailable} key={value} aria-pressed={boostAvailable && !muted && Math.abs(volume - value) < 0.001} className={boostAvailable && !muted && Math.abs(volume - value) < 0.001 ? 'active' : ''} onClick={() => changeVolume(value)}>{value === 1 ? '원본' : `${value}배`}</button>)}</div>
          <div className="volume-bottom"><button disabled={!boostAvailable} className={`mute-button ${muted ? 'selected' : ''}`} aria-label="음소거" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={23} /> : <Volume2 size={23} />}{muted ? '소리 켜기' : '음소거'}</button><div className="quality-title"><ShieldCheck size={22} /><span>{!boostAvailable ? '연결 후 음질 보호' : engine === 'ready' ? '음질 자동 보호' : engine === 'fallback' ? '기본 음질 보호' : '음질 보호 중'}</span></div></div>
          <div className="meter" role="meter" aria-label="출력 레벨" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, meter.peak) * 100)}><span style={{ width: `${Math.min(1, meter.peak) * 100}%` }} /></div>
          <p className="quality-status" aria-live="polite">{(playing || capturing) && reduction > 0.5 ? '큰 소리가 찌그러지지 않게 조절하고 있어요' : '작은 소리부터 천천히 키워 보세요'}</p>
        </section>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <details className="help"><summary>사용 도움말</summary><div><p>음악 파일을 고르고 재생 버튼을 누르세요. 막대를 움직이거나 원본·2배·3배·4배 버튼으로 소리를 조절해요.</p><p>4배(400%)는 음원 신호의 증폭 배율이에요. 실제로 들리는 크기는 음악과 스피커에 따라 달라져요. 큰 소리는 자동으로 조절해 찌그러짐을 줄이지만, 모든 왜곡을 없애지는 못해요.</p><p>유튜브는 공식 플레이어로 재생돼요. 모바일·태블릿에서는 일반 재생만, 지원되는 PC Chrome·Edge에서는 탭 소리 연결 후 증폭할 수 있어요. 외부 재생이 제한된 영상은 유튜브에서 열어 주세요.</p><p>음악 파일과 공유한 소리는 내 기기에서 처리하며 서버에 전송하거나 저장하지 않아요. 유튜브를 열면 외부 서비스와 통신해요. 음량·반복 설정은 이 브라우저에 저장돼요.</p><p>지원 형식: MP3, WAV, M4A, OGG, FLAC 등 기기가 재생할 수 있는 음원. 키보드: Space 재생·정지, ↑ ↓ 음량, M 음소거.</p></div></details>
    </main>
    <footer><span><ShieldCheck size={17} /> 내 음악 파일은 내 기기에서만 재생해요</span><small>ⓒ Kwon’s class.</small></footer>
    <audio ref={audio} preload="metadata" loop={repeat} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)} onLoadedMetadata={() => { const value = audio.current?.duration ?? 0; setDuration(Number.isFinite(value) ? value : 0); }} onError={() => { if (audio.current?.getAttribute('src')) { setPlaying(false); setError('이 파일을 읽을 수 없습니다. MP3 또는 WAV 파일로 다시 시도해 주세요.'); } }} />
  </div>;
}
