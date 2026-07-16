const VAS_EMOJIS = ["😊", "🙂", "😐", "😕", "😣", "😖", "😩", "😫", "🥵", "😭", "🆘"];

type Props = {
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
};

export default function VasSmileyPicker({ value, onChange, min = 0, max = 10 }: Props) {
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="stage2-vas-picker" role="group" aria-label="Оценка боли по ВАШ">
      {items.map((score) => {
        const active = value === score;
        return (
          <button
            key={score}
            type="button"
            className={`stage2-vas-btn triag-btn-selector ${active ? "stage2-vas-btn--active triag-btn-selector--active" : ""}`}
            onClick={() => onChange(score)}
            title={`Боль: ${score}`}
            aria-pressed={active}
          >
            <span className="stage2-vas-emoji" aria-hidden>
              {VAS_EMOJIS[score] ?? "😐"}
            </span>
            <span className="stage2-vas-num">{score}</span>
          </button>
        );
      })}
    </div>
  );
}
