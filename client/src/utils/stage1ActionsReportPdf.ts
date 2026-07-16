import type { PdfSection } from "./triageReportPdf";
import { openHospitalPdf } from "./triageReportPdf";
import { formatActionDisplay } from "./actionDisplayText";
import { filterActionTimeline } from "./auditTimelineFilter";

type AuditEvent = {
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
  urgency_criteria: string[];
  infection_signs: string[];
};

type PatientInfo = {
  id?: number;
  full_name?: string;
  admission_date?: string;
  admission_time?: string;
  birth_date?: string | null;
  appeal_type?: string;
  pregnancy_display?: string;
  performer_name?: string;
  created_at?: string;
};

type StatisticsResponse = {
  patients?: PatientInfo[];
  selected_patient_id?: number | null;
  triage?: {
    priority_name?: string;
    actions_started_at?: string | null;
    actions_completed_at?: string | null;
  } | null;
  audit_events?: AuditEvent[];
  step_timing?: StepTimingRow[] | null;
  actions_phase?: {
    seconds_used: number;
    within_limit: boolean | null;
  } | null;
};

function formatAdmissionDate(value: string | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatBirthDate(value: string | null | undefined): string {
  if (!value) return "Неизвестно";
  return formatAdmissionDate(value);
}

function buildPatientRows(patient: PatientInfo | undefined) {
  return [
    { label: "ФИО", value: patient?.full_name || "—" },
    { label: "Дата поступления", value: formatAdmissionDate(patient?.admission_date) },
    { label: "Время поступления", value: patient?.admission_time || "—" },
    { label: "Дата рождения", value: formatBirthDate(patient?.birth_date) },
    { label: "Вид обращения", value: patient?.appeal_type || "—" },
    { label: "Срок беременности", value: patient?.pregnancy_display || "—" },
    { label: "Исполнитель", value: patient?.performer_name || "—" },
    { label: "Зарегистрирован", value: patient?.created_at || "—" },
  ];
}

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
  saturation: "SpO₂",
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU");
}

function printableValue(value: unknown): string {
  if (value === true) return "Да";
  if (value === false) return "Нет";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (value == null || String(value).trim() === "") return "—";
  return String(value);
}

function decodeCatalogSelections(raw: unknown, catalog: string[]): string {
  if (!Array.isArray(raw) || catalog.length === 0) return "—";
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item).trim();
    if (/^\d+$/.test(s)) {
      const idx = parseInt(s, 10);
      if (idx >= 0 && idx < catalog.length) out.push(catalog[idx]);
    } else if (catalog.includes(s)) {
      out.push(s);
    } else if (s) {
      out.push(s);
    }
  }
  return out.length ? out.join("; ") : "—";
}

function formatStepValue(key: string, val: unknown, stepNum: number, opts: TriageOptions | null): string {
  if (stepNum === 2 && opts && (key === "urgency_criteria" || key === "infection_signs")) {
    const catalog = key === "urgency_criteria" ? opts.urgency_criteria : opts.infection_signs;
    return decodeCatalogSelections(val, catalog);
  }
  return printableValue(val);
}

export async function openStage1ActionsReportPdf(
  data: StatisticsResponse,
  triageOpts: TriageOptions | null,
): Promise<void> {
  const patient =
    (data.patients || []).find((p) => p.id === data.selected_patient_id) ?? data.patients?.[0];
  const actionTimeline = filterActionTimeline(data.audit_events || []);
  const stepsTimeline = (data.audit_events || []).filter((e) =>
    ["step1_submitted", "step2_submitted", "step3_submitted"].includes(e.event_type),
  );

  const sections: PdfSection[] = [];

  sections.push({
    type: "keyValue",
    heading: "1. Сводные данные триажа",
    items: [
      { label: "Приоритет", value: data.triage?.priority_name || "—" },
      {
        label: "Статус действий",
        value: data.triage?.actions_completed_at ? "Завершены" : "В процессе",
      },
      { label: "Начало действий", value: fmtDate(data.triage?.actions_started_at) },
      { label: "Завершение действий", value: fmtDate(data.triage?.actions_completed_at) },
      {
        label: "Время фазы действий",
        value: `${secToMin(data.actions_phase?.seconds_used)}${
          data.actions_phase?.within_limit === false ? " (превышен лимит)" : ""
        }`,
      },
    ],
  });

  let sectionNo = 2;
  for (const ev of stepsTimeline) {
    const stepNum = Number(ev.payload?.step);
    const stepValues = (ev.payload?.step_values || {}) as Record<string, unknown>;
    const items = Object.entries(stepValues).map(([key, val]) => ({
      label: STEP_FIELD_LABELS[key] || key,
      value: formatStepValue(key, val, Number.isFinite(stepNum) ? stepNum : 0, triageOpts),
    }));
    sections.push({
      type: "keyValue",
      heading: `${sectionNo}.${Number.isFinite(stepNum) ? stepNum : "?"}. Журнал шага ${Number.isFinite(stepNum) ? stepNum : "—"} (${fmtDate(ev.occurred_at)})`,
      items: items.length > 0 ? items : [{ label: "Данные", value: "Не зафиксированы" }],
    });
    sectionNo += 1;
  }

  const actionRows = actionTimeline.map((ev) => {
    const action =
      ev.event_type === "actions_completed"
        ? ev.event_label || "Действия завершены"
        : formatActionDisplay(ev);
    const prefix =
      ev.event_type === "priority_action_unmarked" ? "[отмена] " : ev.event_type === "actions_completed" ? "[финал] " : "";
    return [fmtDate(ev.occurred_at), `${prefix}${action}`, String(ev.payload?.performer_name || "—")];
  });
  sections.push({
    type: "table",
    heading: `${sectionNo}. Журнал действий по времени`,
    headers: ["Время", "Действие", "Исполнитель"],
    rows: actionRows,
  });

  await openHospitalPdf({
    documentTitle: "ИТОГОВЫЙ ДОКУМЕНТ ТРИАЖА",
    subtitle: "Этап 1 · Приемное отделение",
    patientRows: buildPatientRows(patient),
    sections,
  });
}
