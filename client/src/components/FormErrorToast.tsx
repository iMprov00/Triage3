import { useEffect } from "react";

type Props = {
  message: string;
  onDismiss?: () => void;
};

export default function FormErrorToast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => onDismiss?.(), 8000);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="triage-form-error-toast" role="alert" aria-live="assertive">
      <div className="triage-form-error-toast-icon" aria-hidden>
        <i className="bi bi-exclamation-triangle-fill" />
      </div>
      <div className="triage-form-error-toast-body">
        <div className="triage-form-error-toast-title">Не удалось продолжить</div>
        <div className="triage-form-error-toast-text">{message}</div>
      </div>
      {onDismiss ? (
        <button type="button" className="triage-form-error-toast-close" aria-label="Закрыть" onClick={onDismiss}>
          <i className="bi bi-x-lg" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
