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
 * The whole screen while a lesson's sentences are being generated, which takes up to a minute: a shape that keeps
 * turning into another one, and a cancel button. The page behind is inert until it closes.
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
      <MorphingShape />
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

// Each shape is a circle with a wave around its edge: `lobes` bumps, `depth` of the radius deep. A sum of cosines
// keeps every corner round, and the same sample points for all of them let one shape flow into the next.
const SHAPES = [
  { lobes: 10, depth: 0.07 }, // scalloped cookie
  { lobes: 3, depth: 0.14 }, // soft triangle
  { lobes: 0, depth: 0 }, // circle
  { lobes: 4, depth: 0.16 }, // clover
  { lobes: 5, depth: 0.1 }, // soft pentagon
  { lobes: 8, depth: 0.09 }, // flower
  { lobes: 2, depth: 0.16 }, // pill
];
const POINTS = 120;
const RADIUS = 62;
// One shape per beat: it holds, then morphs into the next while the whole thing gives an extra quarter turn.
const BEAT_MS = 1000;
const MORPH_MS = 650;
const SPIN_DEG_PER_MS = 0.06;

const radii = SHAPES.map(({ lobes, depth }) =>
  Array.from({ length: POINTS }, (_, i) => RADIUS * (1 + depth * Math.cos((lobes * 2 * Math.PI * i) / POINTS))),
);

/** Overshoots a little and settles, like a spring: the shape swells past the next one before it lands. */
function springOut(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function pathOf(r: number[], scale = 1): string {
  return (
    r
      .map((radius, i) => {
        const angle = (2 * Math.PI * i) / POINTS;
        const x = Math.cos(angle) * radius * scale;
        const y = Math.sin(angle) * radius * scale;
        return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join('') + 'Z'
  );
}

/**
 * The loader in the style of Android's expressive one: a filled shape that morphs through SHAPES, turning all the
 * time and a quarter turn more with each morph, with a faint halo of the same shape breathing behind it. The colour
 * moves through the teacher's pens in CSS. With reduced motion, the first shape standing still.
 */
function MorphingShape() {
  const shapeRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const elapsed = now - start;
      const beat = Math.floor(elapsed / BEAT_MS);
      const into = elapsed % BEAT_MS;
      const from = radii[beat % SHAPES.length];
      const to = radii[(beat + 1) % SHAPES.length];
      // The hold comes first, then the morph fills the rest of the beat.
      const t = Math.max(0, (into - (BEAT_MS - MORPH_MS)) / MORPH_MS);
      const k = springOut(t);
      const r = from.map((a, i) => a + (to[i] - a) * k);
      const turn = elapsed * SPIN_DEG_PER_MS + (beat + k) * 90;
      shapeRef.current?.setAttribute('d', pathOf(r));
      shapeRef.current?.setAttribute('transform', `rotate(${turn.toFixed(2)})`);
      haloRef.current?.setAttribute('d', pathOf(r, 1.22 + 0.05 * Math.sin(elapsed / 420)));
      haloRef.current?.setAttribute('transform', `rotate(${(turn * 0.6).toFixed(2)})`);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg className="morph" viewBox="-100 -100 200 200" aria-hidden="true">
      <path ref={haloRef} className="morph__halo" d={pathOf(radii[0], 1.22)} />
      <path ref={shapeRef} className="morph__shape" d={pathOf(radii[0])} />
    </svg>
  );
}
