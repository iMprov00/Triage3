import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";
import Stage1ChecklistButton from "../components/Stage1ChecklistButton";

type ActionDef = { key: string; text?: string; final?: boolean; recommendation?: boolean; completed?: boolean };

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
  const recommendations = actions.filter((a) => a.recommendation);
  const markableActions = actions.filter((a) => !a.recommendation && a.final);
  const multipleFinals = markableActions.length > 1;
  const actionsData = triage.actions_data || {};
  const tone = priorityClass(triage.priority);

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head">
          <Link to="/patients" className="triage-back-link">
            ← Пациенты
          </Link>
          <h1 className="triag-page-heading mb-0">Действия по приоритету</h1>
          <span className="triage-page-head-meta text-muted">
            Приоритет: <span className={`patient-tag patient-tag--priority patient-tag--${tone}`}>{triage.priority_name}</span>
          </span>
          {patientId && <Stage1ChecklistButton patientId={Number(patientId)} />}
        </div>

        {err && <div className="alert alert-danger py-2">{err}</div>}

        {recommendations.length > 0 && (
          <div className="mb-4">
            <h2 className="h6 mb-2">Рекомендации к действиям</h2>
            <ul className="triage-action-recommendations mb-0">
              {recommendations.map((a) => (
                <li key={a.key}>{a.text || a.key}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="triage-simple-actions">
          {multipleFinals && !triage.actions_completed_at && (
            <p className="small text-muted mb-2">Выберите один исход</p>
          )}
          {markableActions.map((a) => {
            const done = Boolean(actionsData[a.key]);
            const completedAt = actionsData[a.key];
            return (
              <div
                key={a.key}
                className={`triage-simple-action-row triage-simple-action-row--${tone}${done ? " triage-simple-action-row--done" : ""}`}
              >
                <div className="triage-simple-action-main">
                  <div className="triage-simple-action-badges">
                    <span className="triage-simple-action-badge triage-simple-action-badge--final">
                      {multipleFinals ? "Итоговый исход" : "Отметка выполнения"}
                    </span>
                  </div>
                  <div className="triage-simple-action-title">{a.text || a.key}</div>
                  <div className="triage-simple-action-hint">
                    {multipleFinals
                      ? "Можно отметить только один итоговый исход."
                      : "Отметьте госпитализацию после выполнения рекомендованных действий."}
                  </div>
                  {done && completedAt != null && (
                    <div className="triage-simple-action-time text-muted">
                      Выполнено: {new Date(Number(completedAt) * 1000).toLocaleString("ru-RU")}
                    </div>
                  )}
                </div>
                {!triage.actions_completed_at && (
                  <button
                    type="button"
                    className={`btn triag-simple-action-btn ${done ? "triag-btn-primary btn-success" : "triag-btn-secondary"}`}
                    onClick={() => void mark(a.key)}
                  >
                    {multipleFinals ? (done ? "Выбрано" : "Выбрать") : done ? "Готово" : "Выполнено"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!triage.actions_completed_at && (
          <button
            type="button"
            className="btn btn-primary mt-3 triage-simple-actions-complete triag-btn-primary"
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
