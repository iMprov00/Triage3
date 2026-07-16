import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AnimatedStatValue, { useAnimatedNumber } from "../components/AnimatedStatValue";
import DashboardCohortModal, { type DashboardCohortRequest } from "../components/DashboardCohortModal";
import { useQuickStatisticsDashboard } from "./quickStats/useQuickStatisticsDashboard";

function FunnelBar({
  label,
  value,
  total,
  icon,
  colorClass,
  category,
  admissionDate,
  onOpen,
}: {
  label: string;
  value: number;
  total: number;
  icon: string;
  colorClass: string;
  category: DashboardCohortRequest["category"];
  admissionDate: string;
  onOpen: (r: DashboardCohortRequest) => void;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const widthPct = total > 0 ? (value > 0 ? Math.max(6, (value / total) * 100) : 0) : 0;

  return (
    <button
      type="button"
      className="triage-cohort-hit triage-quick-funnel-row mb-2 w-100 text-start border-0 bg-transparent p-0"
      title="Показать список пациентов"
      onClick={() => onOpen({ category, label, admissionDate })}
    >
      <div className="d-flex align-items-center gap-2 mb-1">
        <i className={`bi ${icon} triage-quick-funnel-ico ${colorClass}`} aria-hidden />
        <span className="small fw-medium">{label}</span>
        <span className="small text-muted ms-auto triage-quick-funnel-val">
          <AnimatedStatValue value={value} pulse={false} /> <span className="text-muted">({pct}%)</span>
        </span>
      </div>
      <div className="triage-quick-funnel-track">
        <div
          className={`triage-quick-funnel-fill ${colorClass}`}
          style={{ width: `${widthPct}%` }}
          title={`${value} из ${total}`}
        />
      </div>
    </button>
  );
}

function MiniKpi({
  label,
  value,
  icon,
  alertTone,
  category,
  admissionDate,
  onOpen,
}: {
  label: string;
  value: number;
  icon: string;
  alertTone?: boolean;
  category: DashboardCohortRequest["category"];
  admissionDate: string;
  onOpen: (r: DashboardCohortRequest) => void;
}) {
  return (
    <button
      type="button"
      className={`triage-cohort-hit triage-quick-mini${alertTone && value > 0 ? " triage-quick-mini--alert" : ""}`}
      title="Показать список пациентов"
      onClick={() => onOpen({ category, label, admissionDate })}
    >
      <i className={`bi ${icon}`} aria-hidden />
      <div>
        <div className="triage-quick-mini-val">
          <AnimatedStatValue value={value} />
        </div>
        <div className="triage-quick-mini-lbl">{label}</div>
      </div>
    </button>
  );
}

function PriorityKpi({
  label,
  value,
  priority,
  admissionDate,
  onOpen,
}: {
  label: string;
  value: number;
  priority: string;
  admissionDate: string;
  onOpen: (r: DashboardCohortRequest) => void;
}) {
  return (
    <button
      type="button"
      className="triage-cohort-hit triage-stat-kpi triage-stat-kpi--neutral triage-quick-priority-kpi"
      title="Показать список пациентов"
      onClick={() =>
        onOpen({
          category: "priority",
          priority,
          label: `Завершённые полностью — ${label}`,
          admissionDate,
        })
      }
    >
      <div className="triage-stat-kpi-value">
        <AnimatedStatValue value={value} />
      </div>
      <div className="triage-stat-kpi-label">{label}</div>
    </button>
  );
}

const PRIORITY_KEYS = [
  { key: "red", label: "Красный" },
  { key: "yellow", label: "Жёлтый" },
  { key: "purple", label: "Фиолетовый" },
  { key: "green", label: "Зелёный" },
  { key: "pending", label: "Не определён" },
] as const;

export default function QuickStatisticsPage() {
  const { admissionDate, setAdmissionDate, data, err, load } = useQuickStatisticsDashboard();
  const c = data?.counts;
  const a = data?.alerts;
  const pb = data?.priority_breakdown || {};
  const total = c?.total_patients ?? 0;
  const done = c?.fully_completed ?? 0;
  const notDoneFully = Math.max(0, total - done);
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const animatedDonePct = useAnimatedNumber(donePct);
  const anyAlert = (a?.step_timer_expired ?? 0) + (a?.actions_timer_expired ?? 0) + (a?.brigade_timer_expired ?? 0) > 0;

  const [stripTick, setStripTick] = useState(false);
  const firstAsOfRef = useRef(true);
  const [cohortRequest, setCohortRequest] = useState<DashboardCohortRequest | null>(null);

  const openCohort = (req: DashboardCohortRequest) => setCohortRequest(req);

  useEffect(() => {
    if (!data?.as_of) return;
    if (firstAsOfRef.current) {
      firstAsOfRef.current = false;
      return;
    }
    setStripTick(true);
    const t = window.setTimeout(() => setStripTick(false), 650);
    return () => window.clearTimeout(t);
  }, [data?.as_of]);

  return (
    <div className="container-fluid triag-page-wide triage-stats-page triage-quick-page">
      <DashboardCohortModal request={cohortRequest} onClose={() => setCohortRequest(null)} />
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <Link to="/patients" className="triage-back-link">
              ← Пациенты
            </Link>
            <h1 className="triag-page-heading mb-0">Быстрая статистика</h1>
            <p className="text-muted small mb-0">Сводка по дате поступления: нажмите на показатель, чтобы увидеть список пациентов</p>
          </div>
          <Link to="/statistics/full" className="btn triag-btn-secondary btn-sm">
            Полная статистика
          </Link>
        </div>

        <div className="card shadow-sm mb-3 mt-3">
          <div className="card-body row g-2 align-items-end">
            <div className="col-auto">
              <label className="form-label small mb-0">Дата поступления</label>
              <input type="date" className="form-control" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
            </div>
            <div className="col-auto">
              <button type="button" className="btn btn-primary triag-btn-primary" onClick={() => void load()}>
                Обновить
              </button>
            </div>
          </div>
        </div>

        {err ? <div className="alert alert-danger py-2">{err}</div> : null}

        {data && c ? (
          <div className="triage-quick-live" key={data.admission_date}>
            <div
              className={`triage-quick-strip mb-3 ${anyAlert ? "triage-quick-strip--bad" : "triage-quick-strip--ok"}${stripTick ? " triage-quick-strip--tick" : ""}`}
            >
              <i className={`bi ${anyAlert ? "bi-exclamation-triangle-fill" : "bi-check-circle-fill"}`} aria-hidden />
              <span>
                {anyAlert ? (
                  <>
                    Просрочки: шаг{" "}
                    <button
                      type="button"
                      className="triage-cohort-inline-link"
                      onClick={() =>
                        openCohort({ category: "step_timer_expired", label: "Просрочка шага", admissionDate: data.admission_date })
                      }
                    >
                      {a?.step_timer_expired ?? 0}
                    </button>
                    , действия{" "}
                    <button
                      type="button"
                      className="triage-cohort-inline-link"
                      onClick={() =>
                        openCohort({
                          category: "actions_timer_expired",
                          label: "Просрочка фазы действий",
                          admissionDate: data.admission_date,
                        })
                      }
                    >
                      {a?.actions_timer_expired ?? 0}
                    </button>
                    , бригада{" "}
                    <button
                      type="button"
                      className="triage-cohort-inline-link"
                      onClick={() =>
                        openCohort({
                          category: "brigade_timer_expired",
                          label: "Просрочка бригады",
                          admissionDate: data.admission_date,
                        })
                      }
                    >
                      {a?.brigade_timer_expired ?? 0}
                    </button>
                  </>
                ) : (
                  "Просрочек по таймерам нет"
                )}
              </span>
              <span className="triage-quick-strip-meta triage-quick-strip-meta--live" key={data.as_of}>
                {new Date(data.as_of).toLocaleString("ru-RU")}
              </span>
            </div>

            <div className="row g-3 mb-3 triage-quick-live-cards">
              <div className="col-12 col-lg-4">
                <button
                  type="button"
                  className="triage-cohort-hit card border-0 shadow-sm h-100 triage-quick-donut-card w-100 text-center"
                  title="Показать завершённых пациентов"
                  onClick={() =>
                    openCohort({ category: "fully_completed", label: "Полностью завершено", admissionDate: data.admission_date })
                  }
                >
                  <div className="card-body d-flex flex-column align-items-center justify-content-center py-4">
                    <div
                      className="triage-quick-donut"
                      style={{
                        background: `conic-gradient(var(--triag-primary) 0% ${animatedDonePct}%, #e5e7eb ${animatedDonePct}% 100%)`,
                      }}
                      title={`Завершено полностью: ${donePct}%`}
                    >
                      <div className="triage-quick-donut-hole">
                        <div className="triage-quick-donut-pct">
                          <AnimatedStatValue value={donePct} suffix="%" />
                        </div>
                        <div className="triage-quick-donut-cap">завершено</div>
                      </div>
                    </div>
                    <div className="small text-muted mt-3 px-1">
                      Всего{" "}
                      <button
                        type="button"
                        className="triage-cohort-inline-link fw-semibold text-body"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCohort({ category: "total_patients", label: "Всего поступило", admissionDate: data.admission_date });
                        }}
                      >
                        <AnimatedStatValue value={total} />
                      </button>{" "}
                      · не завершено{" "}
                      <AnimatedStatValue value={notDoneFully} className="fw-semibold text-body" /> · готово{" "}
                      <AnimatedStatValue value={done} className="fw-semibold text-body" />
                    </div>
                  </div>
                </button>
              </div>
              <div className="col-12 col-lg-8">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body">
                    <h2 className="h6 text-body mb-2">Сейчас по счётчикам</h2>
                    <div className="triage-quick-mini-grid">
                      <MiniKpi label="Без триажа" value={c.without_triage} icon="bi-person-x-fill" category="without_triage" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="В процессе" value={c.triage_in_progress} icon="bi-arrow-repeat" category="triage_in_progress" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Шаг 1" value={c.step1} icon="bi-1-circle-fill" category="step1" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Шаг 2" value={c.step2} icon="bi-2-circle-fill" category="step2" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Шаг 3" value={c.step3} icon="bi-3-circle-fill" category="step3" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Фаза действий" value={c.in_actions_phase} icon="bi-lightning-fill" category="in_actions_phase" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Проср. шаг" value={a?.step_timer_expired ?? 0} icon="bi-stopwatch" alertTone category="step_timer_expired" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Проср. действ." value={a?.actions_timer_expired ?? 0} icon="bi-hourglass-bottom" alertTone category="actions_timer_expired" admissionDate={data.admission_date} onOpen={openCohort} />
                      <MiniKpi label="Проср. бриг." value={a?.brigade_timer_expired ?? 0} icon="bi-truck-front-fill" alertTone category="brigade_timer_expired" admissionDate={data.admission_date} onOpen={openCohort} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm mb-3 triage-quick-funnel-card">
              <div className="card-body">
                <h2 className="h6 text-body mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-funnel" aria-hidden />
                  Воронка от поступивших за дату
                </h2>
                <FunnelBar label="Всего поступило" value={total} total={Math.max(total, 1)} icon="bi-people-fill" colorClass="triage-quick-c-total" category="total_patients" admissionDate={data.admission_date} onOpen={openCohort} />
                <FunnelBar label="Без начатого триажа" value={c.without_triage} total={total} icon="bi-person-x" colorClass="triage-quick-c-warn" category="without_triage" admissionDate={data.admission_date} onOpen={openCohort} />
                <FunnelBar label="Триаж в процессе (на шагах)" value={c.triage_in_progress} total={total} icon="bi-list-task" colorClass="triage-quick-c-open" category="triage_in_progress" admissionDate={data.admission_date} onOpen={openCohort} />
                <FunnelBar label="Фаза действий по приоритету" value={c.in_actions_phase} total={total} icon="bi-lightning-charge-fill" colorClass="triage-quick-c-act" category="in_actions_phase" admissionDate={data.admission_date} onOpen={openCohort} />
                <FunnelBar label="Полностью завершено" value={c.fully_completed} total={total} icon="bi-check2-all" colorClass="triage-quick-c-done" category="fully_completed" admissionDate={data.admission_date} onOpen={openCohort} />

                <hr className="my-3" />
                <div className="small text-muted mb-1">На шагах (доля от «в процессе»)</div>
                {c.triage_in_progress > 0 ? (
                  <>
                    <FunnelBar label="Шаг 1" value={c.step1} total={c.triage_in_progress} icon="bi-1-circle" colorClass="triage-quick-s1" category="step1" admissionDate={data.admission_date} onOpen={openCohort} />
                    <FunnelBar label="Шаг 2" value={c.step2} total={c.triage_in_progress} icon="bi-2-circle" colorClass="triage-quick-s2" category="step2" admissionDate={data.admission_date} onOpen={openCohort} />
                    <FunnelBar label="Шаг 3" value={c.step3} total={c.triage_in_progress} icon="bi-3-circle" colorClass="triage-quick-s3" category="step3" admissionDate={data.admission_date} onOpen={openCohort} />
                  </>
                ) : (
                  <p className="small text-muted mb-0">Нет активных триажей — детализация по шагам не показана.</p>
                )}
              </div>
            </div>

            <h2 className="h6 mb-2">Завершённые полностью — приоритет</h2>
            <div className="triage-stat-grid triage-stat-grid--compact mb-2 triage-quick-priority-grid">
              {PRIORITY_KEYS.map(({ key, label }) => (
                <PriorityKpi key={key} label={label} value={pb[key] ?? 0} priority={key} admissionDate={data.admission_date} onOpen={openCohort} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
