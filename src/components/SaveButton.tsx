import { useSaved } from '../state/saved';
import type { Sentence } from '../types';
import { BookmarkIcon } from './Marks';

/** Saves the sentence to practise again later; a second click takes it back out. */
export function SaveButton({ sentence }: { sentence: Sentence }) {
  const { find, toggle } = useSaved();
  const saved = Boolean(find(sentence.ru));

  return (
    <button
      type="button"
      className="button button--quiet save-button"
      data-saved={saved || undefined}
      title={saved ? 'Убрать из сохранённых' : 'Сохранить, чтобы потренировать ещё раз'}
      onClick={() => toggle(sentence)}
    >
      <BookmarkIcon />
      {saved ? 'Сохранено' : 'Сохранить'}
    </button>
  );
}
