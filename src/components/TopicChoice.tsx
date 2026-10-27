import { useState } from 'react';
import { inClass, levelOpening } from '../lib/progress';
import { chosenTopics, fitsLevels, topicsText, useTopics } from '../lib/topics';
import type { Level, Settings, Topic, TopicGroup } from '../types';
import { CloseIcon, Loading, LockIcon } from './Marks';

interface Props {
  settings: Settings;
  /** Levels the class has opened. */
  open: Level[];
  /** Levels this lesson will use: topics above the highest of them can't be picked. */
  levels: Level[];
  /** Sentences the model will write; saved ones keep their own topics. */
  freshCount: number;
  disabled: boolean;
  onChange: (settings: Settings) => void;
}

const KINDS: { kind: TopicGroup['kind']; label: string }[] = [
  { kind: 'topic', label: 'Темы' },
  { kind: 'grammar', label: 'Грамматика и слова' },
];

/** Picks what the lesson is about; nothing picked means any topic. */
export function TopicChoice({ settings, open, levels, freshCount, disabled, onChange }: Props) {
  const { groups, error } = useTopics();
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<TopicGroup['kind']>('topic');
  const [query, setQuery] = useState('');
  const ids = settings.topics;

  function toggle(id: string) {
    onChange({ ...settings, topics: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  }

  const { fit, tooHard } = groups ? chosenTopics(ids, groups, levels) : { fit: [], tooHard: [] };
  const chosen = [...fit, ...tooHard];

  let note = 'Темы и грамматика подбираются сами, под уровень.';
  if (freshCount === 0) note = 'Урок соберётся из сохранённых предложений, темы не понадобятся.';
  else if (fit.length > 0) {
    note = fit.length === 1 ? 'Все новые предложения будут на эту тему.' : 'Выбранные темы пойдут по очереди.';
    if (fit.length > freshCount) note = `В урок попадут ${freshCount} случайных из выбранных.`;
  }

  // A search looks through both kinds, so a grammar name typed on the topics tab is still found.
  const search = query.trim().toLowerCase();
  const shown = (groups ?? [])
    .filter((g) => (search ? true : g.kind === kind))
    .map((g) => ({ ...g, topics: g.topics.filter((t) => !search || t.name.toLowerCase().includes(search)) }))
    .filter((g) => g.topics.length > 0);

  return (
    <fieldset className="choice" disabled={disabled}>
      <legend className="choice__legend">
        Тема {expanded && <span className="choice__hint">можно выбрать несколько</span>}
      </legend>

      <div className="topics__chosen">
        {chosen.length === 0 ? (
          <span className="topics__any">Любая</span>
        ) : (
          chosen.map((t) => (
            <span key={t.id} className="topics__tag" data-off={tooHard.includes(t) || undefined}>
              {t.name}
              <button type="button" className="topics__remove" onClick={() => toggle(t.id)} aria-label={`Убрать тему «${t.name}»`}>
                <CloseIcon />
              </button>
            </span>
          ))
        )}
        <button type="button" className="link-button" aria-expanded={expanded} aria-controls="topic-picker" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Свернуть' : chosen.length ? 'Изменить' : 'Выбрать тему'}
        </button>
        {chosen.length > 0 && (
          <button type="button" className="link-button" onClick={() => onChange({ ...settings, topics: [] })}>
            Любая тема
          </button>
        )}
      </div>

      <p className="choice__note">{note}</p>
      {tooHard.length > 0 && (
        <p className="choice__note choice__note--error">
          {tooHard.length === 1 ? 'Не попадёт' : 'Не попадут'} в урок: {topicsText(tooHard.map((t) => t.name))}.{' '}
          {tooHard.length === 1 ? 'Ей' : 'Им'} нужен уровень выше выбранного.
        </p>
      )}

      {expanded && (
        <div className="topics" id="topic-picker">
          {error ? (
            <p className="form-error">Не удалось загрузить темы: {error}</p>
          ) : !groups ? (
            <Loading>Загружаю темы…</Loading>
          ) : (
            <>
              <div className="topics__bar">
                <div className="topics__tabs" role="radiogroup" aria-label="Что выбирать">
                  {KINDS.map((k) => (
                    <label key={k.kind} className="cell">
                      <input type="radio" name="topic-kind" checked={kind === k.kind} disabled={Boolean(search)} onChange={() => setKind(k.kind)} />
                      <span className="cell__face cell__face--wide topics__tab">{k.label}</span>
                    </label>
                  ))}
                </div>
                <label className="visually-hidden" htmlFor="topic-search">
                  Найти тему
                </label>
                <input
                  id="topic-search"
                  className="topics__search"
                  type="search"
                  placeholder="Найти тему"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // Enter would submit the setup form and start the lesson.
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                />
              </div>

              <div className="topics__list">
                {shown.length === 0 && <p className="choice__note">Ничего не нашлось.</p>}
                {shown.map((group) => (
                  <section key={group.id} className="topics__group" aria-labelledby={`topics-${group.id}`}>
                    <h3 className="topics__heading" id={`topics-${group.id}`}>
                      {group.name}
                    </h3>
                    <div className="topics__chips">
                      {group.topics.map((t) => (
                        <TopicChip key={t.id} topic={t} open={open} levels={levels} checked={ids.includes(t.id)} onToggle={() => toggle(t.id)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}

interface ChipProps {
  topic: Topic;
  open: Level[];
  levels: Level[];
  checked: boolean;
  onToggle: () => void;
}

/**
 * A topic the lesson can't have is greyed out: with a lock while the class hasn't opened its level, without one
 * when only the levels chosen above are too low. A chosen one stays clickable, so it can still be removed.
 */
function TopicChip({ topic, open, levels, checked, onToggle }: ChipProps) {
  const locked = !open.includes(topic.level);
  const tooHard = !locked && !fitsLevels(topic, levels);
  let title: string | undefined;
  if (locked) title = `Откроется ${inClass(levelOpening(topic.level).classNumber)}`;
  else if (tooHard) title = `Нужен уровень ${topic.level}: выбери его выше`;
  return (
    <label className="topic-chip" data-locked={locked || undefined} data-off={tooHard || undefined} title={title}>
      <input type="checkbox" checked={checked} disabled={(locked || tooHard) && !checked} onChange={onToggle} />
      <span className="topic-chip__face">
        {topic.name}
        <span className="topic-chip__level">
          {locked && <LockIcon />}
          {topic.level}
        </span>
      </span>
    </label>
  );
}
