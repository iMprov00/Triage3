import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api";
import DashboardCohortModal, { type DashboardCohortRequest } from "../components/DashboardCohortModal";
import type { PeriodAnalytics } from "../components/FullStatisticsCharts";
import type { PatientListRow } from "../types";

const FullStatisticsCharts = lazy(() => import("../components/FullStatisticsCharts"));

const APPEAL_TYPES = [
  "Плановая госпитализация по направлению",
  "Самообращение",
  "СМП",
  "ДКЦ",
];

type DashboardCounts = {
  total_patients: number;
  without_triage: number;
  triage_in_progress: number;
  step1: number;
  step2: number;
  step3: number;
  in_actions_phase: number;
  fully_completed: number;
};

type DashboardAlerts = {
  step_timer_expired: number;
  actions_timer_expired: number;
  brigade_timer_expired: number;
};

type DetailedResponse = {
  date_from: string;
  date_to: string;
  page: number;
  per_page: number;
  total_count: number;
  counts: DashboardCounts;
  priority_breakdown: Record<string, number>;
  alerts: DashboardAlerts;
  period_analytics: PeriodAnalytics;
  rows: PatientListRow[];
};

type AppliedFilters = {
  dateFrom: string;
  dateTo: string;
  search: string;
  appealType: string;
  pregnancyCondition: string;
  performerFilter: string;
  onlyActive: string;
  priority: string;
};

function cohortSnapshotSegments(c: DashboardCounts) {
  const t = c.total_patients;
  if (!t) return [];
  return [
    { key: "Без триажа", n: c.without_triage, color: "#f59e0b" },
    { key: "Триаж в процессе", n: c.triage_in_progress, color: "#3b82f6" },
    { key: "Фаза действий", n: c.in_actions_phase, color: "#fb923c" },
    { key: "Завершено полностью", n: c.fully_completed, color: "#10b981" },
  ];
}

function priorityRowClass(p: PatientListRow): string {
  const code = p.triage?.priority;
  if (!code) return "";
  if (code === "red") return "triage-full-row-priority triage-full-row-priority--red";
  if (code === "yellow") return "triage-full-row-priority triage-full-row-priority--yellow";
  if (code === "purple") return "triage-full-row-priority triage-full-row-priority--purple";
  if (code === "green") return "triage-full-row-priority triage-full-row-priority--green";
  if (code === "pending") return "triage-full-row-priority triage-full-row-priority--pending";
  return "";
}

function statusLabel(p: PatientListRow): string {
  if (!p.triage) return "Триаж не начат";
  if (p.triage.completed_at && p.triage.actions_completed_at) return "Завершено";
  if (p.triage.completed_at && !p.triage.actions_completed_at) return "Действия по приоритету";
  return `Шаг ${p.triage.step}`;
}

function buildQs(applied: AppliedFilters, page: number, perPage: number): string {
  const p = new URLSearchParams();
  p.set("date_from", applied.dateFrom);
  p.set("date_to", applied.dateTo);
  if (applied.search) p.set("search", applied.search);
  if (applied.appealType !== "all") p.set("appeal_type", applied.appealType);
  if (applied.pregnancyCondition) p.set("pregnancy_condition", applied.pregnancyCondition);
  if (applied.performerFilter) p.set("performer_filter", applied.performerFilter);
  if (applied.onlyActive) p.set("only_active", applied.onlyActive);
  if (applied.priority) p.set("priority", applied.priority);
  p.set("page", String(page));
  p.set("per_page", String(perPage));
  return p.toString();
}

export default function FullStatisticsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const perPage = 25;

  const [draft, setDraft] = useState<AppliedFilters>({
    dateFrom: today,
    dateTo: today,
    search: "",
    appealType: "all",
    pregnancyCondition: "",
    performerFilter: "",
    onlyActive: "",
    priority: "",
  });
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    dateFrom: today,
    dateTo: today,
    search: "",
    appealType: "all",
    pregnancyCondition: "",
    performerFilter: "",
    onlyActive: "",
    priority: "",
  }));
  const [page, setPage] = useState(1);

  const [data, setData] = useState<DetailedResponse | null>(null);
  const [err, setErr] = useState("");
  const [cohortRequest, setCohortRequest] = useState<DashboardCohortRequest | null>(null);

  const openCohort = useCallback(
    (category: DashboardCohortRequest["category"], label: string, priority?: string) => {
      setCohortRequest({
        category,
        priority,
        label,
        dateFrom: applied.dateFrom,
        dateTo: applied.dateTo,
      });
    },
    [applied.dateFrom, applied.dateTo],
  );

  const qs = useMemo(() => buildQs(applied, page, perPage), [applied, page]);

  const load = useCallback(async () => {
    try {
      const r = await apiJson<DetailedResponse>(`/api/v1/statistics/detailed?${qs}`);
      setData(r);
      setErr("");
    } catch {
      setErr("Не удалось загрузить данные");
      setData(null);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    setApplied({ ...draft });
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total_count / data.per_page)) : 1;

  return (
    <div className="container-fluid triag-page-wide triage-stats-page">
      <DashboardCohortModal request={cohortRequest} onClose={() => setCohortRequest(null)} />
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <Link to="/patients" className="triage-back-link">← Пациенты</Link>
            <h1 className="triag-page-heading mb-0">Полная статистика</h1>
            <p className="text-muted small mb-0">Период и фильтры по пациентам отделения</p>
          </div>
          <Link to="/statistics/quick" className="btn triag-btn-secondary btn-sm">
            Быстрая статистика
          </Link>
        </div>

        <div className="card shadow-sm mb-3 mt-3">
          <div className="card-body row g-2 g-md-3">
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Дата с</label>
              <input type="date" className="form-control" value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Дата по</label>
              <input type="date" className="form-control" value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Поиск</label>
              <input className="form-control" value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} placeholder="ФИО, ID…" />
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Вид обращения</label>
              <select className="form-select" value={draft.appealType} onChange={(e) => setDraft((d) => ({ ...d, appealType: e.target.value }))}>
                <option value="all">Все</option>
                {APPEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Беременность</label>
              <select
                className="form-select"
                value={draft.pregnancyCondition}
                onChange={(e) => setDraft((d) => ({ ...d, pregnancyCondition: e.target.value }))}
              >
                <option value="">Все</option>
                <option value="unknown">Неизвестен срок</option>
                <option value="less_12">До 12 недель</option>
                <option value="12_28">12–28 недель</option>
                <option value="more_28">После 28 недель</option>
              </select>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Исполнитель (часть ФИО)</label>
              <input className="form-control" value={draft.performerFilter} onChange={(e) => setDraft((d) => ({ ...d, performerFilter: e.target.value }))} />
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Приоритет (триаж завершён)</label>
              <select className="form-select" value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
                <option value="">Все</option>
                <option value="pending">Не определён</option>
                <option value="red">Красный</option>
                <option value="yellow">Жёлтый</option>
                <option value="purple">Фиолетовый</option>
                <option value="green">Зелёный</option>
              </select>
            </div>
            <div className="col-12 col-md-6 col-lg-3">
              <label className="form-label small mb-0">Статус</label>
              <select className="form-select" value={draft.onlyActive} onChange={(e) => setDraft((d) => ({ ...d, onlyActive: e.target.value }))}>
                <option value="">Все</option>
                <option value="1">Только активные триажи</option>
              </select>
            </div>
            <div className="col-12">
              <button type="button" className="btn btn-primary triag-btn-primary" onClick={() => applyFilters()}>
                Применить фильтры
              </button>
            </div>
          </div>
        </div>

        {err && <div className="alert alert-danger py-2">{err}</div>}

        {data && (
          <>
            <div className="triage-stat-grid mb-2">
              <button type="button" className="triage-cohort-hit triage-stat-kpi triage-stat-kpi--neutral" onClick={() => openCohort("total_patients", "Всего в периоде")}>
                <div className="triage-stat-kpi-value">{data.counts.total_patients}</div>
                <div className="triage-stat-kpi-label">Всего в периоде</div>
              </button>
              <button type="button" className="triage-cohort-hit triage-stat-kpi triage-stat-kpi--neutral" onClick={() => openCohort("triage_in_progress", "Триаж в процессе")}>
                <div className="triage-stat-kpi-value">{data.counts.triage_in_progress}</div>
                <div className="triage-stat-kpi-label">Триаж в процессе</div>
              </button>
              <button type="button" className="triage-cohort-hit triage-stat-kpi triage-stat-kpi--neutral" onClick={() => openCohort("in_actions_phase", "Фаза действий")}>
                <div className="triage-stat-kpi-value">{data.counts.in_actions_phase}</div>
                <div className="triage-stat-kpi-label">Фаза действий</div>
              </button>
              <button type="button" className="triage-cohort-hit triage-stat-kpi triage-stat-kpi--ok" onClick={() => openCohort("fully_completed", "Завершено полностью")}>
                <div className="triage-stat-kpi-value">{data.counts.fully_completed}</div>
                <div className="triage-stat-kpi-label">Завершено полностью</div>
              </button>
            </div>

            <div className="card border-0 shadow-sm mb-3 triage-full-cohort-card">
              <div className="card-body py-2 px-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <span className="small fw-semibold text-secondary">Срез по этапам сейчас (вся выборка)</span>
                  <span className="small text-muted">на момент загрузки · просрочки: шаг {data.alerts.step_timer_expired}, действия {data.alerts.actions_timer_expired}, бригада {data.alerts.brigade_timer_expired}</span>
                </div>
                <div className="triage-full-cohort-strip" role="img" aria-label="Доля пациентов по этапам">
                  {cohortSnapshotSegments(data.counts).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="triage-full-cohort-seg triage-cohort-hit border-0 p-0"
                      style={{
                        width: `${(s.n / data.counts.total_patients) * 100}%`,
                        backgroundColor: s.color,
                      }}
                      title={`${s.key}: ${s.n}`}
                      onClick={() => {
                        const map: Record<string, DashboardCohortRequest["category"]> = {
                          "Без триажа": "without_triage",
                          "Триаж в процессе": "triage_in_progress",
                          "Фаза действий": "in_actions_phase",
                          "Завершено полностью": "fully_completed",
                        };
                        const category = map[s.key];
                        if (category) openCohort(category, s.key);
                      }}
                    />
                  ))}
                </div>
                <div className="d-flex flex-wrap gap-2 small text-muted mt-2">
                  {cohortSnapshotSegments(data.counts).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="triage-cohort-inline-link d-inline-flex align-items-center gap-1 border-0 bg-transparent p-0 small text-muted"
                      onClick={() => {
                        const map: Record<string, DashboardCohortRequest["category"]> = {
                          "Без триажа": "without_triage",
                          "Триаж в процессе": "triage_in_progress",
                          "Фаза действий": "in_actions_phase",
                          "Завершено полностью": "fully_completed",
                        };
                        const category = map[s.key];
                        if (category) openCohort(category, s.key);
                      }}
                    >
                      <span className="triage-full-cohort-dot" style={{ backgroundColor: s.color }} />
                      {s.key}: <strong className="text-body">{s.n}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Suspense fallback={<div className="text-muted small py-3">Загрузка диаграмм…</div>}>
              <FullStatisticsCharts
                counts={data.counts}
                priority_breakdown={data.priority_breakdown}
                period_analytics={data.period_analytics}
              />
            </Suspense>

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <span className="small text-muted">
                Записей: {data.total_count} · страница {data.page} из {totalPages}
              </span>
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn triag-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Назад
                </button>
                <button type="button" className="btn triag-btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Вперёд
                </button>
              </div>
            </div>

            <div className="table-responsive border rounded">
              <table className="table table-sm table-hover align-middle mb-0 triage-stats-table">
                <thead className="table-light">
                  <tr>
                    <th>ФИО</th>
                    <th>Поступление</th>
                    <th>Исполнитель</th>
                    <th>Статус</th>
                    <th>Приоритет</th>
                    <th className="text-end">Документ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className={priorityRowClass(row)}>
                      <td className="fw-medium">{row.full_name}</td>
                      <td>
                        {row.admission_date}
                        {row.admission_time ? ` · ${row.admission_time}` : ""}
                      </td>
                      <td>{row.performer_name || "—"}</td>
                      <td>{statusLabel(row)}</td>
                      <td>{row.triage?.priority_name || "—"}</td>
                      <td className="text-end">
                        {row.triage?.actions_completed_at ? (
                          <Link to={`/patients/${row.id}/triage/actions/report`} className="btn btn-sm triag-btn-primary">
                            Итоговый документ
                          </Link>
                        ) : row.triage?.completed_at ? (
                          <Link to={`/patients/${row.id}/triage/actions`} className="btn btn-sm triag-btn-secondary">
                            Действия
                          </Link>
                        ) : row.triage ? (
                          <Link to={`/patients/${row.id}/triage`} className="btn btn-sm triag-btn-secondary">
                            Триаж
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-muted text-center py-4">
                        Нет записей по выбранным условиям
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
