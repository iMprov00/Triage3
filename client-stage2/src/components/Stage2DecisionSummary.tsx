import { useEffect, useState } from "react";
import { apiJson } from "../api";
import Stage1SummaryBlock from "./Stage1SummaryBlock";

type InvestigationRow = { key: string; label: string; done: boolean };

type DecisionSummary = {
  full_name: string;
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
    skin_color?: string;
    has_rash?: boolean;
    rash_description?: string;
    has_edema?: boolean;
    edema_location?: string;
    ctg_ordered?: boolean;
    ultrasound_ordered?: boolean;
    vitals?: Record<string, number>;
    doctor_called?: boolean;
    accepted_at?: string;
    completed_at?: string;
    duration_seconds?: number;
  };
  doctor_examination?: {
    investigations?: InvestigationRow[];
    lab_investigations?: InvestigationRow[];
    ctg?: { label: string; detail?: string };
    ultrasound?: { label: string; detail?: string };
    medical_conclusion?: string;
    completed_at?: string;
  };
  suggested_priority?: string;
  suggested_priority_name?: string;
  destination_hint?: string;
};

type Props = {
  patientId: number;
  compact?: boolean;
};

export default function Stage2DecisionSummary({ patientId, compact }: Props) {
  const [data, setData] = useState<DecisionSummary | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setErr("");
    void (async () => {
      try {
        const r = await apiJson<DecisionSummary>(`/api/v1/stage2/patients/${patientId}/decision_summary`);
        setData(r);
      } catch {
        setData(null);
        setErr("Не удалось загрузить историю");
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  if (loading) return <div className="text-muted small">Загрузка истории…</div>;
  if (err) return <div className="alert alert-warning py-2 small">{err}</div>;
  if (!data) return null;

  const pd = data.pre_doctor || {};
  const doc = data.doctor_examination || {};
  const vitals = pd.vitals || {};

  function formatDuration(sec?: number): string {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} мин ${s} сек`;
  }

  return (
    <div className={`d-grid gap-3 ${compact ? "small" : ""}`}>
      <section>
        <h3 className="h6 mb-2">Этап 1</h3>
        <Stage1SummaryBlock stage1={data.stage1} compact />
      </section>

      <section>
        <h3 className="h6 mb-2">Доврачебный осмотр (шаг 1)</h3>
        <ul className="small mb-0">
          <li>
            Кожные покровы: {pd.skin_color || "—"}
          </li>
          <li>
            Сыпь: {pd.has_rash ? pd.rash_description || "да" : "нет"}
          </li>
          <li>
            Отёки: {pd.has_edema ? pd.edema_location || "да" : "нет"}
          </li>
          <li>Маточный тонус: {pd.uterine_tone || "—"}</li>
          {pd.contraction_duration_sec != null && (
            <li>
              Схватки: {pd.contraction_duration_sec} сек
              {pd.contraction_interval_min != null ? ` через ${pd.contraction_interval_min} мин` : ", нерегулярные"}
            </li>
          )}
          <li>Боль по ВАШ: {pd.pain_vas ?? "—"}</li>
          <li>Сердцебиение плода: {pd.fetal_heart_rate || "—"}</li>
          <li>Выделения: {pd.discharge || "—"}</li>
          <li>
            Витальные функции: АД {vitals.systolic_bp ?? "—"}/{vitals.diastolic_bp ?? "—"}, ЧСС {vitals.heart_rate ?? "—"}, ЧД{" "}
            {vitals.respiratory_rate ?? "—"}, SpO₂ {vitals.saturation ?? "—"}
          </li>
          <li>Вызван врач: {pd.doctor_called ? "да" : "нет"}</li>
          {(pd.ctg_ordered || pd.ultrasound_ordered) && (
            <li>
              Назначено: {[pd.ctg_ordered ? "КТГ" : null, pd.ultrasound_ordered ? "УЗИ" : null].filter(Boolean).join(", ")}
            </li>
          )}
          {pd.duration_seconds != null && <li>Длительность доврачебного осмотра: {formatDuration(pd.duration_seconds)}</li>}
        </ul>
      </section>

      {doc.investigations && (
        <section>
          <h3 className="h6 mb-2">Врачебный осмотр (шаг 2)</h3>
          <ul className="small mb-0">
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
        </section>
      )}
    </div>
  );
}
