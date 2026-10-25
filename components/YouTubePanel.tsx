import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, MonitorUp, Unplug } from 'lucide-react';
import { audioService } from '../services/audioService';
import { parseYouTubeLink, tabCaptureSupport, type YouTubeVideo } from '../services/youtube';

interface Props { onCapture: (active: boolean) => void }

export default function YouTubePanel({ onCapture }: Props) {
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
      event.preventDefault();
      const parsed = parseYouTubeLink(url);
      if (!parsed) { setError('올바른 유튜브 영상 링크를 입력해 주세요. watch·youtu.be·Shorts 링크를 지원합니다.'); return; }
      stop(); setVideo(parsed); setExternal(false); setError('');
    }}><label htmlFor="youtube-link"><Link2 size={16} /> 유튜브 영상 링크</label><div><input id="youtube-link" type="text" inputMode="url" value={url} placeholder="https://www.youtube.com/watch?v=…" onChange={event => setUrl(event.target.value)} autoComplete="off" maxLength={2048} /><button type="submit">불러오기</button></div></form>
    {video && !external && <><div className="youtube-frame"><iframe key={video.embedUrl} src={video.embedUrl} title="YouTube 영상 재생" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div><p className="youtube-status">일반 재생 · 아직 슈퍼 증폭이 연결되지 않았어요.</p></>}
    {!video && <div className="youtube-empty"><Link2 size={32} /><strong>링크로 유튜브를 재생해요</strong><p>영상 링크를 넣고 불러오기를 누르세요.<br />영상은 공식 YouTube 플레이어로 재생됩니다.</p></div>}
    <div className="capture-guide"><strong>PC에서 유튜브 소리 증폭하기</strong><ol><li>아래 버튼으로 유튜브를 새 탭에서 열고 재생하세요.</li><li>이 화면으로 돌아와 ‘탭 소리 연결’을 누르세요.</li><li>열어 둔 <b>유튜브 탭</b>을 선택하고 <b>탭 오디오 공유</b>를 켜세요.</li></ol><p>공유를 허용한 후 오른쪽 100~400% 조절이 적용됩니다. 이 슈퍼음량 탭은 공유하지 마세요.</p>
      <div className="capture-actions"><button type="button" disabled={!video || pending || active} onClick={() => {
        if (!video) return;
        // Opening the official watch URL avoids capturing this app's own output.
        window.open(video.watchUrl, '_blank', 'noopener,noreferrer');
        setExternal(true); setError('');
      }}><ExternalLink size={15} /> 유튜브 탭 열기</button><button type="button" className="connect-button" disabled={!video || !external || !support.supported || pending || active} onClick={() => void connect()}><MonitorUp size={15} />{pending ? '탭 선택 대기 중…' : '탭 소리 연결'}</button></div>
      {!support.supported && <p className="unsupported" role="status">{support.reason}</p>}
    </div>
    {external && !active && <div className="external-status">유튜브 탭에서 재생한 후 소리를 연결해 주세요.<button type="button" disabled={pending} onClick={() => { stop(); setExternal(false); }}>이 화면에서 일반 재생</button></div>}
    {active && <div className="capture-active"><strong role="status">탭 소리 증폭 연결됨</strong><span>{surfaceLabel}</span><video ref={preview} muted playsInline autoPlay aria-label="공유 중인 탭 미리보기" /><p>영상·재생 조작은 원래 유튜브 탭에서 해 주세요. 이 화면에서는 음량을 조절합니다.</p><button type="button" onClick={stop}><Unplug size={15} /> 증폭 연결 해제</button></div>}
    {error && <div className="youtube-error" role="alert">{error}</div>}
    <p className="youtube-footnote">일부 영상은 유튜브의 외부 재생 제한으로 이 화면에서 열리지 않을 수 있어요. 새 탭에서 시청할 수 있습니다. 공유한 영상·소리는 서버로 전송하거나 저장하지 않습니다.</p>
  </div>;
}
