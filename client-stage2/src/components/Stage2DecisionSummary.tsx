import { useEffect, useState } from "react";
import { apiJson } from "../api";

type InvestigationRow = { key: string; label: string; done: boolean };

type DecisionSummary = {
  full_name: string;
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
  const vitals = pd.vitals || {};

  return (
    <div className={`d-grid gap-3 ${compact ? "small" : ""}`}>
      <section>
        <h3 className="h6 mb-2">Этап 1</h3>
        <div className="text-muted small mb-2">
          Приоритет: <strong>{data.stage1.priority_name}</strong>
          {data.stage1.actions_completed_at ? ` · Завершено ${data.stage1.actions_completed_at}` : ""}
        </div>
        <ul className="small mb-0">
          <li>Открывание глаз: {data.stage1.step1.eye_opening || "—"}</li>
          <li>Речевая реакция: {data.stage1.step1.verbal_response || "—"}</li>
          <li>Двигательная реакция: {data.stage1.step1.motor_response || "—"}</li>
          <li>Дыхание: {data.stage1.step1.breathing || "—"}</li>
          <li>Сердцебиение: {data.stage1.step1.heartbeat || "—"}</li>
          <li>Судороги: {data.stage1.step1.seizures || "—"}</li>
          <li>Кровотечение: {data.stage1.step1.active_bleeding || "—"}</li>
          <li>Положение: {data.stage1.step2.position || "—"}</li>
          <li>
            Критерии неотложности:{" "}
            {data.stage1.step2.urgency_criteria?.length ? data.stage1.step2.urgency_criteria.join("; ") : "—"}
          </li>
          <li>
            Инфекционные признаки:{" "}
            {data.stage1.step2.infection_signs?.length ? data.stage1.step2.infection_signs.join("; ") : "—"}
          </li>
          <li>
            Витальные: ЧДД {data.stage1.step3.respiratory_rate ?? "—"}, SpO₂ {data.stage1.step3.saturation ?? "—"}, АД{" "}
            {data.stage1.step3.systolic_bp ?? "—"}/{data.stage1.step3.diastolic_bp ?? "—"}, ЧСС{" "}
            {data.stage1.step3.heart_rate ?? "—"}, t° {data.stage1.step3.temperature ?? "—"}
          </li>
        </ul>
      </section>

      <section>
        <h3 className="h6 mb-2">Доврачебный этап (шаг 1 этапа 2)</h3>
        <ul className="small mb-0">
          <li>Выделения: {pd.discharge || "—"}</li>
          <li>Сердцебиение плода: {pd.fetal_heart_rate || "—"}</li>
          <li>Маточный тонус: {pd.uterine_tone || "—"}</li>
          {pd.contraction_duration_sec != null && (
            <li>
              Схватки: {pd.contraction_duration_sec} сек
              {pd.contraction_interval_min != null ? ` через ${pd.contraction_interval_min} мин` : ", нерегулярные"}
            </li>
          )}
          <li>Боль по ВАШ: {pd.pain_vas ?? "—"}</li>
          <li>
            Кожные покровы: {pd.skin_finding || "—"}
            {pd.edema_location ? ` (${pd.edema_location})` : ""}
          </li>
          <li>
            Витальные: АД {vitals.systolic_bp ?? "—"}/{vitals.diastolic_bp ?? "—"}, ЧСС {vitals.heart_rate ?? "—"}, ЧД{" "}
            {vitals.respiratory_rate ?? "—"}, SpO₂ {vitals.saturation ?? "—"}
          </li>
          {pd.investigations && pd.investigations.length > 0 && (
            <li>
              Исследования:{" "}
              {pd.investigations
                .filter((i) => i.done)
                .map((i) => i.label)
                .join(", ") || "не отмечены"}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
