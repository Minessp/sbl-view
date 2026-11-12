import type { LayerId } from './timeline';

/** Chamadas por camada. `target` = chave de parte muscular (lado direito) ou ponto de osso. */
export interface CalloutDef {
  id: string;
  layer: LayerId;
  label: string;
  latin?: string;
  target: { kind: 'muscle'; key: string } | { kind: 'bone'; segment: string; at: number };
}

export const CALLOUTS: CalloutDef[] = [
  { id: 'c-pec', layer: 'superficial', label: 'Peitoral maior', latin: 'Pectoralis major', target: { kind: 'muscle', key: 'pectoralis_major_stern_r' } },
  { id: 'c-delt', layer: 'superficial', label: 'Deltoide', latin: 'Deltoideus', target: { kind: 'muscle', key: 'deltoid_lat_r' } },
  { id: 'c-rect', layer: 'superficial', label: 'Reto do abdome', latin: 'Rectus abdominis', target: { kind: 'muscle', key: 'rectus_abdominis_r' } },
  { id: 'c-vl', layer: 'superficial', label: 'Vasto lateral', latin: 'Vastus lateralis', target: { kind: 'muscle', key: 'vastus_lateralis_r' } },
  { id: 'c-ta', layer: 'superficial', label: 'Tibial anterior', latin: 'Tibialis anterior', target: { kind: 'muscle', key: 'tibialis_anterior_r' } },

  { id: 'c-brach', layer: 'deep', label: 'Braquial', latin: 'Brachialis', target: { kind: 'muscle', key: 'brachialis_r' } },
  { id: 'c-gmed', layer: 'deep', label: 'Glúteo médio', latin: 'Gluteus medius', target: { kind: 'muscle', key: 'gluteus_medius_r' } },
  { id: 'c-vi', layer: 'deep', label: 'Vasto intermédio', latin: 'Vastus intermedius', target: { kind: 'muscle', key: 'vastus_intermedius_r' } },
  { id: 'c-sol', layer: 'deep', label: 'Sóleo', latin: 'Soleus', target: { kind: 'muscle', key: 'soleus_r' } },

  { id: 'c-hum', layer: 'bone', label: 'Úmero', latin: 'Humerus', target: { kind: 'bone', segment: 'upperarm_r', at: 0.45 } },
  { id: 'c-pel', layer: 'bone', label: 'Pelve', latin: 'Pelvis', target: { kind: 'bone', segment: 'pelvis', at: 0.2 } },
  { id: 'c-fem', layer: 'bone', label: 'Fêmur', latin: 'Femur', target: { kind: 'bone', segment: 'thigh_r', at: 0.5 } },
  { id: 'c-tib', layer: 'bone', label: 'Tíbia', latin: 'Tibia', target: { kind: 'bone', segment: 'shank_r', at: 0.45 } },
];
