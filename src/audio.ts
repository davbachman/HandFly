import type { GameState } from "./types";

// All sound is synthesized with the Web Audio API - no assets to load. The
// context is created on the first user gesture (browser autoplay policy);
// until then update() is a no-op.

export interface GameAudio {
  unlock: () => void;
  update: (state: GameState) => void;
  toggleMuted: () => boolean;
  readonly muted: boolean;
}

export function createGameAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let engineGain: GainNode | null = null;
  let engineOscA: OscillatorNode | null = null;
  let engineOscB: OscillatorNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let muted = false;

  const unlock = (): void => {
    try {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);

        // Engine drone: two detuned saws through a lowpass, pitch follows speed.
        const engineFilter = ctx.createBiquadFilter();
        engineFilter.type = "lowpass";
        engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOscA = ctx.createOscillator();
        engineOscA.type = "sawtooth";
        engineOscB = ctx.createOscillator();
        engineOscB.type = "sawtooth";
        engineOscA.connect(engineFilter);
        engineOscB.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOscA.start();
        engineOscB.start();

        // One second of white noise for percussive one-shots.
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) {
          channel[i] = Math.random() * 2 - 1;
        }
      }
      void ctx.resume();
    } catch {
      ctx = null;
    }
  };

  const tone = (
    type: OscillatorType,
    startHz: number,
    endHz: number,
    duration: number,
    gainValue: number,
    delay = 0,
  ): void => {
    if (!ctx || !master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  const noise = (duration: number, gainValue: number, filterHz: number, filterEndHz?: number): void => {
    if (!ctx || !master || !noiseBuffer) return;
    const start = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterHz, start);
    if (filterEndHz) {
      filter.frequency.exponentialRampToValueAtTime(filterEndHz, start + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start, Math.random() * 0.5, duration + 0.05);
  };

  const update = (state: GameState): void => {
    if (!ctx || !master || !engineGain || !engineOscA || !engineOscB) return;
    const now = ctx.currentTime;

    const engineHz = 58 + state.plane.speed * 0.55;
    engineOscA.frequency.setTargetAtTime(engineHz, now, 0.08);
    engineOscB.frequency.setTargetAtTime(engineHz * 1.011, now, 0.08);
    engineGain.gain.setTargetAtTime(state.mode === "flying" ? 0.13 : 0.03, now, 0.2);

    for (const event of state.events) {
      switch (event.type) {
        case "shot":
          tone("square", 720, 240, 0.09, 0.09);
          break;
        case "balloon-pop":
          noise(0.09, 0.28, 2600);
          tone("sine", 1320, 1760, 0.14, 0.1);
          break;
        case "repair":
          tone("sine", 660, 660, 0.09, 0.1);
          tone("sine", 990, 990, 0.14, 0.1, 0.09);
          break;
        case "hit":
          tone("sine", 110, 55, 0.28, 0.4);
          noise(0.18, 0.3, 500);
          break;
        case "explosion":
          noise(1.1, 0.7, 1200, 90);
          tone("sine", 70, 34, 0.9, 0.5);
          break;
        case "pass-threaded":
          tone("triangle", 880, 880, 0.07, 0.09);
          tone("triangle", 1174, 1174, 0.1, 0.09, 0.07);
          break;
        case "pass-bypassed":
          tone("triangle", 520, 520, 0.08, 0.05);
          break;
      }
    }
  };

  return {
    unlock,
    update,
    toggleMuted: () => {
      muted = !muted;
      if (master && ctx) {
        master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
