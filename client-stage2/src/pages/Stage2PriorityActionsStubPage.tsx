import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";

type TriageState = {
  priority: string;
  priority_name: string;
  pre_doctor_completed: boolean;
  workflow_route: string;
};

const STUB_ACTIONS: Record<string, string[]> = {
  red: [
    "Немедленная стабилизация состояния",
    "Подготовка к экстренному родоразрешению / операции",
    "Вызов анестезиолога-реаниматолога",
    "Непрерывный мониторинг плода и матери",
  ],
  yellow: [
    "Расширенное обследование (КТГ, УЗИ, анализы)",
    "Консультация акушера-гинеколога",
    "Подготовка к переводу в ПИТ / родовое отделение",
    "Контроль витальных функций",
  ],
  green: [
    "Плановое обследование",
    "Консультация врача",
    "Подготовка к госпитализации в отделение патологии",
    "Оформление документации",
  ],
};

function priorityTone(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "red") return "red";
  if (p === "yellow") return "yellow";
  if (p === "green") return "green";
  return "neutral";
}

export default function Stage2PriorityActionsStubPage() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<TriageState | null>(null);
  const [patientName, setPatientName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const [triage, details] = await Promise.all([
          apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
          apiJson<{ patient: { full_name: string } }>(`/api/v1/stage2/patients/${patientId}`),
        ]);
        setPatientName(details.patient.full_name);
        if (!triage.pre_doctor_completed || triage.workflow_route !== "priority_actions") {
          nav(`/patients/${patientId}/workflow`, { replace: true });
          return;
        }
        setState(triage);
      } catch {
        setErr("Не удалось загрузить данные");
      }
    })();
  }, [patientId, nav]);

  const actions = state ? STUB_ACTIONS[state.priority] || STUB_ACTIONS.green : [];
  const tone = state ? priorityTone(state.priority) : "neutral";

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell">
        <div className="triage-page-head mb-4">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="h4 mb-1">Действия по приоритету · Этап 2</h1>
          <p className="text-muted small mb-0">{patientName}</p>
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        {state && (
          <div className="card triage-form-card shadow-sm">
            <div className="card-body">
              <div className="mb-3">
                <span className={`patient-tag patient-tag--priority patient-tag--${tone}`}>
                  Приоритет: {state.priority_name}
                </span>
              </div>
              <p className="text-muted">
                Полный чеклист действий по приоритету будет реализован в следующей версии. Ниже — предварительный список.
              </p>
              <ul className="list-group list-group-flush mb-4">
                {actions.map((text) => (
                  <li key={text} className="list-group-item d-flex align-items-center gap-2 text-muted">
                    <input type="checkbox" className="form-check-input" disabled />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-outline-secondary" disabled title="Будет доступно позже">
                Завершить действия (скоро)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
