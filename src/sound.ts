// 효과음: 오디오 파일 없이 Web Audio API로 직접 합성한다 (용량 0, 라이선스 걱정 없음)
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type SoundName =
  | 'click'
  | 'card'
  | 'deal'
  | 'shuffle'
  | 'place'
  | 'dice'
  | 'turn'
  | 'success'
  | 'fail'
  | 'win'
  | 'tick'
  | 'chat'
  | 'join'
  | 'attack'
  | 'chip'
  | 'night'
  | 'day';

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const listeners = new Set<() => void>();
let muted = localStorage.getItem('pgt-muted') === '1';
let volume = Number(localStorage.getItem('pgt-volume') ?? '0.6');

function ensure(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!audio) {
    audio = new AudioContext();
    master = audio.createGain();
    master.gain.value = volume;
    master.connect(audio.destination);
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

// 브라우저는 사용자가 한 번 클릭해야 소리를 낼 수 있게 해 준다
if (typeof window !== 'undefined') {
  const unlock = () => {
    ensure();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

interface ToneOpts {
  freq: number;
  to?: number; // 끝 주파수 (미끄러지는 소리)
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number; // 시작 지연 (초)
  attack?: number;
}

function tone(ac: AudioContext, o: ToneOpts) {
  const t = ac.currentTime + (o.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

function noise(ac: AudioContext, o: { dur: number; at?: number; vol?: number; filter?: number; q?: number; type?: BiquadFilterType }) {
  const t = ac.currentTime + (o.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ac.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.value = o.filter ?? 3000;
  f.Q.value = o.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

const SOUNDS: Record<SoundName, (ac: AudioContext) => void> = {
  click: (ac) => tone(ac, { freq: 900, dur: 0.05, type: 'square', vol: 0.08 }),
  card: (ac) => {
    noise(ac, { dur: 0.09, filter: 2500, q: 0.8, vol: 0.35 });
    tone(ac, { freq: 220, to: 140, dur: 0.06, vol: 0.08 });
  },
  deal: (ac) => {
    for (let i = 0; i < 4; i++) noise(ac, { dur: 0.07, at: i * 0.07, filter: 2800, q: 0.8, vol: 0.28 });
  },
  shuffle: (ac) => {
    for (let i = 0; i < 10; i++) noise(ac, { dur: 0.04, at: i * 0.025, filter: 3500 + Math.random() * 1500, q: 1.5, vol: 0.2 });
  },
  place: (ac) => {
    // 바둑돌이 판에 닿는 딱 소리
    tone(ac, { freq: 1600, to: 600, dur: 0.05, type: 'triangle', vol: 0.25 });
    noise(ac, { dur: 0.05, filter: 4000, q: 2, vol: 0.25 });
    tone(ac, { freq: 180, to: 90, dur: 0.12, vol: 0.2 });
  },
  dice: (ac) => {
    for (let i = 0; i < 7; i++) {
      const at = i * 0.055 + Math.random() * 0.02;
      noise(ac, { dur: 0.035, at, filter: 1800 + Math.random() * 2000, q: 3, vol: 0.3 - i * 0.03 });
      tone(ac, { freq: 500 + Math.random() * 400, dur: 0.03, at, type: 'triangle', vol: 0.06 });
    }
  },
  turn: (ac) => {
    tone(ac, { freq: 784, dur: 0.18, type: 'triangle', vol: 0.22 });
    tone(ac, { freq: 1175, dur: 0.3, type: 'triangle', vol: 0.22, at: 0.12 });
  },
  success: (ac) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, dur: 0.18, type: 'triangle', vol: 0.2, at: i * 0.07 }));
  },
  fail: (ac) => {
    tone(ac, { freq: 330, to: 160, dur: 0.35, type: 'sawtooth', vol: 0.12 });
    tone(ac, { freq: 247, to: 120, dur: 0.4, type: 'sawtooth', vol: 0.1, at: 0.08 });
  },
  win: (ac) => {
    const notes = [523, 659, 784, 1047, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.52, 0.62];
    notes.forEach((f, i) => tone(ac, { freq: f, dur: i === notes.length - 1 ? 0.6 : 0.16, type: 'square', vol: 0.1, at: times[i] }));
    notes.forEach((f, i) => tone(ac, { freq: f / 2, dur: 0.2, type: 'triangle', vol: 0.12, at: times[i] }));
  },
  tick: (ac) => tone(ac, { freq: 1400, dur: 0.04, type: 'square', vol: 0.06 }),
  chat: (ac) => tone(ac, { freq: 660, to: 990, dur: 0.08, vol: 0.12 }),
  join: (ac) => {
    tone(ac, { freq: 523, dur: 0.1, type: 'triangle', vol: 0.15 });
    tone(ac, { freq: 784, dur: 0.15, type: 'triangle', vol: 0.15, at: 0.08 });
  },
  attack: (ac) => {
    tone(ac, { freq: 120, to: 40, dur: 0.4, type: 'sawtooth', vol: 0.25 });
    noise(ac, { dur: 0.3, filter: 400, type: 'lowpass', vol: 0.4 });
  },
  chip: (ac) => {
    tone(ac, { freq: 3200, dur: 0.05, type: 'square', vol: 0.05 });
    tone(ac, { freq: 2600, dur: 0.06, type: 'square', vol: 0.05, at: 0.05 });
    noise(ac, { dur: 0.05, filter: 6000, q: 4, vol: 0.15 });
  },
  night: (ac) => {
    [392, 311, 262].forEach((f, i) => tone(ac, { freq: f, dur: 0.5, type: 'sine', vol: 0.18, at: i * 0.22, attack: 0.08 }));
  },
  day: (ac) => {
    [523, 659, 784].forEach((f, i) => tone(ac, { freq: f, dur: 0.35, type: 'triangle', vol: 0.15, at: i * 0.1 }));
  },
};

export function play(name: SoundName) {
  if (muted) return;
  const ac = ensure();
  if (!ac || ac.state !== 'running') return;
  try {
    SOUNDS[name](ac);
  } catch {
    // 소리 재생 실패는 게임 진행에 영향이 없도록 무시
  }
}

function emit() {
  for (const l of listeners) l();
}

export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem('pgt-muted', v ? '1' : '0');
  emit();
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('pgt-volume', String(volume));
  if (master) master.gain.value = volume;
  emit();
}

export function useSoundSettings() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${muted}|${volume}`,
  );
}

export function getSoundSettings() {
  return { muted, volume };
}

/**
 * 값이 바뀔 때 소리를 낸다. 처음 화면이 그려질 때는 울리지 않는다.
 * pick이 소리 이름을 돌려주면 그 소리를, null이면 아무 소리도 내지 않는다.
 */
export function useSoundOn<T>(value: T, pick: (now: T, prev: T) => SoundName | null) {
  const prev = useRef(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = value;
      return;
    }
    if (Object.is(prev.current, value)) return;
    const name = pick(value, prev.current);
    prev.current = value;
    if (name) play(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** 내 차례가 되면 알림음 */
export function useTurnSound(myTurn: boolean) {
  useSoundOn(myTurn, (now) => (now ? 'turn' : null));
}

/** 남은 시간이 n초 이하일 때 초마다 똑딱 */
export function useCountdownTicks(remaining: number, active: boolean, from = 5) {
  useSoundOn(remaining, (now) => (active && now > 0 && now <= from ? 'tick' : null));
}
