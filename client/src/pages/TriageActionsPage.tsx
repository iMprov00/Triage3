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

  if (!triage) return <div className="container py-3">{err || "Загрузка…"}</div>;

  return (
    <div className="container py-3">
      <Link to="/patients">← Пациенты</Link>
      <h1 className="h4 mt-2">Действия по приоритету</h1>
      {!red && triage.actions_started_at != null && (
        <div className="alert alert-info py-2 small">Фаза действий: {formatTimer(phaseRem)}</div>
      )}
      {!red && triage.brigade_timer_ends_at != null && (
        <div className="alert alert-warning py-2 small">
          Таймер бригады: {formatTimer(Math.max(0, Math.floor((triage.brigade_timer_ends_at as number) - Date.now() / 1000)))}
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
        <ul className="list-group">
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
  );
}
