import { tokenize } from '../lib/text';
import { useDictionary } from '../state/dictionary';

interface Props {
  sentence: string;
  sentenceRu: string;
  className?: string;
}

/** An English sentence whose words add themselves to the dictionary when clicked. */
export function ClickableSentence({ sentence, sentenceRu, className = '' }: Props) {
  const { find, isPending, toggle } = useDictionary();

  // Words are buttons, and a browser may break the line between a button and the "." after it. Each
  // space-separated chunk ("knee.", "“Hi,") is kept on one line, so lines only break at spaces.
  return (
    <p className={`clickable ${className}`} lang="en">
      {sentence.split(/(\s+)/).map((chunk, i) =>
        i % 2 === 1 ? (
          chunk
        ) : (
          <span key={i} className="clickable__chunk">
            {tokenize(chunk).map((token, j) => {
              if (!token.word) return token.text;
              const saved = find(token.text);
              const pending = isPending(token.text);
              return (
                <button
                  key={j}
                  type="button"
                  className="word"
                  data-state={pending ? 'pending' : saved ? 'saved' : undefined}
                  aria-pressed={Boolean(saved)}
                  title={saved ? `${saved.translation} — нажми, чтобы убрать из словаря` : 'Добавить в словарь'}
                  onClick={() => toggle(token.text, sentence, sentenceRu)}
                >
                  {token.text}
                </button>
              );
            })}
          </span>
        ),
      )}
    </p>
  );
}
