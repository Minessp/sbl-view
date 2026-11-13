/**
 * Unidade de carga. O banco guarda sempre kg; a tela mostra e lê na unidade escolhida.
 * Preferências (unidade, perfis de equipamento) moram no IndexedDB e são lidas uma vez por página.
 */
import { useSyncExternalStore } from 'react';
import { fmt } from '@/i18n/app';
import { repository } from '@/storage/db';
import type { EquipmentProfile, Unit } from '@/storage/types';

/** Libra internacional, exata. */
export const KG_PER_LB = 0.45359237;
export const toKg = (v: number, unit: Unit): number => (unit === 'kg' ? v : v * KG_PER_LB);
/** kg → unidade, com 2 casas (o suficiente para a volta lb → kg → lb ser exata na tela). */
export const fromKg = (kg: number, unit: Unit): number => (unit === 'kg' ? kg : Math.round((kg / KG_PER_LB) * 100) / 100);
export const fmtLoad = (kg: number, unit: Unit): string => `${fmt.n1(fromKg(kg, unit))} ${unit}`;

interface Prefs {
  unit: Unit;
  profiles: EquipmentProfile[];
}
let prefs: Prefs = { unit: 'kg', profiles: [] };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Relê do banco (depois de importar backup ou apagar tudo). */
export function reloadPrefs(): Promise<void> {
  loading = (async () => {
    try {
      const r = repository();
      const [unit, profiles] = await Promise.all([r.getSetting('unit'), r.getSetting('profiles')]);
      prefs = { unit: unit ?? 'kg', profiles: profiles ?? [] };
    } catch {
      prefs = { unit: 'kg', profiles: [] };
    }
    emit();
  })();
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loading) void reloadPrefs();
  return () => listeners.delete(l);
}

export const usePrefs = (): Prefs => useSyncExternalStore(subscribe, () => prefs);
export const useUnit = (): Unit => usePrefs().unit;

export async function setUnit(unit: Unit): Promise<void> {
  prefs = { ...prefs, unit };
  emit();
  await repository().putSetting('unit', unit);
}

export async function setProfiles(profiles: EquipmentProfile[]): Promise<void> {
  prefs = { ...prefs, profiles };
  emit();
  await repository().putSetting('profiles', profiles);
}
