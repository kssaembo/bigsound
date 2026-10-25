import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, FolderOpen, Music2, Pause, Play, Repeat2, RotateCcw, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { audioService, clampVolume, type EngineMode, type Meter } from './services/audioService';
import { readSettings, writeSettings } from './services/settings';
import YouTubePanel from './components/YouTubePanel';

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
    if (inputMode !== 'file') return;
    const element = audio.current;
    if (!element || !file || busy) return;
    if (!element.paused) { element.pause(); return; }
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
  const switchInput = (next: 'file' | 'youtube') => {
    if (next === inputMode) return;
    generation.current++;
    audio.current?.pause(); audioService.disconnectInput();
    setPlaying(false); setBusy(false); setCapturing(false); setError(''); setMeter({ reductionDb: 0, peak: 0 }); setEngine('ready');
    setInputMode(next);
  };
  const boostAvailable = inputMode === 'file' || capturing;

  const changeVolume = (value: number) => { setVolume(clampVolume(value)); setMuted(false); };
  const percentage = Math.round(volume * 100);
  const reduction = Math.max(0, meter.reductionDb);

  return <div className="app-shell">
    <header className="header"><div className="brand"><span className="brand-icon"><AudioLines size={28} /></span><div><h1>슈퍼 음량</h1><span className="eyebrow">SUPER VOLUME</span></div></div><span className="version">YouTube 추가 · v2.1</span></header>
    <main>
      <div className="intro"><span className="tag"><span /> 작은 소리도 또렷하게</span><h2>듣고 싶은 소리,<br /><em>더 크게.</em></h2><p>내 음원 파일과 유튜브 링크를 한곳에서.<br />파일은 바로, 유튜브는 PC 탭 소리 연결 후 최대 4배 증폭합니다.</p></div>
      <div className="source-tabs" role="tablist" aria-label="재생 소스"><button role="tab" aria-selected={inputMode === 'file'} onClick={() => switchInput('file')}>내 음원 파일</button><button role="tab" aria-selected={inputMode === 'youtube'} onClick={() => switchInput('youtube')}>YouTube 링크</button></div>
      <div className="workspace">
        <section className="player-card" aria-label="음원 재생">
          <div className="card-heading"><span className="step">01</span><h3>{inputMode === 'file' ? '음원 선택' : 'YouTube 재생'}</h3><span className="local-badge"><Check size={13} />{inputMode === 'file' ? '내 기기에서만 재생' : capturing ? '탭 소리 연결됨' : '공식 플레이어'}</span></div>
          {inputMode === 'youtube' ? <YouTubePanel onCapture={onCapture} /> : <>
          <div className={`dropzone ${dragging ? 'dragging' : ''} ${artwork ? 'has-art' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
            {artwork && <img className="cover" src={artwork} alt="" />}
            <button className="file-button" onClick={() => picker.current?.click()}><span className="file-icon">{file ? <Music2 size={34} /> : <FolderOpen size={34} />}</span><strong>{file ? '다른 음원 선택하기' : '음원 파일 선택하기'}</strong><span>{file ? file.name : '파일을 여기에 끌어 놓아도 돼요'}</span></button>
            <input aria-label="음원 파일 선택" ref={picker} type="file" accept="audio/*,.m4a,.flac,.opus" hidden onChange={event => { loadFile(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          <p className="formats">MP3 · WAV · M4A · OGG · FLAC <span>기기에서 지원하는 형식</span></p>
          <div className="timeline"><label className="sr-only" htmlFor="position">재생 위치</label><input id="position" type="range" min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 0)} disabled={!duration} aria-valuetext={`${time(position)} / ${time(duration)}`} onChange={event => { if (audio.current && duration) { audio.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); } }} /><div className="time-labels"><span>{time(position)}</span><span>{time(duration)}</span></div></div>
          <div className="playback"><button className={`icon-button ${repeat ? 'selected' : ''}`} title="한 곡 반복" aria-label="한 곡 반복" aria-pressed={repeat} onClick={() => setRepeat(value => !value)}><Repeat2 size={21} /></button><button className="play-button" disabled={!file || busy} onClick={() => void toggle()}>{playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}<span>{busy ? '준비 중…' : playing ? '일시정지' : '재생하기'}</span></button><button className="icon-button" title="처음부터" aria-label="처음부터" disabled={!file} onClick={() => { if (audio.current) { audio.current.currentTime = 0; setPosition(0); } }}><RotateCcw size={20} /></button></div>
          </>}
        </section>
        <section className="volume-card" aria-label="음량 조절">
          <div className="card-heading"><span className="step">02</span><h3>음량 조절</h3><span className="max-badge">MAX 4×</span></div>
          <div className="volume-display"><span className="volume-caption">{!boostAvailable ? '유튜브 증폭 연결 전' : muted ? '음소거 중' : volume === 0 ? '소리가 꺼져 있어요' : volume > 1 ? '슈퍼 부스트' : '기본 음량'}</span><div className={muted || !boostAvailable ? 'muted' : ''}><strong>{!boostAvailable ? '—' : muted ? 0 : percentage}</strong><span>%</span></div><p>{!boostAvailable ? '일반 재생 음량은 유튜브 플레이어에서 조절하세요.' : <>원본 대비 {(muted ? 0 : volume).toFixed(1)}배 <span>·</span> 최대 +12 dB 증폭</>}</p></div>
          <label className="sr-only" htmlFor="volume">음량, 원본 100%, 최대 400%</label><input disabled={!boostAvailable} className="volume-range" id="volume" type="range" min={0} max={4} step={0.05} value={volume} style={{ '--fill': `${volume / 4 * 100}%` } as React.CSSProperties} onChange={event => changeVolume(Number(event.target.value))} aria-valuetext={`${percentage}%, 원본 대비 ${volume.toFixed(2)}배${muted ? ', 음소거 중' : ''}`} /><div className="range-labels"><span>0%</span><span>200%</span><span>400%</span></div>
          <div className="presets">{[1, 2, 3, 4].map(value => <button disabled={!boostAvailable} key={value} aria-pressed={boostAvailable && !muted && Math.abs(volume - value) < 0.001} className={boostAvailable && !muted && Math.abs(volume - value) < 0.001 ? 'active' : ''} onClick={() => changeVolume(value)}>{value === 1 ? '원본' : `${value}배`}</button>)}<button disabled={!boostAvailable} className={`mute-button ${muted ? 'active' : ''}`} title="음소거 (M)" aria-label="음소거" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button></div>
          <div className="quality-panel"><div className="quality-title"><ShieldCheck size={20} /><strong>음질 보호</strong><span>{!boostAvailable ? '탭 소리 연결 필요' : engine === 'ready' ? '재생 시 자동 적용' : engine === 'fallback' ? '호환 모드' : '작동 중'}</span></div><p>{engine === 'fallback' ? '기본 음질 보호를 사용 중입니다. 최신 Chrome·Edge에서 더 정밀하게 보호할 수 있어요.' : '증폭 경로에서 큰 피크를 자동 조절해 찌그러짐을 줄여요.'}</p><div className="meter-row"><span>출력 레벨</span><div className="meter" role="meter" aria-label="출력 레벨" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, meter.peak) * 100)}><span style={{ width: `${Math.min(1, meter.peak) * 100}%` }} /></div><span>{engine === 'fallback' ? '—' : `${Math.round(meter.peak * 100)}%`}</span></div><div className="quality-status">{(playing || capturing) && reduction > 0.5 ? `큰 소리 보호 중 · ${reduction.toFixed(1)} dB 조절` : '음원의 크기에 맞춰 필요한 순간만 조절합니다.'}</div></div>
        </section>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <aside className="note"><ShieldCheck size={18} /><p><strong>알아두면 좋아요.</strong> 400%는 음원 신호의 증폭 배율이에요. 이미 큰 음원은 음질 보호가 작동하므로 체감 음량은 파일과 스피커에 따라 달라져요.</p></aside>
      <p className="shortcuts">{inputMode === 'file' ? 'SPACE 재생 / 일시정지 · ' : '영상 재생 조작은 YouTube에서 · '}↑ ↓ 증폭 음량 <span>·</span> M 증폭 음소거</p>
    </main>
    <footer><span>ⓒ {new Date().getFullYear()}. Kwon’s class.</span><span>파일·공유 소리는 서버로 전송하지 않습니다. YouTube는 외부 서비스입니다.</span></footer>
    <audio ref={audio} preload="metadata" loop={repeat} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)} onLoadedMetadata={() => { const value = audio.current?.duration ?? 0; setDuration(Number.isFinite(value) ? value : 0); }} onError={() => { if (audio.current?.getAttribute('src')) { setPlaying(false); setError('이 파일을 읽을 수 없습니다. MP3 또는 WAV 파일로 다시 시도해 주세요.'); } }} />
  </div>;
}
