import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, MonitorUp, Unplug, X } from 'lucide-react';
import { audioService } from '../services/audioService';
import { parseYouTubeLink, tabCaptureSupport, type YouTubeVideo } from '../services/youtube';

export interface YouTubePanelHandle { deactivate: () => void }
interface Props { onCapture: (active: boolean) => void; onActivate: () => void; onClose: () => void }

export default forwardRef<YouTubePanelHandle, Props>(function YouTubePanel({ onCapture, onActivate, onClose }, ref) {
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [external, setExternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [support] = useState(tabCaptureSupport);
  const [surfaceLabel, setSurfaceLabel] = useState('');
  const session = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const alive = useRef(false);

  const stop = () => {
    session.current++;
    const previous = stream.current;
    stream.current = null;
    if (previous) { audioService.disconnectInput(); previous.getTracks().forEach(track => track.stop()); }
    if (preview.current) preview.current.srcObject = null;
    setActive(false); setPending(false); setSurfaceLabel(''); onCapture(false);
  };

  const deactivate = () => { stop(); setVideo(null); setExternal(false); setError(''); };
  useImperativeHandle(ref, () => ({ deactivate }));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; session.current++;
      const previous = stream.current; stream.current = null;
      if (previous) { audioService.disconnectInput(); previous.getTracks().forEach(track => track.stop()); }
      onCapture(false);
    };
  }, [onCapture]);

  const connect = async () => {
    if (!video || !external || !support.supported || pending || active) return;
    const token = ++session.current;
    setPending(true); setError('');
    let selected: MediaStream | null = null;
    const unlock = audioService.unlock().then(() => null, error => error as unknown);
    try {
      // getDisplayMedia must be invoked directly from the click gesture.
      selected = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 5 },
        audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        selfBrowserSurface: 'exclude', systemAudio: 'exclude', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
      } as DisplayMediaStreamOptions);
      if (!alive.current || token !== session.current) { selected.getTracks().forEach(track => track.stop()); return; }
      const audioTrack = selected.getAudioTracks()[0], videoTrack = selected.getVideoTracks()[0];
      if (!audioTrack) throw new Error('NO_AUDIO');
      if (videoTrack?.getSettings().displaySurface !== 'browser') throw new Error('TAB_REQUIRED');
      const settings = audioTrack.getSettings() as MediaTrackSettings & { suppressLocalAudioPlayback?: boolean };
      if (settings.suppressLocalAudioPlayback !== true) throw new Error('SUPPRESSION_REQUIRED');
      stream.current = selected;
      const ended = () => { if (alive.current && token === session.current) stop(); };
      selected.getTracks().forEach(track => track.addEventListener('ended', ended, { once: true }));
      // Only the audio tracks enter the gain graph. Video is a muted local preview.
      const unlockError = await unlock;
      if (unlockError) throw unlockError;
      if (!alive.current || token !== session.current) { selected.getTracks().forEach(track => track.stop()); return; }
      await audioService.prepareStream(new MediaStream(selected.getAudioTracks()));
      if (!alive.current || token !== session.current) { selected.getTracks().forEach(track => track.stop()); return; }
      setActive(true); setSurfaceLabel(videoTrack?.label || '선택한 브라우저 탭'); onCapture(true);
    } catch (err) {
      selected?.getTracks().forEach(track => track.stop());
      if (!alive.current || token !== session.current) return;
      if (stream.current) audioService.disconnectInput();
      stream.current = null; onCapture(false);
      const message = err instanceof Error ? err.message : '';
      const name = err instanceof DOMException ? err.name : '';
      setError(name === 'NotAllowedError' ? '공유가 취소되었거나 허용되지 않았습니다. 다시 연결할 수 있어요.' : message === 'TAB_REQUIRED' ? '화면이나 창 대신 유튜브가 재생 중인 브라우저 탭을 선택해 주세요.' : message === 'SUPPRESSION_REQUIRED' ? '원본 탭의 중복 소리를 막을 수 없어 연결하지 않았습니다. 최신 PC Chrome·Edge에서 다시 시도해 주세요.' : message === 'NO_AUDIO' ? '소리가 포함되지 않았습니다. 유튜브 탭을 고르고 ‘탭 오디오 공유’를 켜 주세요.' : '탭 소리를 연결하지 못했습니다. 유튜브를 재생한 뒤 다시 시도해 주세요.');
    } finally { if (alive.current && token === session.current) setPending(false); }
  };

  useEffect(() => {
    if (active && preview.current && stream.current) { preview.current.srcObject = stream.current; void preview.current.play().catch(() => {}); }
  }, [active]);

  return <div className="youtube-panel">
    <form className="youtube-form" onSubmit={event => {
      event.preventDefault(); const parsed = parseYouTubeLink(url);
      if (!parsed) { setError('유튜브 영상 링크를 다시 확인해 주세요.'); return; }
      stop(); onActivate(); setVideo(parsed); setExternal(false); setError('');
    }}><label htmlFor="youtube-link"><Link2 size={22} /> 유튜브 링크</label><div><input id="youtube-link" type="text" inputMode="url" value={url} placeholder="링크를 여기에 붙여 넣어요" onChange={event => setUrl(event.target.value)} autoComplete="off" maxLength={2048} /><button type="submit">열기</button></div></form>
    {video && <div className="youtube-content"><div className="video-heading"><span>{active ? '슈퍼음량 연결 완료!' : '유튜브로 들어요'}</span><button className="icon-button" aria-label="유튜브 닫기" onClick={() => { deactivate(); onClose(); }}><X size={22} /></button></div>
      {!external && <div className="youtube-frame"><iframe key={video.embedUrl} src={video.embedUrl} title="YouTube 영상 재생" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>}
      {!support.supported ? <p className="unsupported" role="status">{support.reason}</p> : !active && <div className="capture-guide">
        {!external ? <><p>더 크게 들으려면 PC 탭을 연결해요.</p><button type="button" onClick={() => { window.open(video.watchUrl, '_blank', 'noopener,noreferrer'); setExternal(true); setError(''); }}><ExternalLink size={20} /> 유튜브 탭 열기</button></> : <><ol><li>새로 열린 유튜브 탭에서 재생해요.</li><li>아래 버튼 → 유튜브 탭을 골라요.</li><li>‘탭 오디오 공유’를 켜고 공유해요.</li></ol><button type="button" className="connect-button" disabled={pending} onClick={() => void connect()}><MonitorUp size={20} />{pending ? '탭 선택 대기 중…' : '탭 소리 연결'}</button><button type="button" className="text-button" disabled={pending} onClick={() => { stop(); setExternal(false); }}>이 화면에서 원래 소리로 듣기</button></>}
      </div>}
      {active && <div className="capture-active"><strong role="status">탭 소리 증폭 연결됨</strong><span className="surface-label">{surfaceLabel}</span><video ref={preview} muted playsInline autoPlay aria-label="공유 중인 탭 미리보기" /><p>음량은 여기서, 재생은 유튜브 탭에서!</p><button type="button" onClick={stop}><Unplug size={20} /> 증폭 연결 해제</button></div>}
    </div>}
    {error && <div className="youtube-error" role="alert">{error}</div>}
  </div>;
});
