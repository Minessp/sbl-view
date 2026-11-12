/**
 * Capacidade relativa de torque por ângulo (0..1): sino sobre um piso.
 * Forma ilustrativa; os dados dizem onde fica o pico e com que confiança.
 */
export interface CapacityShape {
  readonly peakDeg: number;
  readonly widthDeg: number;
  readonly floor: number;
}

export function relativeCapacity(shape: CapacityShape, angleDeg: number): number {
  const z = (angleDeg - shape.peakDeg) / shape.widthDeg;
  return shape.floor + (1 - shape.floor) * Math.exp(-z * z);
}

/**
 * Esforço relativo: demanda normalizada pela maior demanda de referência, dividida pela capacidade
 * no ângulo. 1 = o ponto mais difícil da referência. Índice comparativo, não porcentagem de força máxima.
 */
export function relativeEffort(moment: number, referenceMoment: number, capacity: number): number {
  if (referenceMoment <= 0 || capacity <= 0) return 0;
  return Math.max(0, moment) / referenceMoment / capacity;
}
