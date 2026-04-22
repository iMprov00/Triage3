import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function TriageStepEditConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Сохранить",
  cancelLabel = "Отмена",
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <>
      <div className="modal-backdrop fade show" onClick={busy ? undefined : onCancel} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="triage-edit-confirm-title">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id="triage-edit-confirm-title">
                {title}
              </h2>
              <button type="button" className="btn-close" aria-label="Закрыть" disabled={busy} onClick={onCancel} />
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={onCancel}>
                {cancelLabel}
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onConfirm()}>
                {busy ? "Сохранение…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
