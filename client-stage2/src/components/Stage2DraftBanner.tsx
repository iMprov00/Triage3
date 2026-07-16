import type { Stage2DraftNotice } from "../hooks/useStage2DraftSync";

type Props = {
  notice: Stage2DraftNotice | null;
};

export default function Stage2DraftBanner({ notice }: Props) {
  if (!notice) return null;

  return (
    <div className="alert alert-warning py-2 mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
      <span className="small mb-0">{notice.message}</span>
      <span className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-warning" onClick={notice.onApply}>
          Подставить данные
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={notice.onDismiss}>
          Оставить мои
        </button>
      </span>
    </div>
  );
}
