import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";
import RedArrestActionsPanel, { type RedArrestTriageView } from "../components/RedArrestActionsPanel";

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

  const actions = (triage?.priority_actions as ActionDef[]) || [];
  const red = Boolean(triage?.red_arrest_flow);
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
      await apiJson(`/api/v1/patients/${patientId}/triage/actions/complete`, { method: "POST", json: {} });
      nav("/patients");
    } catch {
      setErr("Не все действия выполнены");
    }
  }

  if (!triage) return <div className="container-fluid triag-page-wide"><div className="triage-page-shell py-2 py-sm-3">{err || "Загрузка…"}</div></div>;

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell py-2 py-sm-3">
      <div className="triage-page-head">
        <Link to="/patients" className="triage-back-link">← Пациенты</Link>
        <h1 className="h4 triage-page-title">Действия по приоритету</h1>
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
      {err && <div className="alert alert-danger py-2">{err}</div>}

      {red ? (
        <RedArrestActionsPanel
          patientId={patientId!}
          triage={triage as RedArrestTriageView}
          onRefresh={load}
          onComplete={complete}
          setErr={setErr}
        />
      ) : (
        <ul className="list-group triage-actions-list">
          {actions.map((a) => {
            const done = Boolean((actionsData as Record<string, unknown>)[a.key]);
            return (
              <li key={a.key} className="list-group-item d-flex justify-content-between align-items-center">
                <span>{a.text || a.key}</span>
                <button type="button" className={`btn btn-sm ${done ? "btn-success" : "btn-outline-primary"}`} onClick={() => void mark(a.key)}>
                  {done ? "Готово" : "Отметить"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!red && (
        <button type="button" className="btn btn-primary mt-3" onClick={() => void complete()}>
          Завершить действия
        </button>
      )}
      </div>
    </div>
  );
}
