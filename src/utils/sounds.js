import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Web Audio API (browser) ──────────────────────────────────────────────────

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return audioCtx;
}

async function playToneWeb(frequency, duration, gainValue = 0.25) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* silent */ }
}

// ─── Native audio via expo-av ─────────────────────────────────────────────────

function buildWAV(frequency, duration, gain = 0.45) {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(sampleRate * duration));
  const bytes = new Uint8Array(44 + numSamples * 2);
  const view = new DataView(bytes.buffer);

  const wr = (off, s) => { for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i); };
  wr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  wr(8, 'WAVE');
  wr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 6);
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * gain;
    const v = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, v, true);
  }
  return bytes;
}

// Pure-JS base64 — avoids btoa + String.fromCharCode.apply issues on React Native
function uint8ToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

// ─── Audio mode — singleton promise so concurrent tones don't race each other ──
// (playChime fires 3 tones nearly simultaneously; 3 parallel setAudioModeAsync
// calls racing each other would corrupt the audio session on some platforms)

let audioModePromise = null;

function ensureAudioMode() {
  if (audioModePromise) return audioModePromise;
  audioModePromise = Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  }).catch(e => {
    console.warn('[Sound] setAudioModeAsync failed:', e?.message ?? e);
    audioModePromise = null; // reset so next call retries
  });
  return audioModePromise;
}

// ─── WAV file cache (documentDirectory = stable, never cleared by OS) ─────────

const memCache = {}; // key → file URI (in-memory, reset on app restart)

async function getOrCreateWav(key, frequency, duration, gain) {
  if (memCache[key]) return memCache[key];

  const uri = `${FileSystem.documentDirectory}snd_${key}.wav`;

  // Reuse file written in a previous session
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    const wav = buildWAV(frequency, duration, gain);
    const b64 = uint8ToBase64(wav);
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  }

  memCache[key] = uri;
  return uri;
}

async function playToneNative(frequency, duration, gain = 0.3) {
  try {
    await ensureAudioMode();

    const key = `${frequency}_${Math.round(duration * 1000)}`;
    const uri = await getOrCreateWav(key, frequency, duration, gain);

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { volume: 1.0, shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch (e) {
    console.warn('[Sound] playback failed:', e?.message ?? e);
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function playTone(frequency, duration, gain = 0.3) {
  if (Platform.OS === 'web') {
    playToneWeb(frequency, duration, gain);
  } else {
    playToneNative(frequency, duration, gain);
  }
}

// ─── Public chime functions ───────────────────────────────────────────────────

export function playChime() {
  playTone(880, 0.18, 0.25);
  setTimeout(() => playTone(1100, 0.22, 0.2), 110);
  setTimeout(() => playTone(1320, 0.3, 0.15), 220);
}

export function playSuccessChime() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.4, 0.25), i * 110));
}

export function playChallengeChime() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.5, 0.28), i * 120));
  setTimeout(() => playTone(1047, 0.8, 0.22), 700);
}

export function playHornFanfare() {
  const notes = [523, 659, 784, 1047, 1319, 1568];
  notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.6, 0.35), i * 90));
  setTimeout(() => playTone(1568, 1.2, 0.4), 600);
  setTimeout(() => playTone(1319, 0.4, 0.3), 850);
  setTimeout(() => playTone(1047, 1.5, 0.35), 1050);
}

// ─── Sound option samples (for user to test and choose) ───────────────────────

// Option 1 — "Clean Ding": single crisp bell, very short
export function playSoundSample1() {
  playTone(1209, 0.2, 0.32);
}

// Option 2 — "Two-Tap": two quick ascending notes (Duolingo-style confirm)
export function playSoundSample2() {
  playTone(523, 0.13, 0.3);
  setTimeout(() => playTone(784, 0.22, 0.28), 80);
}

// Option 3 — "Soft Rise": three gentle ascending notes, warm and mellow
export function playSoundSample3() {
  [440, 554, 659].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 0.24), i * 115));
}

// Option 4 — "Sparkle": four rapid ascending notes, bright and playful
export function playSoundSample4() {
  [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 0.28), i * 58));
}

// Option 5 — "Pop": short punchy double-tone, satisfying
export function playSoundSample5() {
  playTone(660, 0.12, 0.34);
  setTimeout(() => playTone(990, 0.18, 0.24), 45);
}

// Option 6 — "Coin": two sharp metallic tones, video-game style
export function playSoundSample6() {
  playTone(1320, 0.08, 0.4);
  setTimeout(() => playTone(1760, 0.25, 0.32), 58);
}
