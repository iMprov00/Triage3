import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createConsumer } from "@rails/actioncable";
import { apiJson, formatTimer } from "../api";
import type { PatientListRow } from "../types";

const APPEAL_TYPES = [
  "Плановая госпитализация по направлению",
  "Самообращение",
  "СМП",
  "ДКЦ",
];

type PatientDetailsResponse = {
  patient: PatientListRow & {
    birth_date?: string | null;
    appeal_type?: string | null;
    pregnancy_display?: string | null;
  };
  triage: PatientListRow["triage"];
};

export default function PatientsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [err, setErr] = useState("");
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [appealType, setAppealType] = useState("all");
  const [onlyActive, setOnlyActive] = useState("");
  const [detailsOpenFor, setDetailsOpenFor] = useState<number | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsErr, setDetailsErr] = useState("");
  const [details, setDetails] = useState<PatientDetailsResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientListRow | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("admission_date", admissionDate);
    if (search) p.set("search", search);
    if (appealType !== "all") p.set("appeal_type", appealType);
    if (onlyActive) p.set("only_active", onlyActive);
    return p.toString();
  }, [admissionDate, search, appealType, onlyActive]);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<PatientListRow[]>(`/api/v1/patients_list?${qs}`);
      setRows(data);
      setErr("");
    } catch {
      setErr("Не удалось загрузить список");
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const consumer = createConsumer("/cable");
    const sub = consumer.subscriptions.create("PatientsListChannel", {
      received() {
        void load();
      },
    });
    const t = window.setInterval(() => void load(), 15000);
    return () => {
      sub.unsubscribe();
      consumer.disconnect();
      window.clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setRows((prev) => [...prev]);
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (detailsOpenFor == null && pendingDelete == null) return;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
    };
  }, [detailsOpenFor, pendingDelete]);

  function remaining(t: PatientListRow["triage"]): number {
    if (!t?.timer_active || !t.timer_ends_at) return 0;
    return Math.max(0, Math.floor(t.timer_ends_at - Date.now() / 1000));
  }

  function formatAdmissionDate(value?: string): string {
    if (!value) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return value;
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  function priorityTone(priority?: string): "red" | "yellow" | "purple" | "green" | "neutral" {
    const p = (priority || "").toLowerCase();
    if (p === "red") return "red";
    if (p === "yellow") return "yellow";
    if (p === "purple") return "purple";
    if (p === "green") return "green";
    return "neutral";
  }

  function statusLabel(p: PatientListRow): string {
    if (!p.triage) return "Триаж не начат";
    if (p.triage.completed_at && p.triage.actions_completed_at) return "Завершено";
    if (p.triage.completed_at && !p.triage.actions_completed_at) return "Выполняются действия";
    return `Шаг ${p.triage.step}`;
  }

  async function openDetails(patientId: number) {
    setDetailsOpenFor(patientId);
    setDetailsLoading(true);
    setDetailsErr("");
    try {
      const data = await apiJson<PatientDetailsResponse>(`/api/v1/patients/${patientId}`);
      setDetails(data);
    } catch {
      setDetails(null);
      setDetailsErr("Не удалось загрузить данные пациента");
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setDetailsOpenFor(null);
    setDetails(null);
    setDetailsLoading(false);
    setDetailsErr("");
  }

  function openDeleteConfirm(patient: PatientListRow) {
    setPendingDelete(patient);
  }

  function closeDeleteConfirm() {
    setPendingDelete(null);
  }

  async function executeDeletePatient() {
    if (!pendingDelete) return;
    try {
      await apiJson(`/api/v1/patients/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      closeDetails();
      await load();
    } catch {
      setDetailsErr("Не удалось удалить пациента");
      setPendingDelete(null);
    }
  }

  function hasStepData(t: PatientListRow["triage"], step: 1 | 2 | 3): boolean {
    if (!t) return false;
    if (step === 1) return Object.keys(t.step1_data || {}).length > 0 || t.step >= 1;
    if (step === 2) return Object.keys(t.step2_data || {}).length > 0 || t.step >= 2;
    return Object.keys(t.step3_data || {}).length > 0 || t.step >= 3;
  }

  function editStepPath(patientId: number, stepNum: 1 | 2 | 3): string {
    if (stepNum === 1) return `/patients/${patientId}/triage`;
    if (stepNum === 2) return `/patients/${patientId}/triage/step2`;
    return `/patients/${patientId}/triage/step3`;
  }

  return (
    <div className="container-fluid triag-page-wide px-0 px-sm-1">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Пациенты</h1>
        <Link to="/patients/new" className="btn btn-primary btn-sm">
          Новый пациент
        </Link>
      </div>

      <div className="card mb-3">
        <div className="card-body row g-2 g-md-3">
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label small mb-0">Дата поступления</label>
            <input type="date" className="form-control" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label small mb-0">Поиск</label>
            <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ФИО, ID…" />
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label small mb-0">Вид обращения</label>
            <select className="form-select" value={appealType} onChange={(e) => setAppealType(e.target.value)}>
              <option value="all">Все</option>
              {APPEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label small mb-0">Статус</label>
            <select className="form-select" value={onlyActive} onChange={(e) => setOnlyActive(e.target.value)}>
              <option value="">Все</option>
              <option value="1">Только активные</option>
            </select>
          </div>
          <div className="col-12">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void load()}>
              Обновить список
            </button>
          </div>
        </div>
      </div>

      {err && <div className="alert alert-warning">{err}</div>}

      <div className="row g-3">
        {rows.map((p) => (
          <div key={p.id} className="col-12 col-md-6 col-xl-4">
            <div className={`card h-100 shadow-sm patient-b-card ${p.card_state_class}`}>
              <div className="card-body">
                <h2 className="h6">{p.full_name}</h2>
                <div className="patient-card-tags">
                  <span className="patient-tag patient-tag--status">{statusLabel(p)}</span>
                  {p.triage?.priority_name && (
                    <span className={`patient-tag patient-tag--priority patient-tag--${priorityTone(p.triage.priority)}`}>
                      Приоритет: {p.triage.priority_name}
                    </span>
                  )}
                  {p.triage?.completed_at && p.triage.actions_completed_at && <span className="patient-tag patient-tag--done">Готово</span>}
                </div>
                <div className="small text-muted">
                  Поступление: {formatAdmissionDate(p.admission_date)}
                  {p.admission_time ? ` · ${p.admission_time}` : ""}
                  <br />
                  Исполнитель: <strong>{p.performer_name || "—"}</strong>
                </div>
                {p.triage?.timer_active && p.triage.timer_ends_at ? (
                  <div className="mt-2 patient-timer-box">
                    <div className="patient-timer-head">
                      <span className="text-muted small">Таймер</span>
                      <strong className="patient-timer-value">{formatTimer(remaining(p.triage))}</strong>
                    </div>
                    <div className="progress patient-timer-progress mt-1" style={{ height: 7 }}>
                      <div
                        className={`progress-bar patient-timer-bar patient-timer-bar--${priorityTone(p.triage.priority)}`}
                        style={{
                          width: `${Math.min(100, (remaining(p.triage) / (p.triage.max_time || 120)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 d-grid gap-2">
                  {!p.triage && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        await apiJson(`/api/v1/patients/${p.id}/triage/start`, { method: "POST", json: {} });
                        void load();
                        nav(`/patients/${p.id}/triage`);
                      }}
                    >
                      Начать триаж
                    </button>
                  )}
                  {p.triage && !p.triage.completed_at && (
                    <Link to={`/patients/${p.id}/triage`} className="btn btn-primary btn-sm">
                      Шаг {p.triage.step}
                    </Link>
                  )}
                  {p.triage?.completed_at && !p.triage.actions_completed_at && (
                    <Link to={`/patients/${p.id}/triage/actions`} className="btn btn-warning btn-sm">
                      Действия
                    </Link>
                  )}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void openDetails(p.id)}>
                    Подробнее
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {detailsOpenFor != null && (
        <>
          <div className="modal-backdrop fade show" onClick={closeDetails} />
          <div className="modal fade show d-block patient-details-modal" role="dialog" aria-modal="true" aria-label="Подробнее о пациенте">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content patient-details-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0">Подробнее о пациенте</h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={closeDetails} />
                </div>
                <div className="modal-body">
                  {detailsLoading && <div className="text-muted">Загрузка...</div>}
                  {!detailsLoading && detailsErr && <div className="alert alert-warning py-2 mb-0">{detailsErr}</div>}
                  {!detailsLoading && !detailsErr && details && (
                    <div className="d-grid gap-3 patient-details-grid">
                      <div>
                        <h3 className="h6 mb-2">{details.patient.full_name}</h3>
                        <div className="small text-muted">
                          ID: {details.patient.id}
                          <br />
                          Поступление: {details.patient.admission_date}
                          {details.patient.admission_time ? ` · ${details.patient.admission_time}` : ""}
                          <br />
                          Исполнитель: <strong>{details.patient.performer_name || "—"}</strong>
                        </div>
                      </div>
                      <div className="small patient-details-facts">
                        <div>
                          Дата рождения: <strong>{details.patient.birth_date || "—"}</strong>
                        </div>
                        <div>
                          Вид обращения: <strong>{details.patient.appeal_type || "—"}</strong>
                        </div>
                        <div>
                          Беременность: <strong>{details.patient.pregnancy_display || "—"}</strong>
                        </div>
                        <div>
                          Статус триажа:{" "}
                          <strong>{details.triage ? `Шаг ${details.triage.step} · ${details.triage.priority_name}` : "Триаж не начат"}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!detailsLoading && details && (
                  <div className="modal-footer patient-details-footer">
                    <div className="patient-details-main-action d-grid gap-2">
                      {!details.triage && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={async () => {
                            await apiJson(`/api/v1/patients/${details.patient.id}/triage/start`, { method: "POST", json: {} });
                            closeDetails();
                            await load();
                            nav(`/patients/${details.patient.id}/triage`);
                          }}
                        >
                          Начать триаж
                        </button>
                      )}
                      {details.triage && !details.triage.completed_at && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            closeDetails();
                            nav(`/patients/${details.patient.id}/triage`);
                          }}
                        >
                          Шаг {details.triage.step}
                        </button>
                      )}
                      {details.triage?.completed_at && !details.triage.actions_completed_at && (
                        <button
                          type="button"
                          className="btn btn-warning"
                          onClick={() => {
                            closeDetails();
                            nav(`/patients/${details.patient.id}/triage/actions`);
                          }}
                        >
                          Действия
                        </button>
                      )}
                    </div>
                    {details.patient.can_edit_saved_steps && details.triage && (
                      <div className="patient-details-step-actions d-grid gap-2">
                        <div className="small text-muted">Редактирование шагов:</div>
                        <div className="d-flex flex-wrap gap-2">
                          {[1, 2, 3].map((stepNum) =>
                            hasStepData(details.triage, stepNum as 1 | 2 | 3) ? (
                              <button
                                key={stepNum}
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => {
                                  closeDetails();
                                  nav(editStepPath(details.patient.id, stepNum as 1 | 2 | 3));
                                }}
                              >
                                Шаг {stepNum}
                              </button>
                            ) : null,
                          )}
                        </div>
                      </div>
                    )}
                    <div className="patient-details-bottom-actions d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          closeDetails();
                          nav(`/patients/${details.patient.id}/edit`);
                        }}
                      >
                        Данные пациента
                      </button>
                      {details.patient.can_delete && (
                        <button type="button" className="btn btn-soft-danger btn-sm" onClick={() => openDeleteConfirm(details.patient)}>
                          Удалить пациента
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {pendingDelete != null && (
        <>
          <div className="modal-backdrop fade show patient-delete-backdrop" onClick={closeDeleteConfirm} />
          <div
            className="modal fade show d-block patient-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-delete-title"
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0" id="patient-delete-title">
                    Удаление пациента
                  </h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={closeDeleteConfirm} />
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    Удалить пациента <strong>«{pendingDelete.full_name}»</strong>? Это действие нельзя отменить.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={closeDeleteConfirm}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void executeDeletePatient()}>
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
