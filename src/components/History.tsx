import { levelsText } from '../lib/lesson';
import { classOf, recordPoints, totalPoints } from '../lib/progress';
import { plural } from '../lib/text';
import { useHistory } from '../state/history';
import type { LessonRecord } from '../types';
import { Loading } from './Marks';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

function when(iso: string) {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  const day = days === 0 ? 'Сегодня' : days === 1 ? 'Вчера' : dayFormat.format(date);
  return `${day}, ${timeFormat.format(date)}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Finished lessons with their grades, newest first. */
export function HistoryPage() {
  const { records, error } = useHistory();

  const average = records && records.reduce((sum, r) => sum + r.grade, 0) / (records.length || 1);
  const points = records ? totalPoints(records) : 0;

  return (
    <section className="history" aria-labelledby="history-title">
      <header className="history__head">
        <h1 className="history__title" id="history-title">История</h1>
        {records && records.length > 0 && (
          <p className="history__summary">
            {records.length} {plural(records.length, ['занятие', 'занятия', 'занятий'])}, средняя оценка{' '}
            {average!.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}, {points}{' '}
            {plural(points, ['очко', 'очка', 'очков'])}, {classOf(records).name}
          </p>
        )}
      </header>

      {error && <p className="form-error" role="alert">История не загрузилась: {error}</p>}
      {!records && <Loading>Загружаю историю…</Loading>}

      {records && records.length === 0 && (
        <div className="empty">
          <p className="empty__title">Здесь пока пусто</p>
          <p className="empty__text">Когда закончишь занятие, здесь появится его оценка и результат.</p>
          <a className="button button--primary" href="#/practice">Начать занятие</a>
        </div>
      )}

      {records && records.length > 0 && (
        <ol className="history__list">
          {records.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function HistoryRow({ record }: { record: LessonRecord }) {
  const points = recordPoints(record);
  const mistakes = [
    record.almost > 0 && `${record.almost} почти`,
    record.wrong > 0 && `${record.wrong} ${plural(record.wrong, ['с ошибкой', 'с ошибками', 'с ошибками'])}`,
  ].filter(Boolean);
  const details = [
    levelsText(record.levels),
    record.withSaved && 'с сохранёнными',
    record.withWords && 'со словами из словаря',
    record.answered < record.total && `закончено досрочно, ${record.answered} из ${record.total}`,
  ].filter(Boolean);

  return (
    <li className="history__item">
      <span className="history__grade" data-grade={record.grade}>
        <span className="visually-hidden">Оценка </span>
        {record.grade}
      </span>
      <p className="history__when">
        <time dateTime={record.addedAt}>{when(record.addedAt)}</time>
        <span className="history__points" data-none={points === 0 ? '' : undefined}>
          {points > 0 ? `+${points}` : 'без очков'}
        </span>
      </p>
      <p className="history__stats">
        {record.correct} из {record.answered} без ошибок{mistakes.length > 0 && `, ${mistakes.join(', ')}`}
      </p>
      <p className="history__details">{details.join(', ')}</p>
    </li>
  );
}
