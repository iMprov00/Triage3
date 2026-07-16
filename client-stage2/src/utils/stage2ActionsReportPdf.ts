import type { PdfSection } from "./triageReportPdf";
import { openHospitalPdf } from "./triageReportPdf";
import { buildStage2JournalTimeline, formatStage2JournalEventText } from "./stage2JournalTimeline";

type AuditEvent = {
  event_type: string;
  event_label?: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
  action_text?: string | null;
};

type InvestigationRow = { label: string; done: boolean };

type PatientInfo = {
  full_name?: string;
  admission_date?: string;
  admission_time?: string;
  birth_date?: string | null;
  appeal_type?: string;
  pregnancy_display?: string;
  performer_name?: string;
  created_at?: string;
};

type ReportResponse = {
  full_name: string;
  patient?: PatientInfo;
  stage2_triage: {
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
      stopped_at_step_note?: string | null;
      step1: Record<string, string | undefined>;
      step2: { urgency_criteria?: string[]; position?: string; infection_signs?: string[] };
      step3: Record<string, string | number | undefined>;
    };
    pre_doctor: {
      discharge?: string;
      fetal_heart_rate?: string;
      uterine_tone?: string;
      pain_vas?: number;
      skin_finding?: string;
      edema_location?: string;
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
  };
  actions_phase?: { seconds_used: number } | null;
  workflow_events?: AuditEvent[];
  audit_events?: AuditEvent[];
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

function buildPatientRows(data: ReportResponse) {
  const patient = data.patient ?? { full_name: data.full_name };
  return [
    { label: "ФИО", value: patient.full_name || data.full_name || "—" },
    { label: "Дата поступления", value: formatAdmissionDate(patient.admission_date) },
    { label: "Время поступления", value: patient.admission_time || "—" },
    { label: "Дата рождения", value: formatBirthDate(patient.birth_date) },
    { label: "Вид обращения", value: patient.appeal_type || "—" },
    { label: "Срок беременности", value: patient.pregnancy_display || "—" },
    { label: "Исполнитель", value: patient.performer_name || "—" },
    { label: "Зарегистрирован", value: patient.created_at || "—" },
  ];
}

export async function openStage2ActionsReportPdf(data: ReportResponse): Promise<void> {
  const events = data.workflow_events || data.audit_events || [];
  const stageJournal = buildStage2JournalTimeline(events);

  const s1 = data.decision_summary?.stage1;
  const pd = data.decision_summary?.pre_doctor;
  const doc = data.decision_summary?.doctor_examination;

  const sections: PdfSection[] = [
    {
      type: "keyValue",
      heading: "1. Сводные данные этапа 2",
      items: [
        { label: "Приоритет этапа 2", value: data.stage2_triage.priority_name || "—" },
        { label: "Рекомендация алгоритма", value: data.stage2_triage.suggested_priority_name || "—" },
        {
          label: "Статус действий",
          value: data.stage2_triage.actions_completed_at ? "Завершены" : "В процессе",
        },
        { label: "Начало действий", value: fmtDate(data.stage2_triage.actions_started_at) },
        { label: "Завершение действий", value: fmtDate(data.stage2_triage.actions_completed_at) },
        { label: "Завершение триажа", value: fmtDate(data.stage2_triage.completed_at) },
        { label: "Время фазы действий", value: secToMin(data.actions_phase?.seconds_used) },
      ],
    },
    {
      type: "keyValue",
      heading: "2. Данные этапа 1",
      items: [
        { label: "Приоритет этапа 1", value: s1?.priority_name || "—" },
        { label: "Завершение этапа 1", value: s1?.actions_completed_at || "—" },
        ...(s1?.stopped_at_step_note ? [{ label: "Примечание", value: s1.stopped_at_step_note }] : []),
        { label: "Открывание глаз", value: s1?.step1.eye_opening || "—" },
        { label: "Речевая реакция", value: s1?.step1.verbal_response || "—" },
        { label: "Двигательная реакция", value: s1?.step1.motor_response || "—" },
        { label: "Дыхание", value: s1?.step1.breathing || "—" },
        { label: "Сердцебиение", value: s1?.step1.heartbeat || "—" },
        { label: "Судороги", value: s1?.step1.seizures || "—" },
        { label: "Активное кровотечение", value: s1?.step1.active_bleeding || "—" },
        { label: "Положение", value: s1?.step2.position || "—" },
        {
          label: "Критерии неотложности",
          value: s1?.step2.urgency_criteria?.length ? s1.step2.urgency_criteria.join("; ") : "—",
        },
        {
          label: "Инфекционные признаки",
          value: s1?.step2.infection_signs?.length ? s1.step2.infection_signs.join("; ") : "—",
        },
        {
          label: "Витальные показатели",
          value: `ЧДД ${s1?.step3.respiratory_rate ?? "—"}, SpO₂ ${s1?.step3.saturation ?? "—"}, АД ${s1?.step3.systolic_bp ?? "—"}/${s1?.step3.diastolic_bp ?? "—"}, ЧСС ${s1?.step3.heart_rate ?? "—"}, t° ${s1?.step3.temperature ?? "—"}`,
        },
      ],
    },
    {
      type: "keyValue",
      heading: "3. Доврачебный и врачебный осмотр",
      items: [
        { label: "Кожные покровы", value: `${pd?.skin_finding || "—"}${pd?.edema_location ? ` (${pd.edema_location})` : ""}` },
        { label: "Маточный тонус", value: pd?.uterine_tone || "—" },
        { label: "Боль по ВАШ", value: pd?.pain_vas != null ? String(pd.pain_vas) : "—" },
        { label: "Сердцебиение плода", value: pd?.fetal_heart_rate || "—" },
        { label: "Выделения", value: pd?.discharge || "—" },
        { label: "Вызван врач", value: pd?.doctor_called ? "да" : "нет" },
        ...(pd?.duration_seconds != null ? [{ label: "Длительность доврачебного осмотра", value: secToMin(pd.duration_seconds) }] : []),
        {
          label: "Исследования (врачебный осмотр)",
          value:
            [
              ...(doc?.investigations?.filter((i) => i.done).map((i) => i.label) || []),
              ...(doc?.lab_investigations?.filter((i) => i.done).map((i) => i.label) || []),
            ].join(", ") || "не отмечены",
        },
        ...(doc?.ctg
          ? [{ label: "КТГ", value: `${doc.ctg.label}${doc.ctg.detail ? ` — ${doc.ctg.detail}` : ""}` }]
          : []),
        ...(doc?.ultrasound
          ? [{ label: "УЗИ", value: `${doc.ultrasound.label}${doc.ultrasound.detail ? ` — ${doc.ultrasound.detail}` : ""}` }]
          : []),
        ...(doc?.medical_conclusion ? [{ label: "Врачебное заключение", value: doc.medical_conclusion }] : []),
      ],
    },
    {
      type: "table",
      heading: "4. Журнал этапов этапа 2",
      headers: ["Время", "Событие"],
      rows: stageJournal.map((ev) => [fmtDate(ev.occurred_at), formatStage2JournalEventText(ev)]),
    },
  ];

  await openHospitalPdf({
    documentTitle: "ИТОГОВЫЙ ДОКУМЕНТ ТРИАЖА",
    subtitle: "Этап 2 · Продолжение триажа",
    patientRows: buildPatientRows(data),
    sections,
  });
}
