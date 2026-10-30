import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import animation from '../assets/lumberjack.webp';
import still from '../assets/lumberjack-still.webp';

// Jokes about what the model is doing, one at a time while the sentences are being made.
const LINES = [
  'Рублю предложения на слова…',
  'Обтёсываю грамматику…',
  'Щепки-ошибки летят в сторону…',
  'Выбираю полено поживее…',
  'Проверяю, звучит ли по-человечески…',
  'Складываю фразы в поленницу…',
];
const LINE_MS = 3200;

/**
 * The whole screen while a lesson's sentences are being generated, which takes up to a minute: a lumberjack chopping
 * logs and a cancel button. The page behind is inert until it closes.
 */
export function ChoppingScreen({ onCancel }: { onCancel: () => void }) {
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
    <div className="chop" role="dialog" aria-modal="true" aria-labelledby="chop-status">
      <Lumberjack />
      <p className="chop__line" key={line} aria-hidden="true">
        {LINES[line]}
      </p>
      <p className="chop__note" id="chop-status" role="status">
        Готовлю предложения. Модель подбирает естественные фразы, это занимает до минуты.
      </p>
      <button ref={cancelRef} type="button" className="button button--secondary" onClick={onCancel}>
        Отменить
      </button>
    </div>,
    document.body,
  );
}

/**
 * A cartoon lumberjack splitting a log, over and over: an animated WebP with transparency, keyed off the green of a
 * Gemini video and played 1.5 times faster. The loop joins two chops from it: the first, where the log splits and the
 * halves fly off, runs into the second just after its hit through in-betweens drawn by motion interpolation, so its
 * whole log reads as a new one; then the axe goes back up to where the first swing starts. With reduced motion, the
 * first frame alone.
 */
function Lumberjack() {
  return (
    <picture>
      <source srcSet={still} media="(prefers-reduced-motion: reduce)" />
      <img className="lumberjack" src={animation} width={640} height={435} alt="" />
    </picture>
  );
}
