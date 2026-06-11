import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";

type AuditEvent = {
  id: number;
  event_type: string;
  event_label?: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
  action_text?: string | null;
};

type InvestigationRow = { key: string; label: string; done: boolean };

type ReportResponse = {
  full_name: string;
  stage2_triage: {
    priority?: string;
    priority_name?: string;
    suggested_priority_name?: string;
    actions_started_at?: string | null;
    actions_completed_at?: string | null;
    completed_at?: string | null;
  };
  decision_summary: {
    stage1: {
      priority_name: string;
      actions_completed_at?: string | null;
      step1: Record<string, string | undefined>;
      step2: { position?: string; urgency_criteria?: string[]; infection_signs?: string[] };
      step3: Record<string, string | number | undefined>;
    };
    pre_doctor: {
      discharge?: string;
      fetal_heart_rate?: string;
      uterine_tone?: string;
      contraction_duration_sec?: number;
      contraction_interval_min?: number;
      pain_vas?: number;
      skin_finding?: string;
      edema_location?: string;
      vitals?: Record<string, number>;
      investigations?: InvestigationRow[];
    };
    decision_priorities?: Array<{ key: string; label: string; destination_hint?: string }>;
  };
  actions_phase?: {
    seconds_used: number;
    completed: boolean;
  } | null;
  workflow_events?: AuditEvent[];
  audit_events?: AuditEvent[];
};

function secToMin(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Stage2ActionsReportPage() {
  const { patientId } = useParams();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await apiJson<ReportResponse>(`/api/v1/stage2/statistics?patient_id=${patientId}`);
        if (!active) return;
        setData(r);
        setErr("");
      } catch {
        if (!active) return;
        setErr("Не удалось загрузить итоговый документ действий");
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  const actionTimeline = useMemo(() => {
    const events = data?.workflow_events || data?.audit_events || [];
    return events.filter(
      (e) =>
        e.event_type === "priority_action_marked" ||
        e.event_type === "priority_action_unmarked" ||
        e.event_type === "actions_completed",
    );
  }, [data?.workflow_events, data?.audit_events]);

  const workflowTimeline = useMemo(() => {
    const events = data?.workflow_events || data?.audit_events || [];
    return events.filter((e) =>
      ["pre_doctor_submitted", "suggested_priority_computed", "decision_confirmed"].includes(e.event_type),
    );
  }, [data?.workflow_events, data?.audit_events]);

  const pd = data?.decision_summary?.pre_doctor;
  const s1 = data?.decision_summary?.stage1;

  return (
    <div className="container-fluid triag-page-wide triage-report-page">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head">
          <Link to="/patients" className="triage-back-link">
            ← Пациенты
          </Link>
          <h1 className="h4 triage-page-title">Итоговый документ действий · Этап 2</h1>
        </div>

        {err && <div className="alert alert-danger py-2">{err}</div>}
        {!err && !data && <div className="text-muted">Загрузка…</div>}

        {!err && data && (
          <>
            <div className="card mb-3 shadow-sm">
              <div className="card-body">
                <div className="row g-2 small">
                  <div className="col-md-4">
                    <div className="text-muted">Пациент</div>
                    <div className="fw-semibold">{data.full_name}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Приоритет этапа 2</div>
                    <div className="fw-semibold">{data.stage2_triage.priority_name || "—"}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Рекомендация алгоритма</div>
                    <div className="fw-semibold">{data.stage2_triage.suggested_priority_name || "—"}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Статус действий</div>
                    <div className="fw-semibold">
                      {data.stage2_triage.actions_completed_at ? (
                        <span className="triage-report-chip triage-report-chip--ok">✓ Завершены</span>
                      ) : (
                        <span className="triage-report-chip triage-report-chip--warn">◔ В процессе</span>
                      )}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Начало действий</div>
                    <div>
                      {data.stage2_triage.actions_started_at
                        ? new Date(data.stage2_triage.actions_started_at).toLocaleString("ru-RU")
                        : "—"}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Завершение действий</div>
                    <div>
                      {data.stage2_triage.actions_completed_at
                        ? new Date(data.stage2_triage.actions_completed_at).toLocaleString("ru-RU")
                        : "—"}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Фаза действий (затрачено)</div>
                    <div>
                      <span className="triage-report-chip triage-report-chip--ok">
                        ⏱ {secToMin(data.actions_phase?.seconds_used)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Данные этапа 1</div>
              <div className="card-body small">
                <div className="mb-2">
                  Приоритет: <strong>{s1?.priority_name || "—"}</strong>
                  {s1?.actions_completed_at ? ` · Завершено ${s1.actions_completed_at}` : ""}
                </div>
                <ul className="mb-0">
                  <li>
                    Витальные: ЧДД {s1?.step3.respiratory_rate ?? "—"}, SpO₂ {s1?.step3.saturation ?? "—"}, АД{" "}
                    {s1?.step3.systolic_bp ?? "—"}/{s1?.step3.diastolic_bp ?? "—"}, ЧСС {s1?.step3.heart_rate ?? "—"}
                  </li>
                  <li>
                    Критерии неотложности:{" "}
                    {s1?.step2.urgency_criteria?.length ? s1.step2.urgency_criteria.join("; ") : "—"}
                  </li>
                </ul>
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Доврачебный этап и решение</div>
              <div className="card-body small">
                <ul className="mb-0">
                  <li>Выделения: {pd?.discharge || "—"}</li>
                  <li>Сердцебиение плода: {pd?.fetal_heart_rate || "—"}</li>
                  <li>Маточный тонус: {pd?.uterine_tone || "—"}</li>
                  <li>Боль по ВАШ: {pd?.pain_vas ?? "—"}</li>
                  <li>
                    Кожные покровы: {pd?.skin_finding || "—"}
                    {pd?.edema_location ? ` (${pd.edema_location})` : ""}
                  </li>
                  <li>
                    Исследования:{" "}
                    {pd?.investigations?.filter((i) => i.done).map((i) => i.label).join(", ") || "не отмечены"}
                  </li>
                </ul>
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Журнал этапов этапа 2</div>
              <div className="card-body">
                {workflowTimeline.length === 0 && <div className="text-muted">Записи отсутствуют</div>}
                {workflowTimeline.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 190 }}>Время</th>
                          <th>Событие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workflowTimeline.map((ev) => (
                          <tr key={ev.id}>
                            <td>{new Date(ev.occurred_at).toLocaleString("ru-RU")}</td>
                            <td>{ev.event_label || ev.event_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="card shadow-sm">
              <div className="card-header py-2 fw-semibold">Журнал действий по времени</div>
              <div className="card-body">
                <div className="border rounded p-3">
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 190 }}>Время</th>
                          <th>Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionTimeline.map((ev) => (
                          <tr key={ev.id}>
                            <td>{new Date(ev.occurred_at).toLocaleString("ru-RU")}</td>
                            <td>
                              <span
                                className={`triage-report-chip ${
                                  ev.event_type === "priority_action_unmarked"
                                    ? "triage-report-chip--muted"
                                    : ev.event_type === "actions_completed"
                                      ? "triage-report-chip--ok"
                                      : "triage-report-chip--info"
                                }`}
                              >
                                {ev.event_type === "priority_action_unmarked"
                                  ? "↺"
                                  : ev.event_type === "actions_completed"
                                    ? "✓"
                                    : "•"}
                              </span>{" "}
                              {ev.event_type === "actions_completed"
                                ? ev.event_label || "Действия завершены"
                                : ev.action_text || String(ev.payload?.action || "—")}
                            </td>
                          </tr>
                        ))}
                        {actionTimeline.length === 0 && (
                          <tr>
                            <td colSpan={2} className="text-muted">
                              События действий отсутствуют
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
