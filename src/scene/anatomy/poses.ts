/**
 * Poses de referência do pipeline anatômico (graus). As duas primeiras são o critério de deformação do pacote:
 * o corpo inteiro não pode rasgar em agachamento fundo nem com o braço acima da cabeça.
 *
 * Braço acima da cabeça pelo plano frontal: a cintura escapular gira em torno de Z (frontal), o que compõe com
 * a abdução. Flexão grande com a cintura elevada cruza o braço na frente do rosto, porque os DOFs do ombro
 * ficam no frame da escápula. O ritmo escapuloumeral fica no motor de movimento.
 */
import { bilateral } from '@/engine/kinematics/skeleton';

export interface ReferencePose {
  readonly id: string;
  readonly label: string;
  readonly deg: Readonly<Record<string, number>>;
}

export const REFERENCE_POSES: readonly ReferencePose[] = [
  { id: 'neutral', label: 'Neutra', deg: {} },
  {
    id: 'deep_squat',
    label: 'Agachamento fundo',
    deg: { ...bilateral({ hip_flex: 120, knee_flex: 150, ankle_dorsi: 35, hip_abd: 15, hip_rot: -15 }), lumbar_flex: 20, thorax_flex: 10, neck_flex: -20 },
  },
  {
    id: 'overhead',
    label: 'Braço acima da cabeça',
    deg: { clav_elev_r: 30, scap_uprot_r: 30, shoulder_abd_r: 120, shoulder_flex_r: 10, elbow_flex_r: 10 },
  },
  {
    id: 'squat_overhead',
    label: 'Agachamento com braços acima da cabeça',
    deg: {
      ...bilateral({ hip_flex: 115, knee_flex: 140, ankle_dorsi: 30, hip_abd: 15, clav_elev: 30, scap_uprot: 30, shoulder_abd: 115, shoulder_flex: 15 }),
      lumbar_flex: 10,
    },
  },
  {
    id: 'curl',
    label: 'Rosca, cotovelo fletido e punho supinado',
    deg: { ...bilateral({ elbow_flex: 145, forearm_pro: 10, wrist_flex: 30, shoulder_flex: 20 }) },
  },
];
