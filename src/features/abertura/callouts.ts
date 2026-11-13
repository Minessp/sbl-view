import type { LayerId } from './timeline';

/** Chamadas por camada. `target` = malha do pacote anatômico (lado direito) ou ponto de osso. */
export interface CalloutDef {
  id: string;
  layer: LayerId;
  label: string;
  latin?: string;
  target: { kind: 'muscle'; mesh: string } | { kind: 'bone'; segment: string; at: number };
}

export const CALLOUTS: CalloutDef[] = [
  { id: 'c-pec', layer: 'superficial', label: 'Peitoral maior', latin: 'Pectoralis major', target: { kind: 'muscle', mesh: 'pectoralis_major_sternocostal' } },
  { id: 'c-delt', layer: 'superficial', label: 'Deltoide', latin: 'Deltoideus', target: { kind: 'muscle', mesh: 'deltoid_lateral' } },
  { id: 'c-rect', layer: 'superficial', label: 'Reto do abdome', latin: 'Rectus abdominis', target: { kind: 'muscle', mesh: 'rectus_abdominis' } },
  { id: 'c-vl', layer: 'superficial', label: 'Vasto lateral', latin: 'Vastus lateralis', target: { kind: 'muscle', mesh: 'vastus_lateralis' } },
  { id: 'c-ta', layer: 'superficial', label: 'Tibial anterior', latin: 'Tibialis anterior', target: { kind: 'muscle', mesh: 'tibialis_anterior' } },

  { id: 'c-pmin', layer: 'deep', label: 'Peitoral menor', latin: 'Pectoralis minor', target: { kind: 'muscle', mesh: 'pectoralis_minor' } },
  { id: 'c-ili', layer: 'deep', label: 'Ilíaco', latin: 'Iliacus', target: { kind: 'muscle', mesh: 'iliacus' } },
  { id: 'c-vi', layer: 'deep', label: 'Vasto intermédio', latin: 'Vastus intermedius', target: { kind: 'muscle', mesh: 'vastus_intermedius' } },
  { id: 'c-add', layer: 'deep', label: 'Adutor curto', latin: 'Adductor brevis', target: { kind: 'muscle', mesh: 'adductor_brevis' } },

  { id: 'c-hum', layer: 'bone', label: 'Úmero', latin: 'Humerus', target: { kind: 'bone', segment: 'upperarm_r', at: 0.45 } },
  { id: 'c-pel', layer: 'bone', label: 'Pelve', latin: 'Pelvis', target: { kind: 'bone', segment: 'pelvis', at: 0.2 } },
  { id: 'c-fem', layer: 'bone', label: 'Fêmur', latin: 'Femur', target: { kind: 'bone', segment: 'thigh_r', at: 0.5 } },
  { id: 'c-tib', layer: 'bone', label: 'Tíbia', latin: 'Tibia', target: { kind: 'bone', segment: 'shank_r', at: 0.45 } },
];
