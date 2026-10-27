import type { Verdict } from '../types';

// Hand-drawn teacher marks for the notebook margin. pathLength=1 lets CSS draw each stroke in.
const CHECK = 'M7 25c4 2.5 7.5 6.5 10.5 12.5C23 25 30 15.5 41 8';
const CROSS = ['M11 10.5c8 8.5 16 17.5 26 27', 'M37.5 9.5c-9 8-17.5 18-26 28.5'];

export function Mark({ verdict }: { verdict: Verdict }) {
  return (
    <svg className={`mark mark--${verdict}`} viewBox="0 0 48 48" aria-hidden="true">
      {verdict === 'wrong' ? (
        CROSS.map((d) => <path key={d} d={d} pathLength={1} />)
      ) : (
        <path d={CHECK} pathLength={1} />
      )}
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 9v4.5M11.5 9v4.5" />
    </svg>
  );
}

/** A small turning ring for buttons that are waiting on the model. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** A page section still waiting for the server; appears only if the wait is noticeable, so quick loads don't flash. */
export function Loading({ children }: { children: string }) {
  return (
    <p className="loading" role="status">
      <Spinner />
      {children}
    </p>
  );
}

/** Outline by default; filled (via CSS) when the sentence is saved. */
export function BookmarkIcon() {
  return (
    <svg className="icon bookmark" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 3.5h9a1 1 0 0 1 1 1v12.2a.5.5 0 0 1-.8.4L10 13.6l-4.7 3.5a.5.5 0 0 1-.8-.4V4.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

/** The grammar a sentence practises, as small chips. */
export function GrammarTags({ grammar }: { grammar?: string[] }) {
  if (!grammar?.length) return null;
  return (
    <ul className="grammar-tags" aria-label="Грамматика в предложении">
      {grammar.map((point) => (
        <li key={point} className="grammar-tags__tag" lang="en">
          {point}
        </li>
      ))}
    </ul>
  );
}

/** Eight equal teeth, 45° apart, computed rather than drawn so the gear is exactly symmetric. */
export function GearIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M8.66 3.95L8.85 1.83A8.25 8.25 0 0 1 11.15 1.83L11.34 3.95A6.2 6.2 0 0 1 13.33 4.77L14.96 3.41A8.25 8.25 0 0 1 16.59 5.04L15.23 6.67A6.2 6.2 0 0 1 16.05 8.66L18.17 8.85A8.25 8.25 0 0 1 18.17 11.15L16.05 11.34A6.2 6.2 0 0 1 15.23 13.33L16.59 14.96A8.25 8.25 0 0 1 14.96 16.59L13.33 15.23A6.2 6.2 0 0 1 11.34 16.05L11.15 18.17A8.25 8.25 0 0 1 8.85 18.17L8.66 16.05A6.2 6.2 0 0 1 6.67 15.23L5.04 16.59A8.25 8.25 0 0 1 3.41 14.96L4.77 13.33A6.2 6.2 0 0 1 3.95 11.34L1.83 11.15A8.25 8.25 0 0 1 1.83 8.85L3.95 8.66A6.2 6.2 0 0 1 4.77 6.67L3.41 5.04A8.25 8.25 0 0 1 5.04 3.41L6.67 4.77A6.2 6.2 0 0 1 8.66 3.95Z" />
    </svg>
  );
}

/** Shown in dark mode: switches to light. */
export function SunIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.34 4.34l1.27 1.27M14.39 14.39l1.27 1.27M4.34 15.66l1.27-1.27M14.39 5.61l1.27-1.27" />
    </svg>
  );
}

/** Shown in light mode: switches to dark. */
export function MoonIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7z" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 4h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.6 2.7a.5.5 0 0 1-.8-.4V14h-.1A1.5 1.5 0 0 1 3 12.5v-7A1.5 1.5 0 0 1 4.5 4z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg className="icon lock" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.75 12.75 4 4" />
    </svg>
  );
}
