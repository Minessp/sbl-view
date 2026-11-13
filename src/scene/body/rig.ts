/**
 * Luz do estúdio, compartilhada por todos os materiais do palco (corpo, equipamento, sombra).
 * Os uniforms são objetos únicos: mudar aqui muda em todas as vistas sem reconstruir material.
 *
 * - key: tungstênio, de cima e da esquerda da câmera; segue o ponteiro de leve (só ponteiro fino, sem redução de movimento).
 * - contraluz: fria, de trás; separa o corpo do fundo escuro.
 * - ambiente: hemisfério (céu frio, chão = poça de luz).
 * - uLight: 0..1, a luz "acende" quando a cena fica pronta (contraluz primeiro, depois a key).
 * - uPulseStart: instante do último destaque novo; um brilho percorre o músculo da origem à inserção.
 */
import { Vector3 } from 'three';
import { createPalette, readPalette, type Palette } from '../palette';

export const KEY_BASE = new Vector3(-0.5, 0.62, 0.6).normalize();

export const palette: Palette = createPalette();

export const rig = {
  uKeyDir: { value: KEY_BASE.clone() },
  uKeyColor: { value: new Vector3(1, 0.95, 0.88) },
  uRimColor: { value: new Vector3(0.62, 0.8, 0.94) },
  uGlow: { value: new Vector3(0.97, 0.71, 0.36) },
  /** Alongar (aço): cor do músculo que fica mais comprido que em pé. */
  uStretch: { value: new Vector3(0.42, 0.77, 0.95) },
  uTendon: { value: new Vector3(0.9, 0.87, 0.8) },
  uSky: { value: new Vector3(0.2, 0.24, 0.3) },
  uGround: { value: new Vector3(0.12, 0.13, 0.15) },
  uShadow: { value: new Vector3(0, 0, 0) },
  uLight: { value: 0 },
  uTime: { value: 0 },
  uPulseStart: { value: -99 },
  /** Claro: um pouco menos de exposição (o fundo já é claro e a pele estouraria). */
  uExposure: { value: 1 },
  /** Luz de ambiente (hemisfério): menor no claro, onde o céu já é claro. */
  uAmbient: { value: 0.7 },
};

export type Rig = typeof rig;

/** Duração do brilho que percorre o músculo (duas passadas). */
export const PULSE_SECONDS = 2.4;

/** Relê as cores do CSS (tema) e deriva o ambiente. */
export function refreshPalette() {
  readPalette(palette);
  rig.uKeyColor.value.copy(palette['light-key']);
  rig.uRimColor.value.copy(palette['light-rim']);
  rig.uGlow.value.copy(palette.glow);
  rig.uStretch.value.copy(palette.stretch);
  rig.uTendon.value.copy(palette['body-tendon']);
  rig.uSky.value.copy(palette['bg-2']).lerp(palette['light-rim'], 0.35);
  rig.uGround.value.copy(palette.floor).lerp(palette['light-key'], 0.08);
  const light = palette.bg.x + palette.bg.y + palette.bg.z > 1.5;
  rig.uShadow.value.copy(palette.bg).multiplyScalar(light ? 0.35 : 0);
  rig.uExposure.value = light ? 0.9 : 1.0;
  rig.uAmbient.value = light ? 0.42 : 0.7;
}

/** Marca um destaque novo: o brilho volta a percorrer o músculo. */
export function pulse() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  rig.uPulseStart.value = rig.uTime.value;
}
