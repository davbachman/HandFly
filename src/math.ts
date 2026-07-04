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

export function normalizeLineAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI / 2) wrapped -= Math.PI;
  while (wrapped < -Math.PI / 2) wrapped += Math.PI;
  return wrapped;
}

