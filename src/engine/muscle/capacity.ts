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
