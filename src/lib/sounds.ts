// Sound effects using Web Audio API synthesis — no external dependencies needed

let audioCtx: AudioContext | null = null;
const SOUND_ENABLED_STORAGE_KEY = 'checkers:sound-enabled';

function readInitialSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

let soundEnabled = readInitialSoundEnabled();

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // Ignore storage write errors (e.g., private browsing restrictions)
    }
  }
}

function getCtx(): AudioContext | null {
  if (!soundEnabled) return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function playMoveSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

export function playCaptureSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Impact thud
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(200, now);
  osc1.frequency.exponentialRampToValueAtTime(80, now + 0.15);
  gain1.gain.setValueAtTime(0.25, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc1.start(now);
  osc1.stop(now + 0.2);

  // Snap click
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(1200, now);
  osc2.frequency.exponentialRampToValueAtTime(300, now + 0.06);
  gain2.gain.setValueAtTime(0.1, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc2.start(now);
  osc2.stop(now + 0.08);
}

export function playKingSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Ascending triumphant chord
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const start = now + i * 0.08;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.start(start);
    osc.stop(start + 0.4);
  });

  // Shimmer
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1047, now + 0.2); // C6
  osc.frequency.exponentialRampToValueAtTime(1568, now + 0.5); // G6
  gain.gain.setValueAtTime(0, now + 0.2);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.start(now + 0.2);
  osc.stop(now + 0.6);
}

export function playGameOverSound(won: boolean) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (won) {
    // Victory fanfare
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const start = now + i * 0.12;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } else {
    // Defeat — descending
    const notes = [400, 350, 300, 200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      const start = now + i * 0.15;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }
}
