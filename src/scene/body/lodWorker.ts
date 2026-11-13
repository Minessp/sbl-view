/**
 * Worker da troca de nível: baixa o pacote, decodifica e funde as camadas fora da thread da página (o nível ultra
 * tem milhões de vértices). Devolve os arrays transferidos, sem cópia.
 */
import { parseAnatomyPack } from '../anatomy/pack';
import { buildBodyGeometryData, geometryBuffers, slotSignature, type BodyGeometryData } from './geometryData';

export type LodRequest = { url: string };
export type LodReply = { ok: true; signature: string; data: BodyGeometryData } | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<LodRequest>) => {
  try {
    const r = await fetch(e.data.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const pack = await parseAnatomyPack(await r.arrayBuffer());
    const data = buildBodyGeometryData(pack);
    const reply: LodReply = { ok: true, signature: slotSignature(pack), data };
    self.postMessage(reply, { transfer: geometryBuffers(data) });
  } catch (err) {
    const reply: LodReply = { ok: false, error: String(err) };
    self.postMessage(reply);
  }
};
