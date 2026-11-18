export const BURST_DOTS = 7;

export function burstVectors(count = BURST_DOTS, distance = 20): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((-90 + (index * 360) / count) * Math.PI) / 180;
    return {
      x: Math.round(Math.cos(angle) * distance * 10) / 10,
      y: Math.round(Math.sin(angle) * distance * 10) / 10,
    };
  });
}
