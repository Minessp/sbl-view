/**
 * Caminhos do motor resolvidos a partir da linha central das malhas (`muscle-paths.json`, gerado pelo pacote).
 * Fica fora de `index.ts` para a shell não carregar os 70 KB das linhas centrais.
 */
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { resolveMuscleParts, type Centerline } from '@/engine/muscle/resolve';
import { muscleDefs, skeletonDef } from './index';
import pathsJson from './muscle-paths.json';

export const centerlines = pathsJson.parts as unknown as Readonly<Record<string, Centerline>>;
export const musclePathDefs = resolveMuscleParts(muscleDefs, centerlines, buildSkeleton(skeletonDef));
