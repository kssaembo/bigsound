export interface YouTubeVideo { id: string; start: number; watchUrl: string; embedUrl: string }

function seconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Math.min(86400, Number(value));
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return 0;
  return Math.min(86400, Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0));
}

export function parseYouTubeLink(input: string): YouTubeVideo | null {
  try {
    let text = input.trim();
    if (/^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(text)) text = `https://${text}`;
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = path.length === 1 ? path[0] : null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(path[0]) && path.length === 2) id = path[1];
    }
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;
    const start = seconds(url.searchParams.get('t') || url.searchParams.get('start') || url.hash.match(/(?:^#|[&?])t=([^&]+)/)?.[1] || null);
    const watch = new URL('https://www.youtube.com/watch'); watch.searchParams.set('v', id);
    if (start) watch.searchParams.set('t', `${start}s`);
    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    embed.searchParams.set('playsinline', '1');
    if (start) embed.searchParams.set('start', String(start));
    return { id, start, watchUrl: watch.href, embedUrl: embed.href };
  } catch { return null; }
}

export function tabCaptureSupport(): { supported: boolean; reason: string } {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (mobile) return { supported: false, reason: '모바일·태블릿의 유튜브는 일반 재생만 지원합니다. 파일 증폭은 그대로 사용할 수 있어요.' };
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) return { supported: false, reason: '탭 소리 증폭은 HTTPS 환경의 PC Chrome·Edge에서 이용해 주세요.' };
  // Suppression is required so the original tab and boosted output do not play twice.
  const constraints = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { suppressLocalAudioPlayback?: boolean };
  if (!constraints.suppressLocalAudioPlayback) return { supported: false, reason: '이 브라우저는 원본 탭 소리의 중복 재생 방지를 지원하지 않습니다. 최신 PC Chrome·Edge에서 이용해 주세요.' };
  return { supported: true, reason: '' };
}
