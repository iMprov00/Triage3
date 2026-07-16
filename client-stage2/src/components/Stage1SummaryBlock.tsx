type Stage1Summary = {
  priority_name: string;
  actions_completed_at?: string | null;
  stopped_at_step?: number | null;
  stopped_at_step_note?: string | null;
  step1: Record<string, string | number | undefined>;
  step2: { position?: string; urgency_criteria?: string[]; infection_signs?: string[] };
  step3: Record<string, string | number | undefined>;
};

type Props = {
  stage1: Stage1Summary;
  compact?: boolean;
};

export default function Stage1SummaryBlock({ stage1, compact }: Props) {
  const urgency = stage1.step2.urgency_criteria?.length
    ? stage1.step2.urgency_criteria.join("; ")
    : "—";
  const infection = stage1.step2.infection_signs?.length
    ? stage1.step2.infection_signs.join("; ")
    : "—";
  const vitalsLine = `ЧДД ${stage1.step3.respiratory_rate ?? "—"}, SpO₂ ${stage1.step3.saturation ?? "—"}, АД ${stage1.step3.systolic_bp ?? "—"}/${stage1.step3.diastolic_bp ?? "—"}, ЧСС ${stage1.step3.heart_rate ?? "—"}, t° ${stage1.step3.temperature ?? "—"}`;

  return (
    <div className={compact ? "small" : ""}>
      <div className="mb-2">
        Приоритет: <strong>{stage1.priority_name || "—"}</strong>
        {stage1.actions_completed_at ? ` · Завершено ${stage1.actions_completed_at}` : ""}
      </div>
      {stage1.stopped_at_step_note ? (
        <div className="alert alert-light border small py-2 mb-2 text-muted">{stage1.stopped_at_step_note}</div>
      ) : null}
      <ul className="mb-0">
        <li>
          Баллы шага 1 (уровень сознания): сумма{" "}
          <strong>{stage1.step1.total_consciousness_score ?? "—"}</strong>
          {stage1.step1.eye_score != null ? (
            <span className="text-muted"> (Шкала Глазго)</span>
          ) : null}
        </li>
        <li>Открывание глаз: {stage1.step1.eye_opening || "—"}</li>
        <li>Речевая реакция: {stage1.step1.verbal_response || "—"}</li>
        <li>Двигательная реакция: {stage1.step1.motor_response || "—"}</li>
        <li>Дыхание: {stage1.step1.breathing || "—"}</li>
        <li>Сердцебиение: {stage1.step1.heartbeat || "—"}</li>
        <li>Судороги: {stage1.step1.seizures || "—"}</li>
        <li>Активное кровотечение: {stage1.step1.active_bleeding || "—"}</li>
        <li>Положение: {stage1.step2.position || "—"}</li>
        <li>Критерии неотложности: {urgency}</li>
        <li>Инфекционные признаки: {infection}</li>
        <li>Витальные функции: {vitalsLine}</li>
      </ul>
    </div>
  );
}
