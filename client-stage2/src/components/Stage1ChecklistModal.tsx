import { useEffect, useState } from "react";
import { apiJson } from "../api";

type Stage1Summary = {
  full_name: string;
  priority_name: string;
  actions_completed_at?: string | null;
  step1: Record<string, string | number | undefined>;
  step2: { position?: string; urgency_criteria?: string[]; infection_signs?: string[] };
  step3: Record<string, string | number | undefined>;
};

type Props = {
  patientId: number;
  open: boolean;
  onClose: () => void;
};

export default function Stage1ChecklistModal({ patientId, open, onClose }: Props) {
  const [data, setData] = useState<Stage1Summary | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr("");
    void (async () => {
      try {
        const r = await apiJson<Stage1Summary>(`/api/v1/stage2/patients/${patientId}/stage1_summary`);
        setData(r);
      } catch {
        setData(null);
        setErr("Не удалось загрузить данные этапа 1");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, patientId]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="stage1-checklist-title">
        <div className="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5 mb-0" id="stage1-checklist-title">
                Чек-лист этапа 1
              </h2>
              <button type="button" className="btn-close" aria-label="Закрыть" onClick={onClose} />
            </div>
            <div className="modal-body">
              {loading && <div className="text-muted">Загрузка…</div>}
              {err && <div className="alert alert-warning py-2">{err}</div>}
              {data && (
                <div className="d-grid gap-3">
                  <div>
                    <strong>{data.full_name}</strong>
                    <div className="small text-muted">
                      Приоритет этапа 1: <strong>{data.priority_name}</strong>
                      {data.actions_completed_at ? ` · Завершено ${data.actions_completed_at}` : ""}
                    </div>
                  </div>
                  <section>
                    <h3 className="h6">Шаг 1 — уровень сознания</h3>
                    <div className={`triage-score-box mb-2 ${Number(data.step1.total_consciousness_score) > 0 && Number(data.step1.total_consciousness_score) <= 8 ? "triage-score-box--alert" : ""}`}>
                      <div className="small text-muted">Сумма баллов (уровень сознания)</div>
                      <div className="triage-score-total">{data.step1.total_consciousness_score ?? "—"}</div>
                      <div className="small text-muted">Шкала Глазго</div>
                    </div>
                    <ul className="small mb-0">
                      <li>Открывание глаз: {data.step1.eye_opening || "—"}</li>
                      <li>Речевая реакция: {data.step1.verbal_response || "—"}</li>
                      <li>Двигательная реакция: {data.step1.motor_response || "—"}</li>
                      <li>Дыхание: {data.step1.breathing || "—"}</li>
                      <li>Сердцебиение: {data.step1.heartbeat || "—"}</li>
                      <li>Судороги: {data.step1.seizures || "—"}</li>
                      <li>Кровотечение: {data.step1.active_bleeding || "—"}</li>
                    </ul>
                  </section>
                  <section>
                    <h3 className="h6">Шаг 2 — опрос</h3>
                    <ul className="small mb-0">
                      <li>Положение: {data.step2.position || "—"}</li>
                      <li>
                        Критерии неотложности:{" "}
                        {data.step2.urgency_criteria?.length ? data.step2.urgency_criteria.join("; ") : "—"}
                      </li>
                      <li>
                        Инфекционные признаки:{" "}
                        {data.step2.infection_signs?.length ? data.step2.infection_signs.join("; ") : "—"}
                      </li>
                    </ul>
                  </section>
                  <section>
                    <h3 className="h6">Шаг 3 — витальные функции</h3>
                    <ul className="small mb-0">
                      <li>ЧДД: {data.step3.respiratory_rate ?? "—"}</li>
                      <li>SpO₂: {data.step3.saturation ?? "—"}</li>
                      <li>АД: {data.step3.systolic_bp ?? "—"}/{data.step3.diastolic_bp ?? "—"}</li>
                      <li>ЧСС: {data.step3.heart_rate ?? "—"}</li>
                      <li>Температура: {data.step3.temperature ?? "—"}</li>
                    </ul>
                  </section>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
