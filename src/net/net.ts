// Online transport: WebSocket to the room server for signaling / matchmaking, then a direct
// WebRTC data channel between players. If P2P fails (strict NATs) game traffic falls back to
// being relayed through the WebSocket.
export type NetMsg = Record<string, unknown> & { t: string };

export class NetClient {
  ws: WebSocket | null = null;
  pc: RTCPeerConnection | null = null;
  dc: RTCDataChannel | null = null;
  role: 'host' | 'guest' | 'spectator' | null = null;
  code = '';
  p2p = false;
  closed = false;
  handlers = new Set<(m: NetMsg) => void>();
  private pendingIce: RTCIceCandidateInit[] = [];
  rtt = 0;

  static url() {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    const custom = env?.VITE_SERVER_URL;
    if (custom) return custom.replace(/^http/, 'ws') + '/ws';
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // in dev the vite server proxies /api; the room server listens on 8787
    const host = loc.port === '5173' || loc.port === '4173' ? `${loc.hostname}:8787` : loc.host;
    return `${proto}//${host}/ws`;
  }

  on(fn: (m: NetMsg) => void) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  private emit(m: NetMsg) {
    for (const h of this.handlers) h(m);
  }

  connect(): Promise<void> {
    return new Promise((res, rej) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(NetClient.url());
      } catch (e) {
        rej(e);
        return;
      }
      this.ws = ws;
      const to = setTimeout(() => rej(new Error('Server not reachable')), 6000);
      ws.onopen = () => {
        clearTimeout(to);
        res();
      };
      ws.onerror = () => {
        clearTimeout(to);
        rej(new Error('Server not reachable'));
      };
      ws.onclose = () => {
        if (!this.closed) this.emit({ t: 'disconnected' });
      };
      ws.onmessage = (ev) => {
        let m: NetMsg;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        this.onServer(m);
      };
    });
  }

  sendServer(m: NetMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private async onServer(m: NetMsg) {
    switch (m.t) {
      case 'room':
        this.code = m.code as string;
        this.emit(m);
        break;
      case 'peer':
        this.role = m.role as 'host' | 'guest';
        this.emit(m);
        this.startRtc(this.role === 'host');
        break;
      case 'signal':
        await this.onSignal(m.data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit });
        break;
      case 'relay':
        this.emit(m.data as NetMsg);
        break;
      default:
        this.emit(m);
    }
  }

  host(extra: Record<string, unknown> = {}) {
    this.sendServer({ t: 'host', ...extra });
  }
  join(code: string) {
    this.code = code.toUpperCase();
    this.sendServer({ t: 'join', code: this.code });
  }
  spectate(code: string) {
    this.role = 'spectator';
    this.sendServer({ t: 'spectate', code: code.toUpperCase() });
  }
  queue(id: string, rating: number, name: string) {
    this.sendServer({ t: 'queue', id, rating, name });
  }

  private async startRtc(initiator: boolean) {
    if (typeof RTCPeerConnection === 'undefined') return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendServer({ t: 'signal', data: { ice: e.candidate.toJSON() } });
    };
    const setup = (dc: RTCDataChannel) => {
      this.dc = dc;
      dc.onopen = () => {
        this.p2p = true;
        this.emit({ t: 'p2p' });
      };
      dc.onclose = () => {
        this.p2p = false;
      };
      dc.onmessage = (ev) => {
        try {
          this.emit(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
    };
    if (initiator) {
      setup(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendServer({ t: 'signal', data: { sdp: pc.localDescription!.toJSON() } });
    } else {
      pc.ondatachannel = (e) => setup(e.channel);
    }
  }

  private async onSignal(d: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        for (const c of this.pendingIce) await pc.addIceCandidate(c);
        this.pendingIce = [];
        if (d.sdp.type === 'offer') {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          this.sendServer({ t: 'signal', data: { sdp: pc.localDescription!.toJSON() } });
        }
      } else if (d.ice) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.ice);
        else this.pendingIce.push(d.ice);
      }
    } catch {
      /* signaling glitch: relay fallback still works */
    }
  }

  /** Game message to the other player: P2P when available, otherwise relayed. */
  send(m: NetMsg) {
    const s = JSON.stringify(m);
    if (this.dc && this.dc.readyState === 'open') this.dc.send(s);
    else this.sendServer({ t: 'relay', data: m });
  }

  close() {
    this.closed = true;
    try {
      this.dc?.close();
      this.pc?.close();
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
