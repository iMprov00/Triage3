import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiJson } from "../api";

type PhaseInfo = { key: string; label: string };

type TriageState = {
  current_phase: string;
  phase_label: string;
  phases: PhaseInfo[];
  stage1_priority_name?: string | null;
  can_advance: boolean;
  completed_at?: string | null;
};

const FLOW_STEPS = [
  { key: "start", label: "Точка начала" },
  { key: "pre_doctor", label: "Доврачебный осмотр" },
  { key: "doctor", label: "Врачебный осмотр" },
  { key: "decision", label: "Решение" },
  { key: "doctor", label: "Врачебный" },
  { key: "action", label: "Действие" },
  { key: "exit", label: "Выход" },
];

function stepIndex(phase: string): number {
  const idx = FLOW_STEPS.findIndex((s) => s.key === phase);
  return idx >= 0 ? idx : 1;
}

export default function WorkflowStubPage() {
  const { patientId } = useParams();
  const [state, setState] = useState<TriageState | null>(null);
  const [patientName, setPatientName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!patientId) return;
    try {
      const [triage, details] = await Promise.all([
        apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
        apiJson<{ patient: { full_name: string } }>(`/api/v1/stage2/patients/${patientId}`),
      ]);
      setState(triage);
      setPatientName(details.patient.full_name);
      setErr("");
    } catch {
      setErr("Не удалось загрузить данные этапа 2");
    }
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  async function advance() {
    if (!patientId || !state?.can_advance) return;
    setBusy(true);
    try {
      const r = await apiJson<{ stage2_triage: TriageState }>(`/api/v1/stage2/patients/${patientId}/triage/advance`, {
        method: "POST",
        json: {},
      });
      setState(r.stage2_triage);
      setErr("");
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setErr(e.body?.error || "Не удалось перейти к следующей фазе");
    } finally {
      setBusy(false);
    }
  }

  const currentIdx = state ? stepIndex(state.current_phase) : 0;

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell">
        <div className="triage-page-head mb-4">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="triag-page-heading mb-1">Этап 2 · {patientName || "Пациент"}</h1>
          <p className="text-muted small mb-0">
            Полный алгоритм 2-го этапа будет реализован позже. Сейчас доступна заглушка перехода по фазам.
          </p>
          {state?.stage1_priority_name && (
            <p className="small mb-0 mt-1">
              Приоритет этапа 1: <strong>{state.stage1_priority_name}</strong>
            </p>
          )}
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        <div className="card triage-form-card mb-4">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between gap-2 mb-4">
              {FLOW_STEPS.map((step, i) => {
                const active = i === currentIdx;
                const done = i < currentIdx;
                const disabled = !active && !done;
                return (
                  <div
                    key={step.key}
                    className={`flex-fill text-center p-2 rounded border ${active ? "border-primary bg-primary-subtle" : ""} ${done ? "border-success bg-success-subtle" : ""} ${disabled ? "opacity-50" : ""}`}
                    style={{ minWidth: 90 }}
                  >
                    <div className="small fw-semibold">{step.label}</div>
                    {active && <span className="badge text-bg-primary mt-1">Текущая</span>}
                    {done && <span className="badge text-bg-success mt-1">Пройдено</span>}
                  </div>
                );
              })}
            </div>

            {state && (
              <div className="mb-3">
                <h2 className="h6">Текущая фаза: {state.phase_label}</h2>
                <p className="text-muted small">
                  Ключ: <code>{state.current_phase}</code>
                  {state.completed_at ? " · этап 2 завершён" : ""}
                </p>
              </div>
            )}

            <div className="row g-3">
              {state?.phases.map((ph) => (
                <div key={ph.key} className="col-md-6 col-lg-4">
                  <div
                    className={`card h-100 ${ph.key === state.current_phase ? "border-primary" : "border-secondary-subtle"} ${ph.key !== state.current_phase ? "opacity-75" : ""}`}
                  >
                    <div className="card-body">
                      <h3 className="h6">{ph.label}</h3>
                      <p className="small text-muted mb-0">Формы и действия будут добавлены в следующей версии.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary triag-btn-primary"
                disabled={!state?.can_advance || busy}
                onClick={() => void advance()}
              >
                Следующая фаза (заглушка)
              </button>
              <Link to={`/patients/${patientId}/edit`} className="btn btn-outline-secondary">
                Данные пациента
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
