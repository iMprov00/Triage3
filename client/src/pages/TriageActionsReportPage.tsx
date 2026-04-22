import { useEffect, useMemo, useState, type ReactNode } from "react";
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

type StepTimingRow = {
  step: number;
  name: string;
  limit_seconds: number;
  seconds_used: number | null;
  within_limit: boolean | null;
};

type TriageOptions = {
  positions: string[];
  urgency_criteria: string[];
  infection_signs: string[];
};

type StatisticsResponse = {
  patients?: Array<{ id: number; full_name?: string }>;
  selected_patient_id?: number | null;
  triage?: {
    priority?: string;
    priority_name?: string;
    actions_started_at?: string | null;
    actions_completed_at?: string | null;
  } | null;
  audit_events?: AuditEvent[];
  step_timing?: StepTimingRow[] | null;
  actions_phase?: {
    limit_seconds: number;
    seconds_used: number;
    within_limit: boolean | null;
    completed: boolean;
  } | null;
  total_seconds?: number | null;
};

const STEP_FIELD_LABELS: Record<string, string> = {
  eye_opening: "Открывание глаз",
  verbal_response: "Речевая реакция",
  motor_response: "Двигательная реакция",
  breathing: "Дыхание",
  heartbeat: "Сердцебиение",
  seizures: "Судороги",
  active_bleeding: "Активное кровотечение",
  position: "Положение",
  urgency_criteria: "Критерии неотложности",
  infection_signs: "Признаки инфекции",
  respiratory_rate: "ЧДД",
  saturation: "SpO2",
  systolic_bp: "Систолическое АД",
  diastolic_bp: "Диастолическое АД",
  heart_rate: "ЧСС",
  temperature: "Температура",
};

function secToMin(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function boolRu(value: unknown): string | null {
  if (value === true) return "Да";
  if (value === false) return "Нет";
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "true") return "Да";
  if (s === "false") return "Нет";
  return null;
}

function printableValue(value: unknown): string {
  const bool = boolRu(value);
  if (bool) return bool;
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => String(v)).join(", ");
  }
  if (value == null || String(value).trim() === "") return "—";
  return String(value);
}

/** Шаг 2: в аудите хранятся индексы пунктов (строки "0".."n"), см. TriageStep2Page.buildStep2Payload */
function decodeCatalogSelections(raw: unknown, catalog: string[]): string[] {
  if (!Array.isArray(raw) || catalog.length === 0) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (item === true || item === "true") {
      out.push("Отмечено (устаревший формат)");
      continue;
    }
    const s = String(item).trim();
    if (/^\d+$/.test(s)) {
      const idx = parseInt(s, 10);
      if (idx >= 0 && idx < catalog.length) out.push(catalog[idx]);
      else out.push(`Неизвестный пункт №${s}`);
    } else if (catalog.includes(s)) {
      out.push(s);
    } else if (s !== "") {
      out.push(s);
    }
  }
  return out;
}

function formatJournalFieldValue(key: string, val: unknown, stepNum: number, opts: TriageOptions | null): ReactNode {
  if (stepNum === 2 && opts && (key === "urgency_criteria" || key === "infection_signs")) {
    const catalog = key === "urgency_criteria" ? opts.urgency_criteria : opts.infection_signs;
    const lines = decodeCatalogSelections(val, catalog);
    if (lines.length === 0) return "—";
    return (
      <div className="triage-report-value-list">
        {lines.map((line, i) => (
          <div key={i} className="triage-report-value-line">
            {line}
          </div>
        ))}
      </div>
    );
  }

  const tone = stepNum === 3 ? step3FieldTone(key, val) : "normal";
  const text = printableValue(val);
  if (tone === "danger") {
    return (
      <span className="triage-report-chip triage-report-chip--danger">
        {text} ↓
      </span>
    );
  }
  if (tone === "warn") {
    return (
      <span className="triage-report-chip triage-report-chip--warn">
        {text} ⚠
      </span>
    );
  }
  return text;
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function step3FieldTone(key: string, value: unknown): "normal" | "warn" | "danger" {
  const n = numberOrNull(value);
  if (n == null) return "normal";
  if (key === "respiratory_rate") return n < 16 || n > 24 ? "warn" : "normal";
  if (key === "saturation") return n < 93 ? "danger" : "normal";
  if (key === "systolic_bp") return n >= 140 ? "warn" : "normal";
  if (key === "diastolic_bp") return n >= 90 ? "warn" : "normal";
  if (key === "heart_rate") return n < 50 || n > 110 ? "warn" : "normal";
  if (key === "temperature") return n >= 37.5 ? "warn" : "normal";
  return "normal";
}

export default function TriageActionsReportPage() {
  const { patientId } = useParams();
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [triageOpts, setTriageOpts] = useState<TriageOptions | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await apiJson<StatisticsResponse>(`/api/v1/statistics?patient_id=${patientId}`);
        if (!active) return;
        setData(r);
        setErr("");
        try {
          const o = await apiJson<TriageOptions>("/api/v1/meta/triage_options");
          if (!active) return;
          setTriageOpts(o);
        } catch {
          if (!active) return;
          setTriageOpts(null);
        }
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
    const events = data?.audit_events || [];
    return events.filter(
      (e) =>
        e.event_type === "priority_action_marked" ||
        e.event_type === "priority_action_unmarked" ||
        e.event_type === "actions_completed",
    );
  }, [data?.audit_events]);

  const stepsTimeline = useMemo(() => {
    const events = data?.audit_events || [];
    return events.filter((e) =>
      e.event_type === "step1_submitted" ||
      e.event_type === "step2_submitted" ||
      e.event_type === "step3_submitted",
    );
  }, [data?.audit_events]);

  const patientName = useMemo(() => {
    const selectedId = data?.selected_patient_id;
    const fromList = (data?.patients || []).find((p) => p.id === selectedId);
    if (fromList?.full_name && fromList.full_name.trim() !== "") return fromList.full_name;
    return "—";
  }, [data?.patients, data?.selected_patient_id]);

  return (
    <div className="container-fluid triag-page-wide triage-report-page">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head">
          <Link to="/patients" className="triage-back-link">← Пациенты</Link>
          <h1 className="h4 triage-page-title">Итоговый документ действий</h1>
        </div>

        {err && <div className="alert alert-danger py-2">{err}</div>}
        {!err && !data && <div className="text-muted">Загрузка...</div>}

        {!err && data && (
          <>
            <div className="card mb-3 shadow-sm">
              <div className="card-body">
                <div className="row g-2 small">
                  <div className="col-md-4">
                    <div className="text-muted">Пациент</div>
                    <div className="fw-semibold">{patientName}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Приоритет</div>
                    <div className="fw-semibold">{data.triage?.priority_name || "—"}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Статус действий</div>
                    <div className="fw-semibold">
                      {data.triage?.actions_completed_at ? (
                        <span className="triage-report-chip triage-report-chip--ok">✓ Завершены</span>
                      ) : (
                        <span className="triage-report-chip triage-report-chip--warn">◔ В процессе</span>
                      )}
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Начало действий</div>
                    <div>{data.triage?.actions_started_at ? new Date(data.triage.actions_started_at).toLocaleString("ru-RU") : "—"}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Завершение действий</div>
                    <div>{data.triage?.actions_completed_at ? new Date(data.triage.actions_completed_at).toLocaleString("ru-RU") : "—"}</div>
                  </div>
                  <div className="col-md-4">
                    <div className="text-muted">Фаза действий (затрачено)</div>
                    <div>
                      <span
                        className={`triage-report-chip ${
                          data.actions_phase?.within_limit === false
                            ? "triage-report-chip--danger"
                            : "triage-report-chip--ok"
                        }`}
                      >
                        ⏱ {secToMin(data.actions_phase?.seconds_used)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Сводка по шагам триажа</div>
              <div className="card-body">
                <div className="border rounded p-3">
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Шаг</th>
                        <th>Название</th>
                        <th>Лимит</th>
                        <th>Факт</th>
                        <th>В лимите</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.step_timing || []).map((row) => (
                        <tr key={row.step} className={row.within_limit === false ? "triage-report-row--warn" : ""}>
                          <td>{row.step}</td>
                          <td>{row.name}</td>
                          <td>{secToMin(row.limit_seconds)}</td>
                          <td>{secToMin(row.seconds_used)}</td>
                          <td>
                            {row.within_limit == null ? (
                              "—"
                            ) : row.within_limit ? (
                              <span className="triage-report-chip triage-report-chip--ok">✓ Да</span>
                            ) : (
                              <span className="triage-report-chip triage-report-chip--warn">⚠ Нет</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!data.step_timing || data.step_timing.length === 0) && (
                        <tr>
                          <td colSpan={5} className="text-muted">Данные по шагам отсутствуют</td>
                        </tr>
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Журнал шагов</div>
              <div className="card-body">
                {stepsTimeline.length === 0 && <div className="text-muted">Записи по шагам отсутствуют</div>}
                {stepsTimeline.length > 0 && (
                  <div className="d-grid gap-3">
                    {stepsTimeline.map((ev) => {
                      const stepNum = Number(ev.payload?.step);
                      const stepValues = (ev.payload?.step_values || {}) as Record<string, unknown>;
                      const entries = Object.entries(stepValues);
                      return (
                        <div key={ev.id} className="border rounded p-3">
                          <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                            <div className="fw-semibold">Шаг {Number.isFinite(stepNum) ? stepNum : "—"}</div>
                            <div className="small text-muted">{new Date(ev.occurred_at).toLocaleString("ru-RU")}</div>
                          </div>
                          {entries.length === 0 ? (
                            <div className="small text-muted">Данные шага не зафиксированы</div>
                          ) : (
                            <div className="table-responsive">
                              <table className="table table-sm mb-0">
                                <tbody>
                                  {entries.map(([key, val]) => (
                                    <tr key={`${ev.id}-${key}`}>
                                      <td style={{ width: "38%" }} className="text-muted">
                                        {STEP_FIELD_LABELS[key] || key}
                                      </td>
                                      <td>{formatJournalFieldValue(key, val, Number.isFinite(stepNum) ? stepNum : 0, triageOpts)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                        <th style={{ minWidth: 160 }}>Исполнитель</th>
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
                            {ev.action_text || String(ev.payload?.action || "—")}
                          </td>
                          <td>{String(ev.payload?.performer_name || "—")}</td>
                        </tr>
                      ))}
                      {actionTimeline.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-muted">События действий отсутствуют</td>
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
