import "./styles.css";
import { createGameState, renderGameStateToText } from "./game/stateText";
import { resetGameState, stepGame } from "./game/simulation";
import { createHandTracker } from "./input/handTracker";
import { createKeyboardController } from "./input/keyboard";
import { createHandFlyScene } from "./render/scene";
import type { GameState } from "./types";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    setRealtime?: (enabled: boolean) => void;
    handFlyState?: GameState;
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`HandFly DOM is missing ${selector}`);
  }
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#game-canvas");
const video = requiredElement<HTMLVideoElement>("#camera-feed");
const debugCanvas = requiredElement<HTMLCanvasElement>("#debug-canvas");
const hud = requiredElement<HTMLDivElement>("#hud");
const menu = requiredElement<HTMLDivElement>("#menu");
const startButton = requiredElement<HTMLButtonElement>("#start-btn");

const state = createGameState();
const keyboard = createKeyboardController();
const tracker = createHandTracker(video, debugCanvas);
const flyScene = await createHandFlyScene(canvas);
let cameraStarted = false;
let lastTime = performance.now();
let deterministicMode = false;
// Test hook: when false, the rAF loop stops stepping the simulation so
// advanceTime() drives it exclusively and runs are reproducible.
let realtimeEnabled = true;

window.handFlyState = state;
window.render_game_to_text = () => renderGameStateToText(state);

function syncInputs(nowMs: number): void {
  tracker.update(nowMs, state.debugVisible);
  state.hand = { ...tracker.state };
  state.keyboard = { ...keyboard.state };
}

function updateHud(): void {
  const trackingText = state.command.source === "hand" ? "HAND" : state.command.source === "keyboard" ? "KEYS" : "NEUTRAL";
  const distance = Math.max(0, Math.round(-state.plane.position.z));
  hud.innerHTML = `
    <div class="hud-row">
      <span class="hud-pill">${trackingText}</span>
      <span>Score ${state.course.score}</span>
      <span>Dist ${distance}m</span>
      <span>Alt ${Math.round(state.plane.position.y)}</span>
      <span>Speed ${Math.round(state.plane.speed)}${state.command.boost ? " BOOST" : ""}</span>
    </div>
    <div class="hud-row subtle">
      <span>${tracker.status}</span>
      <span>${state.debugVisible ? "H hide debug · C recalibrate" : "H camera debug · Shift boost"}</span>
    </div>
  `;
  document.body.classList.toggle("debug-visible", state.debugVisible);
  document.body.classList.toggle("crashed", state.mode === "crashed");
  menu.classList.toggle("hidden", state.mode === "flying");
  if (state.mode === "crashed") {
    startButton.textContent = "Restart Flight";
    const panelText = menu.querySelector("p");
    if (panelText) panelText.textContent = `${state.crashReason ?? "You clipped the course."} Score ${state.course.score}, distance ${Math.max(0, Math.round(-state.plane.position.z))}m. Press Enter or the button to fly again.`;
  }
}

function updateFrame(dt: number, nowMs: number): void {
  syncInputs(nowMs);
  stepGame(state, dt);
  flyScene.update(state, dt);
  flyScene.render();
  updateHud();
}

window.advanceTime = (ms: number): void => {
  deterministicMode = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    updateFrame(1 / 60, performance.now() + i * (1000 / 60));
  }
};

window.setRealtime = (enabled: boolean): void => {
  realtimeEnabled = enabled;
};

function animate(nowMs: number): void {
  if (realtimeEnabled && !deterministicMode) {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
    updateFrame(dt, nowMs);
  }
  deterministicMode = false;
  lastTime = nowMs;
  requestAnimationFrame(animate);
}

async function startFlight(): Promise<void> {
  if (state.mode === "crashed") {
    resetGameState(state, createGameState());
  }
  state.mode = "flying";
  state.crashReason = null;
  menu.classList.add("hidden");
  if (!cameraStarted) {
    cameraStarted = true;
    void tracker.initialize();
  }
}

startButton.addEventListener("click", () => {
  void startFlight();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyH") {
    state.debugVisible = !state.debugVisible;
  }
  if (event.code === "KeyC") {
    tracker.recalibrate();
  }
  if (event.code === "KeyF") {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }
  if (event.code === "Enter" && state.mode !== "flying") {
    void startFlight();
  }
});

window.addEventListener("resize", () => flyScene.resize());
window.addEventListener("beforeunload", () => {
  keyboard.dispose();
  tracker.dispose();
  flyScene.dispose();
});

flyScene.update(state, 1 / 60);
flyScene.render();
updateHud();
requestAnimationFrame(animate);
