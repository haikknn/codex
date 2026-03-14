// Snapshot of a user-provided Beat Sync Visualizer component (truncated).
// Kept as a reference snippet under docs/examples.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Music2,
  Volume2,
  Waves,
  Sparkles,
  Maximize2,
  Type,
  Download,
  Disc3,
  Palette,
  Video,
} from 'lucide-react';

// --- Inline UI Components (Replacing shadcn/ui imports) ---
const Card = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`rounded-xl border bg-card text-card-foreground shadow ${className}`} {...props} />
));

const CardContent = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`p-6 pt-0 ${className}`} {...props} />
));

const Button = React.forwardRef(({ className = '', variant = 'default', ...props }, ref) => {
  const baseStyles = "inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    default: "bg-white text-black shadow hover:bg-white/90",
    secondary: "bg-white/10 text-white shadow-sm hover:bg-white/20",
  };
  const variantStyle = variants[variant] || variants.default;
  return <button ref={ref} className={`${baseStyles} ${variantStyle} h-9 px-4 py-2 ${className}`} {...props} />;
});

const Slider = ({ min, max, step, value, onValueChange, disabled }) => (
  <input
    type="range"
    min={min}
    max={max}
    step={step}
    value={value[0]}
    onChange={(e) => onValueChange([parseFloat(e.target.value)])}
    disabled={disabled}
    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white disabled:opacity-50"
  />
);

const Badge = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none ${className}`} {...props} />
));

// --- Constants & Helpers ---
const FFT_SIZE = 2048;
const SMOOTHING = 0.82;
const HISTORY_SIZE = 160;
const STAR_COUNT = 220;
const ORB_COUNT = 34;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createStars() {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random(),
    size: Math.random() * 2 + 0.3,
    drift: Math.random() * 0.5 + 0.2,
  }));
}

function createOrbs() {
  return Array.from({ length: ORB_COUNT }, (_, i) => ({
    angle: (i / ORB_COUNT) * Math.PI * 2,
    radius: 0.18 + Math.random() * 0.34,
    speed: 0.002 + Math.random() * 0.006,
    size: 6 + Math.random() * 24,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.008 + Math.random() * 0.02,
  }));
}

function getSupportedMimeTypes(preferMp4) {
  const candidates = preferMp4
    ? ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];

  if (typeof MediaRecorder === 'undefined') return [];
  return candidates.filter((type) => {
    try {
      return MediaRecorder.isTypeSupported ? MediaRecorder.isTypeSupported(type) : true;
    } catch {
      return false;
    }
  });
}

function buildPalette(stylePreset) {
  const palettes = {
    cyber: { a: '#5fe1ff', b: '#7f5cff', c: '#ff4fd8', glow: 'rgba(120,220,255,0.35)', bg: '#03050e' },
    aurora: { a: '#69ffd8', b: '#64b5ff', c: '#d18cff', glow: 'rgba(120,255,220,0.35)', bg: '#041019' },
    inferno: { a: '#ff7b39', b: '#ff2f6d', c: '#ffd166', glow: 'rgba(255,130,80,0.35)', bg: '#100506' },
    ice: { a: '#dff7ff', b: '#79d9ff', c: '#7ca8ff', glow: 'rgba(180,240,255,0.32)', bg: '#020811' },
    gold: { a: '#ffe082', b: '#ffca5f', c: '#fff2c7', glow: 'rgba(255,220,130,0.28)', bg: '#0d0902' },
  };

  return palettes[stylePreset] || palettes.cyber;
}

// --- Main Application Component ---
export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([80]);
  const [fullscreen, setFullscreen] = useState(false);
  const [visualMode, setVisualMode] = useState('nebula');
  const [stylePreset, setStylePreset] = useState('cyber');
  const [ready, setReady] = useState(false);

  const [titleText, setTitleText] = useState('THE POWERFUL HUMAN');
  const [titleFont, setTitleFont] = useState('Orbitron');
  const [titleSize, setTitleSize] = useState([72]);
  const [titleSpacing, setTitleSpacing] = useState([10]);
  const [showTitle, setShowTitle] = useState(true);

  const [recording, setRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('Idle');
  const [downloadFormat, setDownloadFormat] = useState('mp4');

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const gainRef = useRef(null);
  const recordDestRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const freqDataRef = useRef(null);
  const timeDataRef = useRef(null);
  const prevSpectrumRef = useRef(null);
  const energyHistoryRef = useRef([]);
  const beatPulseRef = useRef(0);
  const starsRef = useRef(createStars());
  const orbsRef = useRef(createOrbs());

  const currentTrack = tracks[currentIndex] || null;

  const beatStateRef = useRef({
    level: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    flux: 0,
    beat: 0,
    beatPulse: 0,
  });

  const presetPalette = useMemo(() => buildPalette(stylePreset), [stylePreset]);

  const cleanupAudioGraph = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }
    if (recordDestRef.current) {
      try { recordDestRef.current.disconnect(); } catch {}
      recordDestRef.current = null;
    }
  }, []);

  const initAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setRecordStatus('Web Audio is not supported in this browser');
        return;
      }
      ctxRef.current = new AudioCtx();
    }

    if (ctxRef.current.state === 'suspended') {
      await ctxRef.current.resume();
    }

    if (!analyserRef.current) {
      const ctx = ctxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;

      const gain = ctx.createGain();
      gain.gain.value = volume[0] / 100;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);

      const recordDest = ctx.createMediaStreamDestination();
      gain.connect(recordDest);

      analyserRef.current = analyser;
      gainRef.current = gain;
      sourceRef.current = source;
      recordDestRef.current = recordDest;

      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      prevSpectrumRef.current = new Float32Array(analyser.frequencyBinCount);
    }

    setReady(true);
  }, [volume]);

  const loadTrack = useCallback(async (index, autoplay = false) => {
    const audio = audioRef.current;
    const track = tracks[index];
    if (!audio || !track) return;

    audio.src = track.url;
    audio.load();
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(0);

    await initAudio();

    if (autoplay) {
      try {
        await audio.play();
      } catch (e) {
        console.error("Playback failed:", e);
      }
    }
  }, [initAudio, tracks]);

  const onFiles = useCallback((files) => {
    if (!files || !files.length) return;
    const next = Array.from(files)
      .filter((file) => file.type.includes('audio') || file.name.toLowerCase().endsWith('.mp3'))
      .map((file) => ({
        id: makeId(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        file,
        url: URL.createObjectURL(file),
      }));

    setTracks((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (tracks.length > 1) {
        const nextIndex = (currentIndex + 1) % tracks.length;
        loadTrack(nextIndex, true);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentIndex, loadTrack, tracks.length]);

  useEffect(() => {
    // Auto load first track onto the audio element when uploaded
    const audio = audioRef.current;
    if (tracks.length > 0 && audio && !audio.getAttribute('src')) {
      loadTrack(0, false);
    }
  }, [tracks, loadTrack]);

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = volume[0] / 100;
    }
    if (audioRef.current) {
      audioRef.current.volume = 1;
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupAudioGraph();
      if (ctxRef.current && typeof ctxRef.current.close === 'function') {
        ctxRef.current.close();
      }
    };
  }, [cleanupAudioGraph]);

  useEffect(() => {
    return () => {
      tracks.forEach((track) => {
        try {
          URL.revokeObjectURL(track.url);
        } catch {}
      });
    };
  }, [tracks]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // If no track is loaded into the audio element yet, but we have tracks, load the first one.
    if (tracks.length > 0 && !audio.getAttribute('src')) {
      await loadTrack(currentIndex, true);
      return;
    }

    await initAudio();

    if (audio.paused) {
      try {
        await audio.play();
      } catch (e) {
        console.error("Playback failed:", e);
      }
    } else {
      audio.pause();
    }
  }, [currentIndex, initAudio, loadTrack, tracks.length]);

  const prevTrack = useCallback(async () => {
    if (!tracks.length) return;
    const next = (currentIndex - 1 + tracks.length) % tracks.length;
    await loadTrack(next, isPlaying);
  }, [currentIndex, isPlaying, loadTrack, tracks.length]);

  const nextTrack = useCallback(async () => {
    if (!tracks.length) return;
    const next = (currentIndex + 1) % tracks.length;
    await loadTrack(next, isPlaying);
  }, [currentIndex, isPlaying, loadTrack, tracks.length]);

  const seek = useCallback((value) => {
    const audio = audioRef.current;
    if (!audio || !duration || !Array.isArray(value)) return;
    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  }, [duration]);

  const computeBeatState = useCallback(() => {
    const analyser = analyserRef.current;
    const freqData = freqDataRef.current;
    const timeData = timeDataRef.current;
    const prevSpectrum = prevSpectrumRef.current;

    if (!analyser || !freqData || !timeData || !prevSpectrum) {
      beatStateRef.current = {
        level: 0, bass: 0, mids: 0, highs: 0, flux: 0, beat: 0, beatPulse: beatPulseRef.current,
      };
      return beatStateRef.current;
    }

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    const len = freqData.length;
    const bassEnd = Math.floor(len * 0.08);
    const midsEnd = Math.floor(len * 0.35);
    const highsEnd = Math.floor(len * 0.82);

    let bass = 0;
    let mids = 0;
    let highs = 0;
    let total = 0;
    let flux = 0;

    for (let i = 0; i < len; i += 1) {
      const v = freqData[i] / 255;
      total += v;
      const diff = v - prevSpectrum[i];
      if (diff > 0) flux += diff;
      prevSpectrum[i] = lerp(prevSpectrum[i], v, 0.45);

      if (i < bassEnd) bass += v;
      else if (i < midsEnd) mids += v;
      else if (i < highsEnd) highs += v;
    }

    bass /= Math.max(1, bassEnd);
    mids /= Math.max(1, midsEnd - bassEnd);
    highs /= Math.max(1, highsEnd - midsEnd);
    total /= len;
    flux /= len;

    const energyScore = bass * 1.6 + flux * 2.4 + total * 0.9;
    const history = energyHistoryRef.current;
    history.push(energyScore);
    if (history.length > HISTORY_SIZE) history.shift();

    const avg = history.reduce((a, b) => a + b, 0) / Math.max(1, history.length);
    const variance = history.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, history.length);
    const std = Math.sqrt(variance);
    const threshold = avg + std * 0.9;

    const beat = energyScore > threshold && bass > 0.14 ? 1 : 0;

    beatPulseRef.current *= 0.92;
    if (beat) beatPulseRef.current = Math.max(beatPulseRef.current, 1);

    const state = {
      level: total, bass, mids, highs, flux, beat, beatPulse: beatPulseRef.current,
    };

    beatStateRef.current = state;
    return state;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  // ... snip ...
}