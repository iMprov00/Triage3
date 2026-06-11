import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";
import Stage2DecisionSummary from "../components/Stage2DecisionSummary";

type PriorityOption = {
  key: string;
  label: string;
  destination_hint?: string;
};

type DecisionSummary = {
  full_name: string;
  suggested_priority: string;
  suggested_priority_name: string;
  destination_hint?: string;
  decision_priorities: PriorityOption[];
};

type TriageState = {
  workflow_route: string;
  decision_completed: boolean;
  can_submit_decision: boolean;
};

const PRIORITY_TONES: Record<string, string> = {
  red: "red",
  yellow: "yellow",
  orange: "orange",
  grey: "grey",
  green: "green",
};

export default function DecisionStepPage() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const [dec, triage] = await Promise.all([
          apiJson<DecisionSummary>(`/api/v1/stage2/patients/${patientId}/decision_summary`),
          apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
        ]);
        setSummary(dec);
        if (triage.workflow_route === "actions") {
          nav(`/patients/${patientId}/actions`, { replace: true });
          return;
        }
        if (triage.workflow_route === "completed") {
          nav("/patients", { replace: true });
          return;
        }
        if (!triage.can_submit_decision) {
          nav(`/patients/${patientId}/workflow`, { replace: true });
        }
      } catch {
        setErr("Не удалось загрузить данные");
      }
    })();
  }, [patientId, nav]);

  useEffect(() => {
    if (!historyOpen) return;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
    };
  }, [historyOpen]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !selected) {
      setErr("Выберите приоритет");
      return;
    }
    const differs = summary && selected !== summary.suggested_priority;
    if (differs && !note.trim()) {
      setErr("При выборе, отличном от рекомендации, укажите комментарий");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/decision`, {
        method: "POST",
        json: { decision: { priority: selected, note: note.trim() || undefined } },
      });
      nav(`/patients/${patientId}/actions`);
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setErr(e.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const suggestedTone = summary ? PRIORITY_TONES[summary.suggested_priority] || "neutral" : "neutral";

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell">
        <div className="triage-page-head mb-4">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="h4 mb-1">Принятие решения · {summary?.full_name || "Пациент"}</h1>
          <p className="text-muted small mb-2">Этап 2 · шаг 2 — выбор приоритета</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setHistoryOpen(true)}>
            <i className="bi bi-clock-history me-1" aria-hidden />
            Полная история
          </button>
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        {summary && (
          <div className="card triage-form-card shadow-sm mb-4">
            <div className="card-body">
              <h2 className="h6 mb-2">Рекомендация алгоритма</h2>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`patient-tag patient-tag--priority patient-tag--${suggestedTone}`}>
                  {summary.suggested_priority_name}
                </span>
                {summary.destination_hint && (
                  <span className="small text-muted">→ {summary.destination_hint}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card triage-form-card shadow-sm mb-4">
          <div className="card-body">
            <h2 className="h6 mb-3">История (кратко)</h2>
            {patientId && <Stage2DecisionSummary patientId={Number(patientId)} compact />}
          </div>
        </div>

        <form onSubmit={(e) => void submit(e)} className="card triage-form-card shadow-sm">
          <div className="card-body d-grid gap-3">
            <h2 className="h6 mb-0">Выберите приоритет</h2>
            <div className="stage2-decision-priority-grid">
              {(summary?.decision_priorities || []).map((opt) => {
                const tone = PRIORITY_TONES[opt.key] || "neutral";
                const active = selected === opt.key;
                const isSuggested = summary?.suggested_priority === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`stage2-decision-priority-card stage2-decision-priority-card--${tone}${active ? " stage2-decision-priority-card--active" : ""}`}
                    onClick={() => setSelected(opt.key)}
                  >
                    <div className="stage2-decision-priority-card__title">{opt.label}</div>
                    {opt.destination_hint && (
                      <div className="stage2-decision-priority-card__hint">{opt.destination_hint}</div>
                    )}
                    {isSuggested && <div className="stage2-decision-priority-card__badge">Рекомендация</div>}
                  </button>
                );
              })}
            </div>

            {summary && selected && selected !== summary.suggested_priority && (
              <div>
                <label className="form-label small">Комментарий (обязательно при отличии от рекомендации)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Причина выбора другого приоритета"
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy || !selected}>
              {busy ? "Сохранение…" : "Подтвердить приоритет и перейти к действиям"}
            </button>
          </div>
        </form>
      </div>

      {historyOpen && patientId && (
        <>
          <div className="modal-backdrop fade show" onClick={() => setHistoryOpen(false)} />
          <div className="modal fade show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0">Полная история</h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={() => setHistoryOpen(false)} />
                </div>
                <div className="modal-body">
                  <Stage2DecisionSummary patientId={Number(patientId)} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setHistoryOpen(false)}>
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
