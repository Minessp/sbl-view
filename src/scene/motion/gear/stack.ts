/**
 * Pilha de pesos entre duas guias, da base à travessa: o pino escolhe a placa, dela para cima tudo sobe junto, as de baixo
 * ficam no batente. Capa atrás (+Z local) com montantes; o pino sai pela frente (−Z local). Usada pela coluna da polia e
 * pelas máquinas de pilha.
 */
import { Group, type Object3D } from 'three';
import type { GearKit } from './kit';
import { ball, padGeometry, rod } from './parts';

const PLATES = 12;
const PIN = 7;
const plateY = (i: number) => 0.07 + i * 0.026;

export interface WeightStack {
  /** Base da pilha (posicionar e girar no pai). */
  readonly root: Group;
  /** Altura local do topo da pilha parada (onde o cabo ou a haste prende). */
  readonly top: number;
  /** Sobe a parte presa no pino (m, a partir do batente). */
  lift(m: number): void;
}

export function weightStack(kit: GearKit, parent: Object3D, guideTop: number): WeightStack {
  const root = new Group();
  parent.add(root);
  for (const x of [-0.1, 0.1]) {
    const guide = kit.mesh(kit.geo(rod(0.008, guideTop - 0.04, 12)), kit.mat('chrome'), root);
    guide.position.set(x, (guideTop + 0.04) / 2, 0);
  }
  const yoke = kit.mesh(kit.geo(padGeometry(0.32, 0.04, 0.05, 0.008)), kit.mat('steel'), root);
  yoke.position.set(0, guideTop, 0);
  for (let i = 0; i < PIN; i++) kit.mesh(kit.geo(padGeometry(0.24, 0.022, 0.11, 0.004)), kit.mat('iron'), root).position.y = plateY(i);
  const moving = new Group();
  root.add(moving);
  for (let i = PIN; i < PLATES; i++) kit.mesh(kit.geo(padGeometry(0.24, 0.022, 0.11, 0.004)), kit.mat('iron'), moving).position.y = plateY(i);
  kit.mesh(kit.geo(padGeometry(0.24, 0.03, 0.11, 0.006)), kit.mat('chrome'), moving).position.y = plateY(PLATES) + 0.004;
  kit.mesh(kit.geo(rod(0.007, 0.36, 10)), kit.mat('chrome'), moving).position.y = plateY(PLATES) - 0.17;
  const pin = kit.mesh(kit.geo(rod(0.006, 0.1, 10)), kit.mat('chrome'), moving);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0, plateY(PIN), -0.06);
  kit.mesh(kit.geo(ball(0.012)), kit.mat('rubber'), moving).position.set(0, plateY(PIN), -0.11);
  // Capa atrás da pilha e montantes laterais do chão à travessa (a pilha segue à vista pelos lados).
  kit.mesh(kit.geo(padGeometry(0.3, guideTop, 0.012, 0.004)), kit.mat('steel'), root).position.set(0, guideTop / 2, 0.12);
  for (const x of [-0.15, 0.15]) kit.mesh(kit.geo(padGeometry(0.03, guideTop, 0.03, 0.006)), kit.mat('steel'), root).position.set(x, guideTop / 2, 0.11);
  kit.mesh(kit.geo(padGeometry(0.26, 0.05, 0.13, 0.01)), kit.mat('rubber'), root).position.set(0, 0.045, 0);
  return {
    root,
    top: plateY(PLATES) + 0.02,
    lift: (m) => {
      moving.position.y = m;
    },
  };
}
