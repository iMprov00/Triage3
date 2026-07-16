import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";
import type { PatientListRow } from "../types";

export type DashboardCohortCategory =
  | "total_patients"
  | "without_triage"
  | "triage_in_progress"
  | "step1"
  | "step2"
  | "step3"
  | "in_actions_phase"
  | "fully_completed"
  | "step_timer_expired"
  | "actions_timer_expired"
  | "brigade_timer_expired"
  | "priority";

export type DashboardCohortRequest = {
  category: DashboardCohortCategory;
  priority?: string;
  label: string;
  admissionDate?: string;
  dateFrom?: string;
  dateTo?: string;
};

type CohortResponse = {
  category_label: string;
  date_from: string;
  date_to: string;
  page: number;
  per_page: number;
  total_count: number;
  rows: PatientListRow[];
};

type Props = {
  request: DashboardCohortRequest | null;
  onClose: () => void;
};

const PER_PAGE = 25;

function statusLabel(row: PatientListRow): string {
  if (!row.triage) return "Триаж не начат";
  if (row.triage.completed_at && row.triage.actions_completed_at) return "Завершено";
  if (row.triage.completed_at && !row.triage.actions_completed_at) return "Действия по приоритету";
  return `Шаг ${row.triage.step}`;
}

function reportLink(row: PatientListRow): string | null {
  if (!row.triage) return null;
  if (row.triage.actions_completed_at) return `/patients/${row.id}/triage/actions/report`;
  if (row.triage.completed_at) return `/patients/${row.id}/triage/actions`;
  if (row.triage.step === 1) return `/patients/${row.id}/triage`;
  if (row.triage.step === 2) return `/patients/${row.id}/triage/step2`;
  if (row.triage.step === 3) return `/patients/${row.id}/triage/step3`;
  return `/patients/${row.id}/triage`;
}

function reportLinkLabel(row: PatientListRow): string {
  if (row.triage?.actions_completed_at) return "Итоговый документ";
  if (row.triage?.completed_at) return "Действия";
  if (row.triage) return "Триаж";
  return "Карточка";
}

function buildQs(req: DashboardCohortRequest, page: number): string {
  const p = new URLSearchParams();
  p.set("category", req.category);
  if (req.priority) p.set("priority", req.priority);
  if (req.dateFrom) {
    p.set("date_from", req.dateFrom);
    p.set("date_to", req.dateTo || req.dateFrom);
  } else if (req.admissionDate) {
    p.set("admission_date", req.admissionDate);
  }
  p.set("page", String(page));
  p.set("per_page", String(PER_PAGE));
  return p.toString();
}

export default function DashboardCohortModal({ request, onClose }: Props) {
  const [data, setData] = useState<CohortResponse | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => (request ? buildQs(request, page) : ""), [request, page]);

  const load = useCallback(async () => {
    if (!request) return;
    setLoading(true);
    try {
      const r = await apiJson<CohortResponse>(`/api/v1/statistics/cohort?${qs}`);
      setData(r);
      setErr("");
    } catch {
      setData(null);
      setErr("Не удалось загрузить список пациентов");
    } finally {
      setLoading(false);
    }
  }, [qs, request]);

  useEffect(() => {
    if (!request) {
      setData(null);
      setPage(1);
      setErr("");
      return;
    }
    setPage(1);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    void load();
  }, [load, request]);

  if (!request) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / data.per_page)) : 1;
  const periodLabel =
    data && data.date_from !== data.date_to ? `${data.date_from} — ${data.date_to}` : data?.date_from || request.admissionDate || "";

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div
        className="modal fade show d-block triage-cohort-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="triage-cohort-modal-title"
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2 className="modal-title h5 mb-0" id="triage-cohort-modal-title">
                  {request.label}
                </h2>
                {periodLabel ? <div className="small text-muted mt-1">Дата поступления: {periodLabel}</div> : null}
              </div>
              <button type="button" className="btn-close" aria-label="Закрыть" onClick={onClose} />
            </div>
            <div className="modal-body p-0">
              {err ? <div className="alert alert-danger m-3 mb-0 py-2">{err}</div> : null}
              {loading && !data ? <div className="text-muted p-4 text-center">Загрузка…</div> : null}
              {data && (
                <>
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-2 border-bottom bg-light">
                    <span className="small text-muted">
                      Найдено: <strong className="text-body">{data.total_count}</strong>
                      {data.total_count > 0 ? (
                        <>
                          {" "}
                          · стр. {data.page} из {totalPages}
                        </>
                      ) : null}
                    </span>
                    {data.total_count > PER_PAGE ? (
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={page <= 1 || loading}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={page >= totalPages || loading}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Вперёд
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>ФИО</th>
                          <th>Поступление</th>
                          <th>Статус</th>
                          <th>Приоритет</th>
                          <th className="text-end">Документ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => {
                          const href = reportLink(row);
                          return (
                            <tr key={row.id}>
                              <td className="fw-medium">{row.full_name}</td>
                              <td>
                                {row.admission_date}
                                {row.admission_time ? ` · ${row.admission_time}` : ""}
                              </td>
                              <td>{statusLabel(row)}</td>
                              <td>{row.triage?.priority_name || "—"}</td>
                              <td className="text-end">
                                {href ? (
                                  <Link to={href} className="btn btn-sm btn-outline-primary" onClick={onClose}>
                                    {reportLinkLabel(row)}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {data.rows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-muted text-center py-4">
                              Нет пациентов в этой категории
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
