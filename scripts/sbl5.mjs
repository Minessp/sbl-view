/**
 * Pacote SBL5 do corpo anatômico: malhas quantizadas + pesos de skinning + atributos de músculo.
 *
 * Formato (little-endian): "SBL5" | u32 versão (1) | u32 tamanho do JSON | JSON (preenchido até 4 bytes) | blocos.
 * Cada bloco é codificado com o codec do meshoptimizer e alinhado a 4 bytes. Por parte:
 *   positions  Int16×4 (stride 8; o 4º é preenchimento). Posição = offset + q / 32767 × scale.
 *   indices    u32 (codec de índices).
 *   skin       u8×8 (stride 8): 4 índices de junta (em header.joints) + 4 pesos que somam 255.
 *   attr       u8×4 (stride 4), só músculo e tendão: t ao longo da linha central (0 = origem, 255 = inserção)
 *              + vetor radial Int8×3 (do ponto da linha central ao vértice, ÷ rmax × 127).
 * Parte com `mirror` gera o lado esquerdo no navegador: x → −x, juntas _r ↔ _l, ordem dos triângulos invertida.
 */
import { MeshoptEncoder } from 'meshoptimizer';

const pad4 = (n) => (n + 3) & ~3;

/**
 * @param {{ header: object, parts: { meta: object, q: Int16Array, idx: Uint32Array, skin: Uint8Array,
 *   muscle?: Uint8Array }[] }} input  q = Int16×3 por vértice; skin = u8×8; muscle = u8×4.
 * @returns {Promise<Uint8Array>}
 */
export async function packSBL5({ header, parts }) {
  await MeshoptEncoder.ready;
  const out = { ...header, version: 1, parts: [] };
  const chunks = [];
  let cursor = 0;
  const push = (bytes) => {
    const at = cursor;
    chunks.push([bytes, pad4(bytes.length)]);
    cursor += pad4(bytes.length);
    return [at, bytes.length];
  };
  for (const p of parts) {
    const idx = new Uint32Array(p.idx);
    const n = p.q.length / 3;
    const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
    const v4 = new Int16Array(unique * 4);
    const sk = new Uint8Array(unique * 8);
    const mu = p.muscle ? new Uint8Array(unique * 4) : null;
    for (let i = 0; i < n; i++) {
      const j = remap[i];
      if (j === 0xffffffff) continue;
      v4.set(p.q.subarray(i * 3, i * 3 + 3), j * 4);
      sk.set(p.skin.subarray(i * 8, i * 8 + 8), j * 8);
      if (mu && p.muscle) mu.set(p.muscle.subarray(i * 4, i * 4 + 4), j * 4);
    }
    const [positions, positionsBytes] = push(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(v4.buffer), unique, 8));
    const [indices, indicesBytes] = push(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4));
    const [skin, skinBytes] = push(MeshoptEncoder.encodeVertexBuffer(sk, unique, 8));
    const blocks = { positions, positionsBytes, indices, indicesBytes, skin, skinBytes };
    if (mu) {
      const [attr, attrBytes] = push(MeshoptEncoder.encodeVertexBuffer(mu, unique, 4));
      Object.assign(blocks, { attr, attrBytes });
    }
    out.parts.push({ ...p.meta, vertexCount: unique, indexCount: idx.length, ...blocks });
  }
  const json = new TextEncoder().encode(JSON.stringify(out));
  const jsonLen = pad4(json.length);
  const buf = new Uint8Array(12 + jsonLen + cursor);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode('SBL5'), 0);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, jsonLen, true);
  buf.set(json, 12);
  buf.fill(0x20, 12 + json.length, 12 + jsonLen);
  let at = 12 + jsonLen;
  for (const [c, size] of chunks) {
    buf.set(c, at);
    at += size;
  }
  return buf;
}
