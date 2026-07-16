import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createConsumer } from "@rails/actioncable";
import { apiJson } from "../api";
import { playArrivalSoundForPatient } from "../notificationSound";
import type { EligiblePatientRow, Stage2PatientListRow } from "../types";
import { stage2EditPhasePath, stage2HasSavedPhaseData } from "../stage2Ui";

const STAGE1_PRIORITY_LABELS: Record<string, string> = {
  red: "Красный",
  yellow: "Жёлтый",
  purple: "Лиловый",
  green: "Зелёный",
  pending: "Не определён",
};

function priorityTone(priority?: string | null): "red" | "yellow" | "orange" | "grey" | "purple" | "green" | "neutral" {
  const p = (priority || "").toLowerCase();
  if (p === "red") return "red";
  if (p === "yellow") return "yellow";
  if (p === "orange") return "orange";
  if (p === "grey") return "grey";
  if (p === "purple") return "purple";
  if (p === "green") return "green";
  return "neutral";
}

function formatAdmissionDate(value?: string): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function statusLabel(p: Stage2PatientListRow): string {
  if (p.pending_acceptance) return "Ожидает приёма";
  if (!p.stage2_triage) return "Ожидание";
  if (p.stage2_triage.completed_at) return "Завершено";
  const route = p.stage2_triage.workflow_route;
  if (route === "pre_doctor") return "Шаг 1";
  if (route === "doctor_examination") return "Шаг 2";
  if (route === "decision") return "Принять решение";
  if (route === "actions") return "Действия";
  return p.stage2_triage.phase_label || p.stage2_triage.current_phase;
}

function workflowPath(p: Stage2PatientListRow): string {
  if (p.pending_acceptance) return `/patients/${p.id}/workflow`;
  const route = p.stage2_triage?.workflow_route;
  if (route === "decision") return `/patients/${p.id}/decision`;
  if (route === "doctor_examination") return `/patients/${p.id}/doctor-examination`;
  if (route === "actions") return `/patients/${p.id}/actions`;
  if (route === "completed") return `/patients/${p.id}/actions/report`;
  return `/patients/${p.id}/workflow`;
}

function workflowButtonLabel(p: Stage2PatientListRow): string {
  if (p.pending_acceptance) return "Принять пациента";
  const route = p.stage2_triage?.workflow_route;
  if (route === "pre_doctor") return "Шаг 1";
  if (route === "doctor_examination") return "Шаг 2";
  if (route === "decision") return "Принять решение";
  if (route === "actions") return "Действия";
  if (route === "completed") return "Итог действий";
  return "Открыть этап 2";
}

export default function PatientsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Stage2PatientListRow[]>([]);
  const [err, setErr] = useState("");
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stepFilter, setStepFilter] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [eligible, setEligible] = useState<EligiblePatientRow[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleErr, setEligibleErr] = useState("");
  const [pickSearch, setPickSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Stage2PatientListRow | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set());
  const [acceptBusy, setAcceptBusy] = useState<number | null>(null);
  const [detailsOpenFor, setDetailsOpenFor] = useState<number | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsErr, setDetailsErr] = useState("");
  const [details, setDetails] = useState<{
    patient: Stage2PatientListRow;
    stage2_triage: NonNullable<Stage2PatientListRow["stage2_triage"]> & {
      can_edit_saved_phases?: boolean;
      decision_data?: Record<string, unknown>;
      actions_completed_at?: string | null;
    };
  } | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("admission_date", admissionDate);
    if (search) p.set("search", search);
    if (statusFilter) p.set("status", statusFilter);
    if (stepFilter) p.set("step", stepFilter);
    return p.toString();
  }, [admissionDate, search, statusFilter, stepFilter]);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<Stage2PatientListRow[]>(`/api/v1/stage2/patients_list?${qs}`);
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
    const sub = consumer.subscriptions.create("Stage2PatientsListChannel", {
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
    if (!pickOpen && !pendingDelete && detailsOpenFor == null) return;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
    };
  }, [pickOpen, pendingDelete, detailsOpenFor]);

  useEffect(() => {
    rows.forEach((p) => {
      if (!p.pending_acceptance) return;
      const isNew = playArrivalSoundForPatient(p.id);
      if (!isNew) return;
      setHighlightIds((prev) => new Set(prev).add(p.id));
      window.setTimeout(() => {
        setHighlightIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
      }, 5000);
    });
  }, [rows]);

  async function acceptPatient(p: Stage2PatientListRow) {
    setAcceptBusy(p.id);
    try {
      await apiJson(`/api/v1/stage2/patients/${p.id}/accept`, { method: "POST", json: {} });
      await load();
      nav(`/patients/${p.id}/workflow`);
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setErr(e.body?.error || "Не удалось принять пациента");
    } finally {
      setAcceptBusy(null);
    }
  }

  async function openPickModal() {
    setPickOpen(true);
    setEligibleLoading(true);
    setEligibleErr("");
    try {
      const p = new URLSearchParams();
      p.set("admission_date", admissionDate);
      if (pickSearch) p.set("search", pickSearch);
      const data = await apiJson<EligiblePatientRow[]>(`/api/v1/stage2/eligible_from_stage1?${p}`);
      setEligible(data);
    } catch {
      setEligibleErr("Не удалось загрузить список");
      setEligible([]);
    } finally {
      setEligibleLoading(false);
    }
  }

  async function acceptFromStage1(patientId: number) {
    try {
      await apiJson("/api/v1/stage2/cases", { method: "POST", json: { patient_id: patientId } });
      setPickOpen(false);
      await load();
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setEligibleErr(e.body?.error || "Не удалось принять пациента");
    }
  }

  async function openDetails(p: Stage2PatientListRow) {
    setDetailsOpenFor(p.id);
    setDetailsLoading(true);
    setDetailsErr("");
    try {
      const data = await apiJson<{
        patient: Stage2PatientListRow;
        stage2_triage: NonNullable<Stage2PatientListRow["stage2_triage"]> & {
          can_edit_saved_phases?: boolean;
          decision_data?: Record<string, unknown>;
          actions_completed_at?: string | null;
        };
      }>(`/api/v1/stage2/patients/${p.id}`);
      setDetails(data);
    } catch {
      setDetailsErr("Не удалось загрузить данные");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setDetailsOpenFor(null);
    setDetails(null);
    setDetailsErr("");
  }

  async function executeDelete() {
    if (!pendingDelete) return;
    try {
      await apiJson(`/api/v1/stage2/patients/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await load();
    } catch {
      setErr("Не удалось снять пациента с этапа 2");
      setPendingDelete(null);
    }
  }

  return (
    <div className="container-fluid triag-page-wide px-0 px-sm-1">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="triag-page-heading mb-0">Пациенты · Этап 2</h1>
        <button type="button" className="btn btn-primary btn-sm triag-btn-primary" onClick={() => void openPickModal()}>
          Принять с этапа 1
        </button>
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
            <label className="form-label small mb-0">Статус</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="except_completed">Кроме завершённых</option>
              <option value="not_accepted">Не принятые</option>
              <option value="active">Активные</option>
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label small mb-0">Шаг</label>
            <select className="form-select" value={stepFilter} onChange={(e) => setStepFilter(e.target.value)}>
              <option value="">Все</option>
              <option value="not_accepted">Ожидает приёма</option>
              <option value="step1">Шаг 1 — доврачебный</option>
              <option value="step2">Шаг 2 — врачебный осмотр</option>
              <option value="step3">Принять решение</option>
              <option value="actions">Действия</option>
              <option value="completed">Завершённые</option>
            </select>
          </div>
        </div>
      </div>

      {err && <div className="alert alert-warning">{err}</div>}

      <div className="row g-3">
        {rows.map((p) => (
          <div key={p.id} className="col-12 col-md-6 col-xl-4">
            <div className={`card h-100 shadow-sm patient-b-card ${p.card_state_class}${highlightIds.has(p.id) ? " patient-b-card--new-arrival" : ""}`}>
              <div className="card-body">
                <h2 className="h6">{p.full_name}</h2>
                <div className="patient-card-tags">
                  <span className="patient-tag patient-tag--status">{statusLabel(p)}</span>
                  {p.stage2_triage?.display_priority && (
                    <span
                      className={`patient-tag patient-tag--priority patient-tag--${priorityTone(p.stage2_triage.display_priority)}`}
                    >
                      {p.stage2_triage.display_priority_name ||
                        `Этап 2: ${p.stage2_triage.priority_name || STAGE1_PRIORITY_LABELS[p.stage2_triage.display_priority]}`}
                    </span>
                  )}
                  {!p.stage2_triage?.display_priority && p.stage1_priority && (
                    <span className={`patient-tag patient-tag--priority patient-tag--${priorityTone(p.stage1_priority)}`}>
                      Этап 1: {p.stage1_priority_name || STAGE1_PRIORITY_LABELS[p.stage1_priority] || p.stage1_priority}
                    </span>
                  )}
                </div>
                <div className="small text-muted">
                  Поступление: {formatAdmissionDate(p.admission_date)}
                  {p.admission_time ? ` · ${p.admission_time}` : ""}
                  <br />
                  Принят: {p.transferred_at || "—"}
                  <br />
                  Исполнитель: <strong>{p.performer_name || "—"}</strong>
                </div>
                <div className="mt-3 patient-card-actions">
                  {p.pending_acceptance ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm triag-btn-danger"
                      disabled={acceptBusy === p.id}
                      onClick={() => void acceptPatient(p)}
                    >
                      {acceptBusy === p.id ? "Приём…" : "Принять пациента"}
                    </button>
                  ) : (
                    <Link
                      to={workflowPath(p)}
                      className={`btn btn-sm ${p.stage2_triage?.workflow_route === "completed" ? "triag-btn-secondary" : "triag-btn-primary"}`}
                    >
                      {workflowButtonLabel(p)}
                    </Link>
                  )}
                  {p.can_edit && (
                    <Link to={`/patients/${p.id}/edit`} className="btn btn-sm triag-btn-secondary">
                      Данные пациента
                    </Link>
                  )}
                  {p.can_delete && (
                    <button type="button" className="btn btn-sm triag-btn-danger" onClick={() => setPendingDelete(p)}>
                      Снять с этапа 2
                    </button>
                  )}
                  {!p.pending_acceptance && (
                    <button type="button" className="btn btn-sm triag-btn-secondary" onClick={() => void openDetails(p)}>
                      Подробнее
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && !err && (
        <p className="text-muted text-center py-4">Нет пациентов на этапе 2. Используйте «Принять с этапа 1».</p>
      )}

      {pickOpen && (
        <>
          <div className="modal-backdrop fade show" onClick={() => setPickOpen(false)} />
          <div className="modal fade show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0">Принять с этапа 1</h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={() => setPickOpen(false)} />
                </div>
                <div className="modal-body">
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <input
                        className="form-control"
                        placeholder="Поиск по ФИО…"
                        value={pickSearch}
                        onChange={(e) => setPickSearch(e.target.value)}
                      />
                    </div>
                    <div className="col-auto">
                      <button type="button" className="btn btn-outline-primary" onClick={() => void openPickModal()}>
                        Найти
                      </button>
                    </div>
                  </div>
                  {eligibleErr && <div className="alert alert-warning py-2">{eligibleErr}</div>}
                  {eligibleLoading && <div className="text-muted">Загрузка…</div>}
                  {!eligibleLoading && eligible.length === 0 && (
                    <p className="text-muted mb-0">Нет пациентов, готовых к приёму на этап 2.</p>
                  )}
                  <div className="list-group">
                    {eligible.map((e) => (
                      <div key={e.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <div>
                          <strong>{e.full_name}</strong>
                          <div className="small text-muted">
                            ID {e.id} · {formatAdmissionDate(e.admission_date)}
                            {e.stage1_priority_name ? ` · ${e.stage1_priority_name}` : ""}
                          </div>
                        </div>
                        <button type="button" className="btn btn-sm btn-primary triag-btn-primary" onClick={() => void acceptFromStage1(e.id)}>
                          Принять
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {detailsOpenFor != null && (
        <>
          <div className="modal-backdrop fade show" onClick={closeDetails} />
          <div className="modal fade show d-block patient-details-modal" role="dialog" aria-modal="true" aria-label="Подробнее о пациенте">
            <div className="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered">
              <div className="modal-content patient-details-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0">Подробнее</h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={closeDetails} />
                </div>
                <div className="modal-body">
                  {detailsLoading && <div className="text-muted">Загрузка…</div>}
                  {!detailsLoading && detailsErr && <div className="alert alert-warning py-2 mb-0">{detailsErr}</div>}
                  {!detailsLoading && !detailsErr && details && (
                    <div className="d-grid gap-3 patient-details-grid">
                      <div>
                        <h3 className="h6 mb-2">{details.patient.full_name}</h3>
                        <div className="small text-muted">
                          ID: {details.patient.id}
                          <br />
                          Поступление: {formatAdmissionDate(details.patient.admission_date)}
                          {details.patient.admission_time ? ` · ${details.patient.admission_time}` : ""}
                          <br />
                          Исполнитель: <strong>{details.patient.performer_name || "—"}</strong>
                        </div>
                      </div>
                      <div className="patient-details-main-action d-flex flex-wrap gap-2">
                        {!details.patient.pending_acceptance && (
                          <button
                            type="button"
                            className="btn btn-primary triag-btn-primary btn-sm"
                            onClick={() => {
                              closeDetails();
                              nav(workflowPath(details.patient));
                            }}
                          >
                            {workflowButtonLabel(details.patient)}
                          </button>
                        )}
                      </div>
                      {details.stage2_triage?.can_edit_saved_phases && (
                        <div className="patient-details-step-actions d-grid gap-2">
                          <div className="small text-muted">Редактирование шагов:</div>
                          <div className="d-flex flex-wrap gap-2">
                            {stage2HasSavedPhaseData(details.stage2_triage, "pre_doctor") && (
                              <button
                                type="button"
                                className="btn triag-btn-secondary btn-sm"
                                onClick={() => {
                                  closeDetails();
                                  nav(stage2EditPhasePath(details.patient.id, "pre_doctor"));
                                }}
                              >
                                Шаг 1
                              </button>
                            )}
                            {stage2HasSavedPhaseData(details.stage2_triage, "doctor_examination") && (
                              <button
                                type="button"
                                className="btn triag-btn-secondary btn-sm"
                                onClick={() => {
                                  closeDetails();
                                  nav(stage2EditPhasePath(details.patient.id, "doctor_examination"));
                                }}
                              >
                                Шаг 2
                              </button>
                            )}
                            {stage2HasSavedPhaseData(details.stage2_triage, "decision") && (
                              <button
                                type="button"
                                className="btn triag-btn-secondary btn-sm"
                                onClick={() => {
                                  closeDetails();
                                  nav(stage2EditPhasePath(details.patient.id, "decision"));
                                }}
                              >
                                Решение
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="patient-details-bottom-actions d-flex flex-wrap gap-2">
                        {details.patient.can_edit && (
                          <button
                            type="button"
                            className="btn triag-btn-secondary btn-sm"
                            onClick={() => {
                              closeDetails();
                              nav(`/patients/${details.patient.id}/edit`);
                            }}
                          >
                            Данные пациента
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {pendingDelete && (
        <>
          <div className="modal-backdrop fade show" onClick={() => setPendingDelete(null)} />
          <div className="modal fade show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5 mb-0">Снять с этапа 2</h2>
                  <button type="button" className="btn-close" onClick={() => setPendingDelete(null)} />
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    Снять <strong>«{pendingDelete.full_name}»</strong> с этапа 2? Запись этапа 1 сохранится.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setPendingDelete(null)}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void executeDelete()}>
                    Снять
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
