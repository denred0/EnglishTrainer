import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// What the model is busy with, one line at a time while the sentences are being made.
const LINES = [
  'Подбираю живые фразы…',
  'Сверяю грамматику с уровнем…',
  'Проверяю, звучит ли по-человечески…',
  'Готовлю английские варианты…',
];
const LINE_MS = 3200;

/**
 * The whole screen while a lesson's sentences are being generated, which takes up to a minute: bouncing, merging
 * balls, and a cancel button. The page behind is inert until it closes.
 */
export function GeneratingScreen({ onCancel }: { onCancel: () => void }) {
  const [line, setLine] = useState(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setLine((i) => (i + 1) % LINES.length), LINE_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.getElementById('root');
    const returnFocus = document.activeElement as HTMLElement | null;
    root?.setAttribute('inert', '');
    document.documentElement.classList.add('is-locked');
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => {
      root?.removeAttribute('inert');
      document.documentElement.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
      returnFocus?.focus();
    };
  }, [onCancel]);

  return createPortal(
    <div className="generating" role="dialog" aria-modal="true" aria-labelledby="generating-status">
      <BouncingBalls />
      <p className="generating__line" key={line} aria-hidden="true">
        {LINES[line]}
      </p>
      <p className="generating__note" id="generating-status" role="status">
        Готовлю предложения. Модель подбирает естественные фразы, это занимает до минуты.
      </p>
      <button ref={cancelRef} type="button" className="button button--secondary" onClick={onCancel}>
        Отменить
      </button>
    </div>,
    document.body,
  );
}

// Four balls in the teacher's pens, on a 4.8 s loop: they hop in a row like Google's loading dots, fly together and
// melt into one drop, swirl, burst out onto an orbit and come back into the row. The "goo" filter blurs them and
// sharpens the blur's edge again, so balls that touch flow into each other like liquid.
const PENS = ['blue', 'green', 'amber', 'red'];
const ROW = [-54, -18, 18, 54];
const BALL = 13;
const LOOP_MS = 4800;
// Phase ends within the loop: hopping, gathering, swirling as one drop, bursting onto the orbit, back to the row.
const HOP_END = 1600;
const GATHER_END = 2400;
const SWIRL_END = 3400;
const BURST_END = 4200;
const HOP_MS = 520;
const HOP_HEIGHT = 30;
const SWIRL_SPEED = (2 * Math.PI) / 700; // radians per ms
const ORBIT = 46;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Ball {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Ball `i` while hopping: two hops each, the balls a beat apart, stretched in the air and squashed on landing. */
function hop(i: number, t: number): Ball {
  for (const start of [i * 100, i * 100 + 740]) {
    const u = (t - start) / HOP_MS;
    if (u >= 0 && u <= 1) {
      const stretch = 0.12 * Math.abs(Math.cos(Math.PI * u));
      return { x: ROW[i], y: -HOP_HEIGHT * Math.sin(Math.PI * u), rx: BALL * (1 - stretch), ry: BALL * (1 + stretch) };
    }
    const sinceLanding = t - start - HOP_MS;
    if (sinceLanding > 0 && sinceLanding < 140) {
      const squash = 0.2 * (1 - sinceLanding / 140);
      return { x: ROW[i], y: BALL * squash, rx: BALL * (1 + squash), ry: BALL * (1 - squash) };
    }
  }
  return { x: ROW[i], y: 0, rx: BALL, ry: BALL };
}

/** Where ball `i` is around the middle, `t` ms into the swirl. */
function swirlAngle(i: number, t: number) {
  return (i * Math.PI) / 2 + SWIRL_SPEED * t;
}

function ballAt(i: number, t: number): Ball {
  const round = (x: number, y: number): Ball => ({ x, y, rx: BALL, ry: BALL });
  if (t < HOP_END) return hop(i, t);
  if (t < GATHER_END) {
    // Into the middle along arcs, the even balls over the top and the odd ones under.
    const k = easeInOut((t - HOP_END) / (GATHER_END - HOP_END));
    const a = swirlAngle(i, 0);
    const arc = Math.sin(Math.PI * k) * 16 * (i % 2 ? 1 : -1);
    return round(lerp(ROW[i], 6 * Math.cos(a), k), lerp(0, 6 * Math.sin(a), k) + arc);
  }
  if (t < SWIRL_END) {
    const into = t - GATHER_END;
    const a = swirlAngle(i, into);
    const r = 6 + 4 * Math.sin((Math.PI * into) / (SWIRL_END - GATHER_END));
    return round(r * Math.cos(a), r * Math.sin(a));
  }
  const a0 = swirlAngle(i, SWIRL_END - GATHER_END);
  if (t < BURST_END) {
    // Out onto the orbit, still turning and slowing down: 2.2 rad, starting at about the swirl's speed.
    const k = easeOut((t - SWIRL_END) / (BURST_END - SWIRL_END));
    const a = a0 + 2.2 * k;
    const r = lerp(6, ORBIT, k);
    return round(r * Math.cos(a), r * Math.sin(a));
  }
  const a = a0 + 2.2;
  const k = easeInOut((t - BURST_END) / (LOOP_MS - BURST_END));
  return round(lerp(ORBIT * Math.cos(a), ROW[i], k), lerp(ORBIT * Math.sin(a), 0, k));
}

/** A sine line twice as wide as its window, so sliding it by one wavelength loops seamlessly. */
function wave(): string {
  const parts = ['M-120 66'];
  for (let x = -120; x < 120; x += 10) parts.push(`q5 ${x % 20 === 0 ? -6 : 6} 10 0`);
  return parts.join('');
}

/**
 * The balls, moved frame by frame from ballAt, and a wavy line running under them like Android's progress
 * indicators. With reduced motion, the balls stand in their row and the line stays still.
 */
function BouncingBalls() {
  const refs = useRef<(SVGEllipseElement | null)[]>([]);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    // The clock starts at the first frame: a frame's timestamp can be a little older than anything read here.
    let start: number | null = null;
    const draw = (now: number) => {
      start ??= now;
      const t = Math.max(0, now - start) % LOOP_MS;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const b = ballAt(i, t);
        el.setAttribute('cx', b.x.toFixed(2));
        el.setAttribute('cy', b.y.toFixed(2));
        el.setAttribute('rx', b.rx.toFixed(2));
        el.setAttribute('ry', b.ry.toFixed(2));
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg className="balls" viewBox="-100 -64 200 140" aria-hidden="true">
      <defs>
        <filter id="balls-goo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <linearGradient id="balls-fade">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.25" stopColor="#fff" />
          <stop offset="0.75" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="balls-wave-mask">
          <rect x="-80" y="56" width="160" height="20" fill="url(#balls-fade)" />
        </mask>
      </defs>
      <g filter="url(#balls-goo)">
        {PENS.map((pen, i) => (
          <ellipse
            key={pen}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`balls__ball balls__ball--${pen}`}
            cx={ROW[i]}
            cy={0}
            rx={BALL}
            ry={BALL}
          />
        ))}
      </g>
      <g mask="url(#balls-wave-mask)">
        <path className="balls__wave" d={wave()} />
      </g>
    </svg>
  );
}
