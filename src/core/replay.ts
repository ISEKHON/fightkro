// Replays are just the match config + the input log (deterministic sim re-creates everything).
import type { Replay } from '../game';
import { load, save } from './store';

export function rle(a: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j < a.length && a[j] === a[i] && j - i < 65535) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

export function unrle(a: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 2) for (let k = 0; k < a[i + 1]; k++) out.push(a[i]);
  return out;
}

/** split interleaved p1/p2 streams so each compresses well */
function pack(r: Replay) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < r.inputs.length; i += 2) {
    a.push(r.inputs[i]);
    b.push(r.inputs[i + 1]);
  }
  return { ...r, inputs: [], a: rle(a), b: rle(b) };
}

function unpack(p: ReturnType<typeof pack>): Replay {
  const a = unrle(p.a);
  const b = unrle(p.b);
  const inputs: number[] = [];
  for (let i = 0; i < a.length; i++) inputs.push(a[i], b[i] ?? 0);
  const { a: _a, b: _b, ...rest } = p;
  void _a;
  void _b;
  return { ...rest, inputs } as Replay;
}

const b64u = (bytes: Uint8Array) => {
  let s = '';
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function deflate(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return data;
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes);
  try {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export async function encodeReplay(r: Replay): Promise<string> {
  return b64u(await deflate(JSON.stringify(pack(r))));
}

export async function decodeReplay(code: string): Promise<Replay> {
  return unpack(JSON.parse(await inflate(unb64u(code))));
}

export function savedReplays(): { id: string; date: number; title: string; code: string }[] {
  return load('replays', [] as { id: string; date: number; title: string; code: string }[]);
}

export async function storeReplay(r: Replay, title: string) {
  const list = savedReplays();
  const code = await encodeReplay(r);
  list.unshift({ id: Math.random().toString(36).slice(2, 8), date: r.date, title, code });
  while (list.length > 15) list.pop();
  save('replays', list);
  return code;
}

export function deleteReplay(id: string) {
  save(
    'replays',
    savedReplays().filter((r) => r.id !== id),
  );
}

export { b64u, unb64u, deflate, inflate };
