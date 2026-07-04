export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * clamp(alpha, 0, 1);
}

export function damp(current: number, target: number, stiffness: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-stiffness * dt));
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function distance2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalizeLineAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI / 2) wrapped -= Math.PI;
  while (wrapped < -Math.PI / 2) wrapped += Math.PI;
  return wrapped;
}

// Circular mean of two undirected line angles (period pi), so signals that
// straddle the +-pi/2 wrap point still average correctly.
export function meanLineAngle(a: number, b: number, weightA = 0.5): number {
  const weightB = 1 - weightA;
  const y = weightA * Math.sin(2 * a) + weightB * Math.sin(2 * b);
  const x = weightA * Math.cos(2 * a) + weightB * Math.cos(2 * b);
  return Math.atan2(y, x) / 2;
}

