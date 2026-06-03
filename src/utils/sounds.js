import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

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

function uint8ToBase64(bytes) {
  const CHUNK = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(result);
}

let audioModeReady = false;
// Map key → { uri, written: bool }
const soundCache = {};

async function ensureAudioMode() {
  if (audioModeReady) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModeReady = true;
}

async function playToneNative(frequency, duration, gain = 0.3) {
  try {
    await ensureAudioMode();

    const key = `${frequency}_${Math.round(duration * 1000)}`;
    const uri = `${FileSystem.cacheDirectory}tone_${key}.wav`;

    // Check cache — re-write if file doesn't exist on disk
    if (!soundCache[key]) {
      const wav = buildWAV(frequency, duration, gain);
      const b64 = uint8ToBase64(wav);
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
      soundCache[key] = uri;
    } else {
      // Verify file still exists (cache dir can be cleared by OS)
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        const wav = buildWAV(frequency, duration, gain);
        const b64 = uint8ToBase64(wav);
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
        soundCache[key] = uri;
      }
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: soundCache[key] },
      { volume: 1.0, shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch {
    // Sound is non-critical — fail silently
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
  // Triumphant horn-like fanfare for challenge completion
  const notes = [523, 659, 784, 1047, 1319, 1568];
  notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.6, 0.35), i * 90));
  setTimeout(() => playTone(1568, 1.2, 0.4), 600);
  setTimeout(() => playTone(1319, 0.4, 0.3), 850);
  setTimeout(() => playTone(1047, 1.5, 0.35), 1050);
}
