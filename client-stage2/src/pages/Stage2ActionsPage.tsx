import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";

type ActionDef = { key: string; text?: string; final?: boolean; completed?: boolean };

type TriageState = {
  priority: string;
  priority_name?: string;
  priority_actions: ActionDef[];
  actions_data: Record<string, unknown>;
  actions_completed_at?: string | null;
  can_complete_actions?: boolean;
  workflow_route: string;
};

function priorityClass(priority: string): string {
  const p = priority.toLowerCase();
  if (["red", "yellow", "orange", "grey", "green"].includes(p)) return p;
  return "neutral";
}

export default function Stage2ActionsPage() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [triage, setTriage] = useState<TriageState | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const r = await apiJson<{ triage: TriageState }>(`/api/v1/stage2/patients/${patientId}/triage/actions`);
      setTriage(r.triage);
      setErr("");
      if (r.triage.workflow_route === "completed" || r.triage.actions_completed_at) {
        nav(`/patients/${patientId}/actions/report`, { replace: true });
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

  async function mark(key: string) {
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/actions/mark`, {
        method: "POST",
        json: { triage_action: key },
      });
      await load();
    } catch {
      setErr("Ошибка отметки");
    }
  }

  async function complete() {
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/actions/complete`, { method: "POST", json: {} });
      nav(`/patients/${patientId}/actions/report`);
    } catch {
      setErr("Не все действия выполнены");
    }
  }

  if (!triage) {
    return (
      <div className="container-fluid triag-page-wide">
        <div className="triage-page-shell py-2 py-sm-3">{err || "Загрузка…"}</div>
      </div>
    );
  }

  const actions = triage.priority_actions || [];
  const actionsData = triage.actions_data || {};
  const tone = priorityClass(triage.priority);

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head">
          <Link to="/patients" className="triage-back-link">
            ← Пациенты
          </Link>
          <h1 className="h4 triage-page-title">Действия по приоритету</h1>
          <p className="text-muted small mb-0">
            Приоритет: <span className={`patient-tag patient-tag--priority patient-tag--${tone}`}>{triage.priority_name}</span>
          </p>
        </div>

        {err && <div className="alert alert-danger py-2">{err}</div>}

        <div className="triage-simple-actions">
          {actions.map((a) => {
            const done = Boolean(actionsData[a.key]);
            const completedAt = actionsData[a.key];
            return (
              <div
                key={a.key}
                className={`triage-simple-action-row triage-simple-action-row--${tone}${done ? " triage-simple-action-row--done" : ""}`}
              >
                <div className="triage-simple-action-main">
                  <div className="triage-simple-action-badges">
                    {a.final ? <span className="triage-simple-action-badge triage-simple-action-badge--final">Финал</span> : null}
                  </div>
                  <div className="triage-simple-action-title">{a.text || a.key}</div>
                  {a.final ? (
                    <div className="triage-simple-action-hint">
                      Завершающее действие фазы — отметьте после выполнения остальных пунктов.
                    </div>
                  ) : null}
                  {done && completedAt != null && (
                    <div className="triage-simple-action-time text-muted">
                      Выполнено: {new Date(Number(completedAt) * 1000).toLocaleString("ru-RU")}
                    </div>
                  )}
                </div>
                {!triage.actions_completed_at && (
                  <button
                    type="button"
                    className={`btn ${done ? "btn-success" : "btn-outline-primary"} triage-simple-action-btn`}
                    onClick={() => void mark(a.key)}
                  >
                    {done ? "Готово" : "Выполнено"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!triage.actions_completed_at && (
          <button
            type="button"
            className="btn btn-primary mt-3 triage-simple-actions-complete"
            disabled={!triage.can_complete_actions}
            onClick={() => void complete()}
          >
            Завершить триаж этапа 2
          </button>
        )}
      </div>
    </div>
  );
}
