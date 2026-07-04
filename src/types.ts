export type GameMode = "menu" | "flying" | "crashed";

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
  lastSeenMs: number;
  source: "mediapipe" | "none";
}

export interface KeyboardInputState {
  rollAxis: number;
  pitchAxis: number;
  fire: boolean;
  boost: boolean;
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

export interface CourseState {
  seed: number;
  score: number;
  nextId: number;
  nextZ: number;
  obstacles: Obstacle[];
}

export interface GameState {
  mode: GameMode;
  plane: PlaneState;
  course: CourseState;
  hand: HandInputState;
  keyboard: KeyboardInputState;
  command: FlightCommand;
  elapsedMs: number;
  debugVisible: boolean;
  crashReason: string | null;
}

