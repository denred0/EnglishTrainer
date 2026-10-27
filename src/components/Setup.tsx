import type { FormEvent, ReactNode } from 'react';
import { classOf, inClass, levelOpening, nextLevel, openLevels, PROMOTION_STREAK } from '../lib/progress';
import { plural } from '../lib/text';
import { useDictionary } from '../state/dictionary';
import { useHistory } from '../state/history';
import { useSaved } from '../state/saved';
import { LockIcon, Spinner } from './Marks';
import { TopicChoice } from './TopicChoice';
import { LEVELS, type Level, type Settings, type Status } from '../types';

const COUNTS = [5, 10, 15, 20];

const LEVEL_NOTES: Record<Level, string> = {
  A1: 'Начальный: to be, Present Simple, самые частые слова.',
  A2: 'Элементарный: прошедшее время, will и going to, сравнения.',
  B1: 'Средний: Present Perfect, условные предложения, пассив.',
  B2: 'Выше среднего: условные 2-го и 3-го типа, косвенная речь, идиомы.',
  C1: 'Продвинутый: инверсия, смешанные условные, тонкая лексика.',
  C2: 'В совершенстве: стилистические нюансы и редкие конструкции.',
};

function levelNote(chosen: Level[], open: Level[]) {
  const levels = lessonLevels(chosen, open);
  if (levels.length === 1) return LEVEL_NOTES[levels[0]];
  if (chosen.length === 0) return `Вперемешку от ${levels[0]} до ${levels.at(-1)}, от простых к сложным.`;
  const list = `${levels.slice(0, -1).join(', ')} и ${levels.at(-1)}`;
  return `${list} вперемешку, от простых к сложным.`;
}

/** The levels a lesson uses: the ticked open ones, or every open one when none is ticked ("Любой"). */
export function lessonLevels(chosen: Level[], open: Level[]): Level[] {
  const picked = chosen.filter((l) => open.includes(l));
  return picked.length ? picked : open;
}

interface Props {
  settings: Settings;
  status: Status | null;
  loading: boolean;
  error: string | null;
  onChange: (settings: Settings) => void;
  onStart: () => void;
}

export function Setup({ settings, status, loading, error, onChange, onStart }: Props) {
  const { entries } = useDictionary();
  const { entries: saved } = useSaved();
  const { records } = useHistory();
  const state = classOf(records ?? []);
  const open = openLevels(state);
  const next = nextLevel(state);
  // Sentences below the class's level don't move the learner up; say so if the choice has only those.
  const belowClass = lessonLevels(settings.levels, open).every((l) => LEVELS.indexOf(l) < LEVELS.indexOf(state.level));
  // Levels ticked before they were locked (or before locks existed) don't count until they open.
  const chosen = settings.levels.filter((l) => open.includes(l));
  const selectedWords = entries.filter((e) => !settings.excludedWords.includes(e.id)).length;
  const fromSaved = settings.useSaved ? Math.min(saved.length, settings.count) : 0;
  const freshCount = settings.count - fromSaved;
  const noWordsPicked = settings.useWords && entries.length > 0 && selectedWords === 0 && freshCount > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!noWordsPicked) onStart();
  }

  function toggleLevel(level: Level) {
    const picked = chosen.includes(level) ? chosen.filter((l) => l !== level) : [...chosen, level];
    onChange({ ...settings, levels: LEVELS.filter((l) => picked.includes(l)) });
  }

  return (
    <form className="setup" onSubmit={submit}>
      <h1 className="setup__title">Сколько предложений переведёшь сегодня?</h1>

      <fieldset className="choice" disabled={loading}>
        <legend className="visually-hidden">Количество предложений</legend>
        <div className="choice__row">
          {COUNTS.map((count) => (
            <label key={count} className="cell">
              <input
                type="radio"
                name="count"
                value={count}
                checked={settings.count === count}
                onChange={() => onChange({ ...settings, count })}
              />
              <span className="cell__face cell__face--number">{count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice" disabled={loading}>
        <legend className="choice__legend">
          Уровень {open.length > 1 && <span className="choice__hint">можно выбрать несколько</span>}
        </legend>
        <div className="choice__row">
          {open.length > 1 && (
            <label className="cell">
              <input
                type="checkbox"
                name="level"
                value="any"
                checked={chosen.length === 0}
                onChange={() => onChange({ ...settings, levels: [] })}
              />
              <span className="cell__face cell__face--wide">Любой</span>
            </label>
          )}
          {LEVELS.map((level) => {
            const locked = !open.includes(level);
            const opensIn = inClass(levelOpening(level).classNumber);
            return (
              <label key={level} className="cell" data-locked={locked || undefined} title={locked ? `Откроется ${opensIn}` : undefined}>
                <input
                  type="checkbox"
                  name="level"
                  value={level}
                  checked={!locked && (chosen.includes(level) || open.length === 1)}
                  disabled={locked || open.length === 1}
                  aria-describedby={locked ? 'level-lock' : undefined}
                  onChange={() => toggleLevel(level)}
                />
                <span className="cell__face">
                  {locked && <LockIcon />}
                  {level}
                </span>
              </label>
            );
          })}
        </div>
        <p className="choice__note">{levelNote(chosen, open)}</p>
        {belowClass ? (
          <p className="choice__note choice__note--error">
            Для перехода {state.next ? `в «${state.next}» ` : ''}засчитываются только предложения уровня {state.level} и
            выше, а в этом уроке их не будет.
          </p>
        ) : (
          next && (
            <p className="choice__note choice__note--lock" id="level-lock">
              {next.level} откроется {inClass(next.classNumber)}. Для перехода нужно {PROMOTION_STREAK} верных подряд в
              предложениях уровня {state.level} и выше, сейчас {state.streak}.
            </p>
          )
        )}
      </fieldset>

      <TopicChoice
        settings={settings}
        open={open}
        levels={lessonLevels(settings.levels, open)}
        freshCount={freshCount}
        disabled={loading}
        onChange={onChange}
      />

      {saved.length > 0 && (
        <fieldset className="choice" disabled={loading}>
          <legend className="visually-hidden">Сохранённые предложения</legend>
          <Switch checked={settings.useSaved} onChange={(useSaved) => onChange({ ...settings, useSaved })}>
            Добавить сохранённые предложения
          </Switch>
          {settings.useSaved && (
            <p className="choice__note">
              {freshCount > 0
                ? `Из сохранённых: ${fromSaved}, новых: ${freshCount}.`
                : saved.length > settings.count
                  ? `Урок соберётся только из сохранённых: ${settings.count} случайных из ${saved.length}.`
                  : 'Урок соберётся только из сохранённых.'}
            </p>
          )}
        </fieldset>
      )}

      {entries.length > 0 && (
        <WordChoice
          settings={settings}
          selected={selectedWords}
          freshCount={freshCount}
          mixedWithSaved={fromSaved > 0}
          disabled={loading}
          onChange={onChange}
        />
      )}

      {status && !status.hasKey && (
        <p className="notice">
          Чтобы получать предложения, добавь ключ OpenAI в файл <code>.env</code> (строка <code>OPENAI_API_KEY=…</code>) и перезапусти сервер.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="setup__actions">
        <button
          type="submit"
          className="button button--primary button--large"
          disabled={loading || noWordsPicked}
          aria-busy={loading || undefined}
        >
          {loading ? (
            <>
              <Spinner />
              Готовлю предложения…
            </>
          ) : (
            'Начать'
          )}
        </button>
        <p className="setup__wait" role="status">
          {loading ? 'Обычно это занимает несколько секунд.' : ''}
        </p>
      </div>
    </form>
  );
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__label">{children}</span>
    </label>
  );
}

interface WordChoiceProps {
  settings: Settings;
  selected: number;
  /** Sentences the model will write; saved ones come as they are, without dictionary words. */
  freshCount: number;
  mixedWithSaved: boolean;
  disabled: boolean;
  onChange: (settings: Settings) => void;
}

function WordChoice({ settings, selected, freshCount, mixedWithSaved, disabled, onChange }: WordChoiceProps) {
  const { entries } = useDictionary();
  const excluded = settings.excludedWords;
  const allSelected = selected === entries.length;

  function toggle(id: string) {
    onChange({ ...settings, excludedWords: excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id] });
  }

  let note = `В каждом ${mixedWithSaved ? 'новом ' : ''}предложении будет одно из выбранных слов.`;
  if (freshCount === 0) note = 'Новых предложений в уроке не будет, поэтому слова не понадобятся.';
  else if (selected === 0) note = 'Выбери хотя бы одно слово.';
  else if (selected > freshCount) note += ` В занятие попадут ${freshCount} случайных.`;
  else if (selected < freshCount) note += ' Некоторые слова повторятся.';

  return (
    <fieldset className="choice" disabled={disabled}>
      <legend className="visually-hidden">Слова из словаря</legend>
      <Switch checked={settings.useWords} onChange={(useWords) => onChange({ ...settings, useWords })}>
        Предложения со словами из словаря
      </Switch>

      {settings.useWords && (
        <div className="words">
          <div className="words__bar">
            <p className="words__count">
              Выбрано {selected} из {entries.length} {plural(entries.length, ['слова', 'слов', 'слов'])}
            </p>
            <button
              type="button"
              className="link-button"
              onClick={() => onChange({ ...settings, excludedWords: allSelected ? entries.map((e) => e.id) : [] })}
            >
              {allSelected ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          <div className="words__list">
            {entries.map((entry) => (
              <label key={entry.id} className="word-chip" title={entry.translation}>
                <input type="checkbox" checked={!excluded.includes(entry.id)} onChange={() => toggle(entry.id)} />
                <span className="word-chip__face" lang="en">
                  <svg className="word-chip__check" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                  {entry.word}
                </span>
              </label>
            ))}
          </div>
          <p className={`choice__note${selected === 0 && freshCount > 0 ? ' choice__note--error' : ''}`}>{note}</p>
        </div>
      )}
    </fieldset>
  );
}
