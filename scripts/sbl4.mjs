/**
 * Pacote SBL4 da malha anatômica: mesmo cabeçalho do SBL3, dados com o codec do meshoptimizer
 * (vértices reordenados para o cache, índices e posições comprimidos). 865 KB → ~340 KB.
 *
 * Formato (little-endian): "SBL4" | u32 versão (1) | u32 tamanho do JSON | JSON (preenchido até 4 bytes)
 * | por parte: vértices codificados (Int16×4, stride 8) e índices codificados (u32), cada bloco alinhado a 4.
 * Posição em metros = offset + q / 32767 × scale.
 */
import { MeshoptEncoder } from 'meshoptimizer';

const pad4 = (n) => (n + 3) & ~3;

/**
 * @param {{ offset: number[], scale: number[], parts: { key: string, kind: string, muscleId?: string,
 *   mirror: boolean, q: Int16Array, idx: Uint32Array }[] }} input  q = Int16×3 por vértice.
 * @returns {Promise<{ buf: Uint8Array, header: object }>}
 */
export async function packSBL4({ offset, scale, parts }) {
  await MeshoptEncoder.ready;
  const header = { version: 1, offset, scale, parts: [] };
  const chunks = [];
  let cursor = 0;
  for (const p of parts) {
    const idx = new Uint32Array(p.idx);
    const n = p.q.length / 3;
    // Reordena vértices pela ordem de uso: melhora muito a compressão das duas correntes.
    const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
    const v4 = new Int16Array(unique * 4);
    for (let i = 0; i < n; i++) {
      const j = remap[i];
      if (j === 0xffffffff) continue;
      v4[j * 4] = p.q[i * 3];
      v4[j * 4 + 1] = p.q[i * 3 + 1];
      v4[j * 4 + 2] = p.q[i * 3 + 2];
    }
    const ev = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(v4.buffer), unique, 8);
    const ei = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4);
    header.parts.push({
      key: p.key,
      kind: p.kind,
      ...(p.muscleId && { muscleId: p.muscleId }),
      mirror: p.mirror,
      vertexCount: unique,
      indexCount: idx.length,
      positions: cursor,
      positionsBytes: ev.length,
      indices: cursor + pad4(ev.length),
      indicesBytes: ei.length,
    });
    chunks.push([ev, pad4(ev.length)], [ei, pad4(ei.length)]);
    cursor += pad4(ev.length) + pad4(ei.length);
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const jsonLen = pad4(json.length);
  const buf = new Uint8Array(12 + jsonLen + cursor);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode('SBL4'), 0);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, jsonLen, true);
  buf.set(json, 12);
  buf.fill(0x20, 12 + json.length, 12 + jsonLen);
  let at = 12 + jsonLen;
  for (const [c, size] of chunks) {
    buf.set(c, at);
    at += size;
  }
  return { buf, header };
}
