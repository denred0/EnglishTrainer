import { useState } from 'react';
import { classOf, openLevels, totalPoints } from '../lib/progress';
import { loadSettings } from '../lib/session';
import { save } from '../lib/storage';
import { plural } from '../lib/text';
import { useHistory } from '../state/history';
import { useToast } from '../state/toast';
import type { Settings, Status } from '../types';
import { Spinner } from './Marks';

const GOALS = [5, 10, 15, 20, 30];

const EFFORTS: Record<string, { label: string; note: string }> = {
  none: { label: 'Без рассуждений', note: 'Ответ за пару секунд, но тонкие ошибки модель может пропустить.' },
  low: { label: 'Немного', note: 'Быстро и в большинстве случаев точно.' },
  medium: { label: 'Средне', note: 'Хороший баланс скорости и точности.' },
  high: { label: 'Тщательно', note: 'Внимательнее к оттенкам смысла, проверка дольше.' },
  xhigh: { label: 'Очень тщательно', note: 'Ещё дольше, разница заметна на сложных предложениях.' },
  max: { label: 'Максимум', note: 'Самая долгая проверка, имеет смысл для C1–C2.' },
};

export function SettingsPage({ status }: { status: Status | null }) {
  const [settings, setSettings] = useState(loadSettings);

  function change(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    save('settings', next);
  }

  const efforts = status?.efforts ?? Object.keys(EFFORTS);
  // Until a level is picked here, checks use the server's (OPENAI_REASONING_EFFORT), so that one shows as chosen.
  const current = settings.checkEffort ?? status?.checkEffort ?? 'medium';

  return (
    <section className="settings" aria-labelledby="settings-title">
      <h1 className="settings__title" id="settings-title">Настройки</h1>

      <fieldset className="settings__section">
        <legend className="settings__heading">Цель: предложений в день</legend>
        <div className="choice__row">
          {GOALS.map((goal) => (
            <label key={goal} className="cell">
              <input
                type="radio"
                name="goal"
                value={goal}
                checked={settings.dailyGoal === goal}
                onChange={() => change({ dailyGoal: goal })}
              />
              <span className="cell__face cell__face--number">{goal}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings__section">
        <legend className="settings__heading">Проверка ответов</legend>
        <p className="settings__text">
          Сколько модель «думает», прежде чем оценить перевод.
        </p>
        <div className="options">
          {efforts.map((effort) => (
            <Option
              key={effort}
              checked={current === effort}
              label={EFFORTS[effort]?.label ?? effort}
              code={effort}
              note={EFFORTS[effort]?.note ?? ''}
              onSelect={() => change({ checkEffort: effort })}
            />
          ))}
        </div>
        {status?.demo && <p className="settings__text">В демо-режиме ответы проверяются без модели, так что настройка ни на что не влияет.</p>}
      </fieldset>

      <ResetProgress />
    </section>
  );
}

interface OptionProps {
  checked: boolean;
  label: string;
  code?: string;
  note: string;
  onSelect: () => void;
}

function Option({ checked, label, code, note, onSelect }: OptionProps) {
  return (
    <label className="option">
      <input type="radio" name="effort" checked={checked} onChange={onSelect} />
      <span className="option__mark" aria-hidden="true" />
      <span className="option__body">
        <span className="option__label">
          {label}
          {code && <code className="option__code">{code}</code>}
        </span>
        {note && <span className="option__note">{note}</span>}
      </span>
    </label>
  );
}

function ResetProgress() {
  const { records, reset } = useHistory();
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const lessons = records?.length ?? 0;
  const points = totalPoints(records ?? []);
  const state = classOf(records ?? []);
  const levels = openLevels(state);
  const stats = [
    { value: state.name, label: 'сейчас' },
    { value: points, label: plural(points, ['очко', 'очка', 'очков']) },
    { value: lessons, label: `${plural(lessons, ['занятие', 'занятия', 'занятий'])} в истории` },
    { value: levels.length === 1 ? levels[0] : `${levels[0]}–${levels.at(-1)}`, label: levels.length === 1 ? 'открытый уровень' : 'открытые уровни' },
  ];

  async function confirm() {
    setBusy(true);
    try {
      await reset();
      setConfirming(false);
      notify({ message: 'Прогресс сброшен: снова 1 класс' });
    } catch (err) {
      notify({ message: `Не получилось сбросить: ${(err as Error).message}`, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings__section" aria-labelledby="reset-title">
      <h2 className="settings__heading" id="reset-title">Прогресс</h2>
      <dl className="totals settings__stats">
        {stats.map((s) => (
          <div key={s.label} className="totals__item">
            <dt className="totals__label">{s.label}</dt>
            <dd className="totals__value">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="settings__text">
        Сброс удалит историю занятий, а с ней очки, класс, открытые уровни и серию дней. Словарь и сохранённые
        предложения останутся.
      </p>

      {!confirming ? (
        <button type="button" className="button button--secondary settings__reset" onClick={() => setConfirming(true)} disabled={lessons === 0}>
          Сбросить прогресс
        </button>
      ) : (
        <div className="settings__confirm" role="group" aria-label="Подтверждение сброса">
          <p className="settings__warning">
            Удалить {lessons} {plural(lessons, ['занятие', 'занятия', 'занятий'])} и начать с 1 класса? Резервная копия
            истории сохранится.
          </p>
          <div className="settings__actions">
            <button type="button" className="button button--danger" onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
              {busy && <Spinner />}
              Да, сбросить
            </button>
            <button type="button" className="button button--quiet" onClick={() => setConfirming(false)} disabled={busy}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
