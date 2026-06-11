import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createConsumer } from "@rails/actioncable";
import { apiJson } from "../api";
import type { EligiblePatientRow, Stage2PatientListRow } from "../types";

const APPEAL_TYPES = [
  "Плановая госпитализация по направлению",
  "Самообращение",
  "СМП",
  "ДКЦ",
];

const STAGE1_PRIORITY_LABELS: Record<string, string> = {
  red: "Красный",
  yellow: "Жёлтый",
  purple: "Лиловый",
  green: "Зелёный",
  pending: "Не определён",
};

function priorityTone(priority?: string | null): "red" | "yellow" | "purple" | "green" | "neutral" {
  const p = (priority || "").toLowerCase();
  if (p === "red") return "red";
  if (p === "yellow") return "yellow";
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
  if (!p.stage2_triage) return "Ожидание";
  if (p.stage2_triage.completed_at) return "Завершено";
  if (p.stage2_triage.pre_doctor_completed) return "Действия по приоритету";
  return p.stage2_triage.phase_label || p.stage2_triage.current_phase;
}

function workflowPath(p: Stage2PatientListRow): string {
  if (p.stage2_triage?.workflow_route === "priority_actions") {
    return `/patients/${p.id}/priority-actions`;
  }
  return `/patients/${p.id}/workflow`;
}

export default function PatientsPage() {
  const [rows, setRows] = useState<Stage2PatientListRow[]>([]);
  const [err, setErr] = useState("");
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [appealType, setAppealType] = useState("all");
  const [onlyActive, setOnlyActive] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [eligible, setEligible] = useState<EligiblePatientRow[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleErr, setEligibleErr] = useState("");
  const [pickSearch, setPickSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Stage2PatientListRow | null>(null);

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
    if (!pickOpen && !pendingDelete) return;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
    };
  }, [pickOpen, pendingDelete]);

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

  async function acceptPatient(patientId: number) {
    try {
      await apiJson("/api/v1/stage2/cases", { method: "POST", json: { patient_id: patientId } });
      setPickOpen(false);
      await load();
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setEligibleErr(e.body?.error || "Не удалось принять пациента");
    }
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
        <h1 className="h4 mb-0">Пациенты · Этап 2</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void openPickModal()}>
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
                  {p.stage2_triage?.display_priority && (
                    <span
                      className={`patient-tag patient-tag--priority patient-tag--${priorityTone(p.stage2_triage.display_priority)}`}
                    >
                      Этап 2: {p.stage2_triage.priority_name || STAGE1_PRIORITY_LABELS[p.stage2_triage.display_priority]}
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
                <div className="mt-3 d-grid gap-2">
                  <Link to={workflowPath(p)} className="btn btn-primary btn-sm">
                    {p.stage2_triage?.pre_doctor_completed ? "Действия по приоритету" : "Открыть этап 2"}
                  </Link>
                  {p.can_edit && (
                    <Link to={`/patients/${p.id}/edit`} className="btn btn-outline-secondary btn-sm">
                      Данные пациента
                    </Link>
                  )}
                  {p.can_delete && (
                    <button type="button" className="btn btn-soft-danger btn-sm" onClick={() => setPendingDelete(p)}>
                      Снять с этапа 2
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
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => void acceptPatient(e.id)}>
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
