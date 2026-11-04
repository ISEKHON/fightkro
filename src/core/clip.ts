// Rolling "last ~10 seconds" clip capture. Composites the WebGL canvas with a burned-in
// headline/score strip onto a 2D canvas and records it with two staggered MediaRecorders.
export class ClipRecorder {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  stream: MediaStream | null = null;
  recs: { rec: MediaRecorder; chunks: Blob[]; started: number }[] = [];
  active = false;
  overlay: { title: string; sub: string } = { title: '', sub: '' };
  private timer: number | null = null;
  mime = '';

  static supported() {
    return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  }

  start(src: HTMLCanvasElement) {
    if (!ClipRecorder.supported() || this.active) return;
    this.active = true;
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.stream = this.canvas.captureStream(30);
    this.mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const spawn = () => {
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(this.stream!, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 3_000_000 } : undefined);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(500);
      this.recs.push({ rec, chunks, started: performance.now() });
      if (this.recs.length > 2) {
        const old = this.recs.shift()!;
        if (old.rec.state !== 'inactive') old.rec.stop();
      }
    };
    spawn();
    this.timer = window.setInterval(spawn, 10000);
    const draw = () => {
      if (!this.active) return;
      const g = this.ctx;
      g.drawImage(src, 0, 0, this.canvas.width, this.canvas.height);
      if (this.overlay.title) {
        g.fillStyle = 'rgba(200,0,0,0.92)';
        g.fillRect(0, 470, 960, 70);
        g.fillStyle = '#fff';
        g.font = 'bold 30px Teko, Impact, sans-serif';
        g.fillText(this.overlay.title.slice(0, 70), 16, 505);
        g.font = '18px sans-serif';
        g.fillText(this.overlay.sub.slice(0, 100), 16, 530);
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(820, 8, 132, 30);
      g.fillStyle = '#ffd040';
      g.font = 'bold 20px Teko, Impact, sans-serif';
      g.fillText('KURSI KAND', 836, 30);
      requestAnimationFrame(draw);
    };
    draw();
  }

  stop() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    for (const r of this.recs) if (r.rec.state !== 'inactive') r.rec.stop();
    this.recs = [];
  }

  /** Returns the oldest running recorder's data (10-20s). */
  async grab(): Promise<Blob | null> {
    const r = this.recs[0];
    if (!r) return null;
    await new Promise<void>((res) => {
      r.rec.addEventListener('dataavailable', () => res(), { once: true });
      try {
        r.rec.requestData();
      } catch {
        res();
      }
      setTimeout(res, 600);
    });
    if (!r.chunks.length) return null;
    return new Blob(r.chunks, { type: this.mime || 'video/webm' });
  }
}

export async function shareOrDownload(blob: Blob, name: string, text: string) {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `${name}.${ext}`, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch {
      /* cancelled */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
