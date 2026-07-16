import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { apiJson } from "../api";
import FormErrorToast from "../components/FormErrorToast";
import Stage2DecisionSummary from "../components/Stage2DecisionSummary";
import Stage1ChecklistButton from "../components/Stage1ChecklistButton";
import Stage2DraftBanner from "../components/Stage2DraftBanner";
import Stage2PhaseEditConfirmDialog from "../components/Stage2PhaseEditConfirmDialog";
import { useStage2DraftSync } from "../hooks/useStage2DraftSync";
import type { AuthOutletContext } from "../sessionTypes";
import { focusDecisionFormError } from "../utils/decisionFormErrors";
import { buildDecisionDraftPayload, draftRevisionFrom } from "../utils/stage2DraftHelpers";
import { stage2ActivePhasePath, stage2PathIsEditMode, type Stage2PhaseEditPreview } from "../stage2Ui";

type PriorityOption = {
  key: string;
  label: string;
  destination_hint?: string;
};

type DecisionSummary = {
  full_name: string;
  suggested_priority: string;
  suggested_priority_name: string;
  suggested_priority_reasons?: string[];
  destination_hint?: string;
  decision_priorities: PriorityOption[];
};

type TriageState = {
  workflow_route: string;
  decision_completed: boolean;
  can_submit_decision: boolean;
  decision_data: Record<string, unknown>;
  actions_completed_at?: string | null;
  can_edit_saved_phases?: boolean;
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
  const location = useLocation();
  const nav = useNavigate();
  const auth = useOutletContext<AuthOutletContext | undefined>();
  const userId = auth?.user?.id;
  const isEditMode = stage2PathIsEditMode(location.pathname, "decision");
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [editPreview, setEditPreview] = useState<Stage2PhaseEditPreview | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const formState = useMemo(() => ({ selected, note }), [selected, note]);

  const applyRemote = useCallback((data: Record<string, unknown>) => {
    if (data.priority) setSelected(String(data.priority));
    if (data.note != null) setNote(String(data.note));
  }, []);

  const { notice, scheduleSave, finishHydration } = useStage2DraftSync({
    patientId,
    phase: "decision",
    userId,
    enabled: draftEnabled && !isEditMode,
    buildPayload: () => buildDecisionDraftPayload(selected, note),
    applyRemote,
  });

  useEffect(() => {
    if (!err) return;
    focusDecisionFormError(err);
  }, [err]);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const [dec, triage] = await Promise.all([
          apiJson<DecisionSummary>(`/api/v1/stage2/patients/${patientId}/decision_summary`),
          apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
        ]);
        setSummary(dec);

        if (isEditMode) {
          if (triage.actions_completed_at) {
            setErr("Действия по приоритету завершены. Редактирование недоступно.");
            return;
          }
          if (!triage.can_edit_saved_phases) {
            setErr("Недостаточно прав для редактирования");
            return;
          }
          if (!triage.decision_data?.completed_at) {
            nav(`/patients/${patientId}/decision`, { replace: true });
            return;
          }
        } else {
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
            return;
          }
        }

        const dd = triage.decision_data || {};
        applyRemote(dd);
        if (!isEditMode) {
          finishHydration(draftRevisionFrom(dd));
          setDraftEnabled(true);
        }
      } catch {
        setErr("Не удалось загрузить данные");
      }
    })();
  }, [patientId, nav, applyRemote, finishHydration, isEditMode]);

  useEffect(() => {
    if (!draftEnabled || isEditMode) return;
    scheduleSave();
  }, [draftEnabled, formState, scheduleSave, isEditMode]);

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

    if (isEditMode) {
      setBusy(true);
      setErr("");
      try {
        const preview = await apiJson<Stage2PhaseEditPreview>(
          `/api/v1/stage2/patients/${patientId}/triage/preview_phase_update/decision`,
          { method: "POST", json: { decision: { priority: selected, note: note.trim() || undefined } } },
        );
        setEditPreview(preview);
        setEditConfirmOpen(true);
      } catch (ex: unknown) {
        const error = ex as { body?: { error?: string } };
        setErr(error.body?.error || "Не удалось подготовить сохранение");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/decision`, {
        method: "POST",
        json: { decision: { priority: selected, note: note.trim() || undefined } },
      });
      nav("/patients");
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setErr(e.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEditSave() {
    if (!patientId || !selected) return;
    setBusy(true);
    try {
      const res = await apiJson<{ triage: TriageState }>(
        `/api/v1/stage2/patients/${patientId}/triage/update_phase/decision`,
        { method: "POST", json: { decision: { priority: selected, note: note.trim() || undefined } } },
      );
      setEditConfirmOpen(false);
      nav(stage2ActivePhasePath(patientId, res.triage.workflow_route));
    } catch (ex: unknown) {
      const error = ex as { body?: { error?: string } };
      setErr(error.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const suggestedTone = summary ? PRIORITY_TONES[summary.suggested_priority] || "neutral" : "neutral";

  return (
    <div className="container-fluid triag-page-wide">
      <FormErrorToast message={err} onDismiss={() => setErr("")} />
      <Stage2DraftBanner notice={notice} />
      <div className="triage-page-shell">
        <div className="triage-page-head mb-3">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="triag-page-heading mb-0">
            {isEditMode ? "Редактирование решения" : "Принятие решения"} · {summary?.full_name || "Пациент"}
          </h1>
          <span className="triage-page-head-meta text-muted">Этап 2 · решение</span>
          {patientId && <Stage1ChecklistButton patientId={Number(patientId)} />}
          <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => setHistoryOpen(true)}>
            <i className="bi bi-clock-history me-1" aria-hidden />
            <span className="d-none d-md-inline">Полная история</span>
          </button>
        </div>

        {summary && (
          <div className="card triage-form-card shadow-sm mb-4">
            <div className="card-body">
              <h2 className="h6 mb-2">Рекомендация алгоритма</h2>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className={`patient-tag patient-tag--priority patient-tag--${suggestedTone}`}>
                  {summary.suggested_priority_name}
                </span>
                {summary.destination_hint && (
                  <span className="small text-muted">→ {summary.destination_hint}</span>
                )}
              </div>
              {(summary.suggested_priority_reasons?.length ?? 0) > 0 && (
                <div>
                  <div className="small text-muted mb-1">Почему:</div>
                  <ul className="small mb-0 ps-3">
                    {summary.suggested_priority_reasons!.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
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
            <div id="decision-priority-grid" className="stage2-decision-priority-grid">
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
              <div id="decision-priority-note-section">
                <label className="form-label small" htmlFor="decision-priority-note">
                  Комментарий (обязательно при отличии от рекомендации)
                </label>
                <textarea
                  id="decision-priority-note"
                  className="form-control"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Причина выбора другого приоритета"
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary triag-btn-primary" disabled={busy || !selected}>
              {busy ? "Сохранение…" : isEditMode ? "Сохранить изменения" : "Подтвердить приоритет"}
            </button>
          </div>
        </form>
      </div>

      <Stage2PhaseEditConfirmDialog
        open={editConfirmOpen}
        title="Сохранить изменения решения?"
        busy={busy}
        onCancel={() => setEditConfirmOpen(false)}
        onConfirm={() => void confirmEditSave()}
      >
        {editPreview?.priority_changed && (
          <p className="mb-2">
            Приоритет изменится с <strong>{editPreview.current_priority_name}</strong> на{" "}
            <strong>{editPreview.new_priority_name}</strong>.
          </p>
        )}
        {editPreview?.downstream_reset && (
          <p className="mb-0 text-warning">Отмеченные действия будут сброшены.</p>
        )}
        {!editPreview?.priority_changed && !editPreview?.downstream_reset && (
          <p className="mb-0">Подтвердите сохранение изменений решения.</p>
        )}
      </Stage2PhaseEditConfirmDialog>

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
