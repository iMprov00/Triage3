import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";
import RedArrestActionsPanel, { type RedArrestTriageView } from "../components/RedArrestActionsPanel";
import FormErrorToast from "../components/FormErrorToast";
import { focusTriageActionsFormError } from "../utils/triageActionsFormErrors";

type ActionDef = { key: string; text?: string; label?: string; starts_timer?: boolean; final?: boolean };

export default function TriageActionsPage() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);

  async function load() {
    try {
      const r = await apiJson<{ triage: Record<string, unknown> }>(`/api/v1/patients/${patientId}/triage/actions`);
      setTriage(r.triage);
      setErr("");
      if (r.triage.actions_completed_at) {
        nav(`/patients/${patientId}/triage/actions/report`, { replace: true });
      }
    } catch {
      setErr("Недоступно");
    }
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
  }, [patientId]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!err) return;
    focusTriageActionsFormError(err);
  }, [err]);

  const actions = ((triage?.priority_actions as ActionDef[]) || []).filter((a) => !a.final);
  const actionsFlowKind = (triage?.actions_flow_kind as string | null | undefined) || null;
  const red = Boolean(actionsFlowKind);
  const actionsData = (triage?.actions_data as Record<string, unknown>) || {};

  const limit = (triage?.actions_time_limit as number) || 300;
  const phaseEnds =
    triage?.actions_started_at != null
      ? Math.floor(new Date(triage.actions_started_at as string).getTime() / 1000) + limit
      : null;

  const phaseRem =
    phaseEnds != null ? Math.max(0, Math.floor(phaseEnds - Date.now() / 1000)) : 0;
  const phasePct = limit > 0 ? Math.min(100, (phaseRem / limit) * 100) : 0;
  const phaseTone = phaseRem <= 0 ? "danger" : phasePct <= 25 ? "danger" : phasePct <= 50 ? "warning" : "ok";
  const brigadeEnds = triage?.brigade_timer_ends_at as number | null | undefined;
  const brigadeRem =
    brigadeEnds != null ? Math.max(0, Math.floor(brigadeEnds - Date.now() / 1000)) : 0;
  const brigadeLimit = typeof triage?.brigade_time_limit === "number" && triage.brigade_time_limit > 0 ? triage.brigade_time_limit : 720;
  const brigadePct = Math.min(100, (brigadeRem / brigadeLimit) * 100);
  const brigadeTone = brigadeRem <= 0 ? "danger" : brigadePct <= 25 ? "danger" : brigadePct <= 50 ? "warning" : "ok";

  const priorityClass = (() => {
    const p = String(triage?.priority || "").toLowerCase();
    if (p === "red") return "red";
    if (p === "yellow") return "yellow";
    if (p === "purple") return "purple";
    if (p === "green") return "green";
    return "neutral";
  })();

  async function mark(key: string) {
    setErr("");
    try {
      await apiJson(`/api/v1/patients/${patientId}/triage/actions/mark`, {
        method: "POST",
        json: { triage_action: key },
      });
      await load();
    } catch {
      setErr("Ошибка");
    }
  }

  async function complete() {
    setErr("");
    try {
      const r = await apiJson<{ success: boolean; handoff?: boolean }>(
        `/api/v1/patients/${patientId}/triage/actions/complete`,
        { method: "POST", json: {} },
      );
      if (r.handoff) {
        nav("/patients");
        return;
      }
      nav(`/patients/${patientId}/triage/actions/report`);
    } catch {
      setErr("Не все действия выполнены");
    }
  }

  if (!triage) return <div className="container-fluid triag-page-wide"><div className="triage-page-shell py-2 py-sm-3">{err || "Загрузка…"}</div></div>;

  return (
    <div className="container-fluid triag-page-wide">
      <FormErrorToast message={err} onDismiss={() => setErr("")} />
      <div className="triage-page-shell py-2 py-sm-3">
      <div className="triage-page-head mb-3">
        <Link to="/patients" className="triage-back-link">← Пациенты</Link>
        <h1 className="triag-page-heading mb-0">Действия по приоритету</h1>
      </div>
      {!red && (triage.actions_started_at != null || triage.brigade_timer_ends_at != null) && (
        <div className="triage-actions-top-grid">
          {triage.actions_started_at != null && (
            <div className={`triage-timer-card triage-timer-card--${phaseTone} ${phaseRem <= 0 ? "triage-timer-card--expired" : ""}`}>
              <div className="triage-timer-row">
                <span className="small text-muted">Фаза действий</span>
                <span className="triage-timer-value">{formatTimer(phaseRem)}</span>
              </div>
              <div className="progress triage-timer-progress">
                <div className={`progress-bar triage-timer-bar triage-timer-bar--${phaseTone}`} style={{ width: `${phasePct}%` }} />
              </div>
            </div>
          )}
          {triage.brigade_timer_ends_at != null && (
            <div className={`triage-timer-card triage-timer-card--${brigadeTone} ${brigadeRem <= 0 ? "triage-timer-card--expired" : ""}`}>
              <div className="triage-timer-row">
                <span className="small text-muted">Таймер бригады</span>
                <span className="triage-timer-value">{formatTimer(brigadeRem)}</span>
              </div>
              <div className="progress triage-timer-progress">
                <div className={`progress-bar triage-timer-bar triage-timer-bar--${brigadeTone}`} style={{ width: `${brigadePct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
      {red ? (
        <RedArrestActionsPanel
          patientId={patientId!}
          triage={triage as RedArrestTriageView}
          onRefresh={load}
          onComplete={complete}
          setErr={setErr}
        />
      ) : (
        <div id="triage-actions-list" className="triage-simple-actions">
          {actions.map((a) => {
            const done = Boolean((actionsData as Record<string, unknown>)[a.key]);
            const completedAt = (actionsData as Record<string, unknown>)[a.key];
            return (
              <div
                key={a.key}
                className={`triage-simple-action-row triage-simple-action-row--${priorityClass}${done ? " triage-simple-action-row--done" : ""}`}
              >
                <div className="triage-simple-action-main">
                  <div className="triage-simple-action-badges">
                    {a.starts_timer ? <span className="triage-simple-action-badge">Таймер</span> : null}
                  </div>
                  <div className="triage-simple-action-title">{a.text || a.key}</div>
                  {done && completedAt != null && (
                    <div className="triage-simple-action-time text-muted">
                      Выполнено: {new Date(Number(completedAt) * 1000).toLocaleString("ru-RU")}
                    </div>
                  )}
                </div>
                {!triage.actions_completed_at && (
                  <button
                    type="button"
                    className={`btn ${done ? "btn-success triag-btn-secondary" : "btn-outline-primary triag-btn-primary"} triage-simple-action-btn`}
                    onClick={() => void mark(a.key)}
                  >
                    {done ? "Готово" : "Выполнено"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!red && !triage.actions_completed_at && (
        <button type="button" className="btn btn-primary mt-3 triag-btn-primary triage-simple-actions-complete" onClick={() => void complete()}>
          Завершить действия
        </button>
      )}
      </div>
    </div>
  );
}
