export type GameMode = "menu" | "flying" | "crashed" | "practice" | "shooting-gallery";

export type ControlSource = "hand" | "keyboard" | "none";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandInputState {
  tracked: boolean;
  openHand: boolean;
  confidence: number;
  roll: number;
  pitch: number;
  fire: boolean;
  // Raw pose angles in radians before fixed-neutral shaping.
  rollAngle: number;
  pitchAngle: number;
  openScore: number;
  // Thumb-tip to index-tip gap normalized by hand width.
  thumbIndexDistance: number;
  lastSeenMs: number;
  source: "mediapipe" | "none";
}

export interface KeyboardInputState {
  rollAxis: number;
  pitchAxis: number;
  fire: boolean;
}

export interface FlightCommand {
  roll: number;
  pitch: number;
  fire: boolean;
  source: ControlSource;
  confidence: number;
}

export interface PlaneState {
  position: Vector3;
  velocity: Vector3;
  roll: number;
  pitch: number;
  yaw: number;
  speed: number;
  health: number;
  radius: number;
}

export type ObstacleType = "gate" | "tunnel" | "bridge" | "mountain";

export interface Obstacle {
  id: string;
  type: ObstacleType;
  position: Vector3;
  width: number;
  height: number;
  depth: number;
  passed: boolean;
}

export type BalloonKind = "score" | "repair";
export type BalloonMode = "none" | "obstacle-course" | "gallery";

export interface Balloon {
  id: string;
  kind: BalloonKind;
  position: Vector3;
  radius: number;
  popped: boolean;
  // Cosmetic bobbing offset so balloons don't move in lockstep.
  phase: number;
}

export interface Projectile {
  id: number;
  position: Vector3;
  velocity: Vector3;
  expiresAtMs: number;
}

export type GameEventType =
  | "shot"
  | "balloon-pop"
  | "repair"
  | "hit"
  | "explosion"
  | "pass-threaded"
  | "pass-bypassed";

// Transient happenings for the renderer and audio to react to; drained by
// the main loop every frame after consumers have seen them.
export interface GameEvent {
  type: GameEventType;
  position?: Vector3;
}

export interface CourseState {
  seed: number;
  score: number;
  nextId: number;
  nextZ: number;
  obstacles: Obstacle[];
  balloons: Balloon[];
  balloonMode: BalloonMode;
  nextBalloonSeed: number;
}

export interface GameOptions {
  targetsEnabled: boolean;
  balloonMode: BalloonMode;
}

export interface GameState {
  mode: GameMode;
  options: GameOptions;
  plane: PlaneState;
  course: CourseState;
  hand: HandInputState;
  keyboard: KeyboardInputState;
  command: FlightCommand;
  projectiles: Projectile[];
  nextProjectileId: number;
  lastFireMs: number;
  events: GameEvent[];
  elapsedMs: number;
  // elapsedMs of the most recent damaging hit; drives invulnerability,
  // camera shake, and the hit blink.
  lastHitMs: number;
  debugVisible: boolean;
  crashReason: string | null;
}
