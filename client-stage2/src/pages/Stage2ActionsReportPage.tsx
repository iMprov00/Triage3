import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";
import Stage1SummaryBlock from "../components/Stage1SummaryBlock";
import Stage1ChecklistButton from "../components/Stage1ChecklistButton";
import { openStage2ActionsReportPdf } from "../utils/stage2ActionsReportPdf";
import {
  buildStage2JournalTimeline,
  formatStage2JournalEventText,
  isStage2JournalActionEvent,
} from "../utils/stage2JournalTimeline";

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
      stopped_at_step?: number | null;
      stopped_at_step_note?: string | null;
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
      doctor_called?: boolean;
      duration_seconds?: number;
    };
    doctor_examination?: {
      investigations?: InvestigationRow[];
      lab_investigations?: InvestigationRow[];
      ctg?: { label: string; detail?: string };
      ultrasound?: { label: string; detail?: string };
      medical_conclusion?: string;
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
  const [printing, setPrinting] = useState(false);

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

  const stageJournal = useMemo(() => {
    const events = data?.workflow_events || data?.audit_events || [];
    return buildStage2JournalTimeline(events);
  }, [data?.workflow_events, data?.audit_events]);

  const pd = data?.decision_summary?.pre_doctor;
  const doc = data?.decision_summary?.doctor_examination;
  const s1 = data?.decision_summary?.stage1;

  async function handlePrint() {
    if (!data) return;
    setPrinting(true);
    try {
      await openStage2ActionsReportPdf(data);
    } catch {
      setErr("Не удалось сформировать PDF-документ");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="container-fluid triag-page-wide triage-report-page">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head">
          <Link to="/patients" className="triage-back-link">
            ← Пациенты
          </Link>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h1 className="triag-page-heading mb-0">Итоговый документ действий · Этап 2</h1>
            <div className="d-flex flex-wrap align-items-center gap-2">
              {patientId && <Stage1ChecklistButton patientId={Number(patientId)} />}
              {data && (
                <button
                  type="button"
                  className="btn btn-outline-primary triage-report-print-btn"
                  disabled={printing}
                  onClick={() => void handlePrint()}
                >
                  {printing ? "Формирование…" : "Напечатать"}
                </button>
              )}
            </div>
          </div>
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
                {s1 ? <Stage1SummaryBlock stage1={s1} /> : <div className="text-muted">Данные отсутствуют</div>}
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Доврачебный и врачебный осмотр</div>
              <div className="card-body small">
                <p className="fw-semibold mb-1">Доврачебный осмотр</p>
                <ul className="mb-3">
                  <li>Кожные покровы: {pd?.skin_finding || "—"}{pd?.edema_location ? ` (${pd.edema_location})` : ""}</li>
                  <li>Маточный тонус: {pd?.uterine_tone || "—"}</li>
                  <li>Боль по ВАШ: {pd?.pain_vas ?? "—"}</li>
                  <li>Сердцебиение плода: {pd?.fetal_heart_rate || "—"}</li>
                  <li>Выделения: {pd?.discharge || "—"}</li>
                  <li>Вызван врач: {pd?.doctor_called ? "да" : "нет"}</li>
                  {pd?.duration_seconds != null && <li>Длительность: {secToMin(pd.duration_seconds)}</li>}
                </ul>
                {doc && (
                  <>
                    <p className="fw-semibold mb-1">Врачебный осмотр</p>
                    <ul className="mb-0">
                      <li>
                        Исследования:{" "}
                        {[
                          ...(doc.investigations?.filter((i) => i.done).map((i) => i.label) || []),
                          ...(doc.lab_investigations?.filter((i) => i.done).map((i) => i.label) || []),
                        ].join(", ") || "не отмечены"}
                      </li>
                      {doc.ctg && (
                        <li>
                          КТГ: {doc.ctg.label}
                          {doc.ctg.detail ? ` — ${doc.ctg.detail}` : ""}
                        </li>
                      )}
                      {doc.ultrasound && (
                        <li>
                          УЗИ: {doc.ultrasound.label}
                          {doc.ultrasound.detail ? ` — ${doc.ultrasound.detail}` : ""}
                        </li>
                      )}
                      {doc.medical_conclusion && <li>Заключение: {doc.medical_conclusion}</li>}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="card mb-3 shadow-sm">
              <div className="card-header py-2 fw-semibold">Журнал этапов этапа 2</div>
              <div className="card-body">
                {stageJournal.length === 0 && <div className="text-muted">Записи отсутствуют</div>}
                {stageJournal.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 190 }}>Время</th>
                          <th>Событие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageJournal.map((ev) => (
                          <tr key={ev.id ?? `${ev.event_type}-${ev.occurred_at}`}>
                            <td>{new Date(ev.occurred_at).toLocaleString("ru-RU")}</td>
                            <td>
                              {isStage2JournalActionEvent(ev.event_type) && (
                                <span
                                  className={`triage-report-chip ${
                                    ev.event_type === "actions_completed"
                                      ? "triage-report-chip--ok"
                                      : "triage-report-chip--info"
                                  }`}
                                >
                                  {ev.event_type === "actions_completed" ? "✓" : "•"}
                                </span>
                              )}{" "}
                              {formatStage2JournalEventText(ev)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
