import { Link } from "react-router-dom";
import { useQuickStatisticsDashboard } from "./quickStats/useQuickStatisticsDashboard";

function FunnelBar({
  label,
  value,
  total,
  icon,
  colorClass,
}: {
  label: string;
  value: number;
  total: number;
  icon: string;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const widthPct = total > 0 ? Math.max(6, (value / total) * 100) : 0;

  return (
    <div className="triage-quick-funnel-row mb-2">
      <div className="d-flex align-items-center gap-2 mb-1">
        <i className={`bi ${icon} triage-quick-funnel-ico ${colorClass}`} aria-hidden />
        <span className="small fw-medium">{label}</span>
        <span className="small text-muted ms-auto">
          {value} <span className="text-muted">({pct}%)</span>
        </span>
      </div>
      <div className="triage-quick-funnel-track">
        <div className={`triage-quick-funnel-fill ${colorClass}`} style={{ width: `${widthPct}%` }} title={`${value} из ${total}`} />
      </div>
    </div>
  );
}

function MiniKpi({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="triage-quick-mini">
      <i className={`bi ${icon}`} aria-hidden />
      <div>
        <div className="triage-quick-mini-val">{value}</div>
        <div className="triage-quick-mini-lbl">{label}</div>
      </div>
    </div>
  );
}

export default function QuickStatisticsPage() {
  const { admissionDate, setAdmissionDate, data, err, load } = useQuickStatisticsDashboard();
  const c = data?.counts;
  const a = data?.alerts;
  const pb = data?.priority_breakdown || {};
  const total = c?.total_patients ?? 0;
  const done = c?.fully_completed ?? 0;
  const notDoneFully = Math.max(0, total - done);
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const anyAlert = (a?.step_timer_expired ?? 0) + (a?.actions_timer_expired ?? 0) + (a?.brigade_timer_expired ?? 0) > 0;

  return (
    <div className="container-fluid triag-page-wide triage-stats-page triage-quick-page">
      <div className="triage-page-shell py-2 py-sm-3">
        <div className="triage-page-head d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <Link to="/patients" className="triage-back-link">
              ← Пациенты
            </Link>
            <h1 className="h4 triage-page-title mb-0">Быстрая статистика</h1>
            <p className="text-muted small mb-0">Сводка по дате поступления: доля завершённых, поток по этапам и детали</p>
          </div>
          <Link to="/statistics/full" className="btn btn-outline-secondary btn-sm">
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
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Обновить
              </button>
            </div>
          </div>
        </div>

        {err ? <div className="alert alert-danger py-2">{err}</div> : null}

        {data && c ? (
          <>
            <div className={`triage-quick-strip mb-3 ${anyAlert ? "triage-quick-strip--bad" : "triage-quick-strip--ok"}`}>
              <i className={`bi ${anyAlert ? "bi-exclamation-triangle-fill" : "bi-check-circle-fill"}`} aria-hidden />
              <span>
                {anyAlert
                  ? `Просрочки: шаг ${a?.step_timer_expired ?? 0}, действия ${a?.actions_timer_expired ?? 0}, бригада ${a?.brigade_timer_expired ?? 0}`
                  : "Просрочек по таймерам нет"}
              </span>
              <span className="triage-quick-strip-meta">{new Date(data.as_of).toLocaleString("ru-RU")}</span>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-12 col-lg-4">
                <div className="card border-0 shadow-sm h-100 triage-quick-donut-card">
                  <div className="card-body d-flex flex-column align-items-center justify-content-center py-4">
                    <div
                      className="triage-quick-donut"
                      style={{
                        background: `conic-gradient(var(--triag-primary) 0% ${donePct}%, #e5e7eb ${donePct}% 100%)`,
                      }}
                      title={`Завершено полностью: ${donePct}%`}
                    >
                      <div className="triage-quick-donut-hole">
                        <div className="triage-quick-donut-pct">{donePct}%</div>
                        <div className="triage-quick-donut-cap">завершено</div>
                      </div>
                    </div>
                    <div className="small text-muted mt-3 text-center px-1">
                      Всего <strong>{total}</strong> · не завершено полностью <strong>{notDoneFully}</strong> · готово{" "}
                      <strong>{done}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-8">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body">
                    <h2 className="h6 text-body mb-2">Сейчас по счётчикам</h2>
                    <div className="triage-quick-mini-grid">
                      <MiniKpi label="Без триажа" value={c.without_triage} icon="bi-person-x-fill" />
                      <MiniKpi label="В процессе" value={c.triage_in_progress} icon="bi-arrow-repeat" />
                      <MiniKpi label="Шаг 1" value={c.step1} icon="bi-1-circle-fill" />
                      <MiniKpi label="Шаг 2" value={c.step2} icon="bi-2-circle-fill" />
                      <MiniKpi label="Шаг 3" value={c.step3} icon="bi-3-circle-fill" />
                      <MiniKpi label="Фаза действий" value={c.in_actions_phase} icon="bi-lightning-fill" />
                      <MiniKpi label="Проср. шаг" value={a?.step_timer_expired ?? 0} icon="bi-stopwatch" />
                      <MiniKpi label="Проср. действ." value={a?.actions_timer_expired ?? 0} icon="bi-hourglass-bottom" />
                      <MiniKpi label="Проср. бриг." value={a?.brigade_timer_expired ?? 0} icon="bi-truck-front-fill" />
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
                <FunnelBar label="Всего поступило" value={total} total={Math.max(total, 1)} icon="bi-people-fill" colorClass="triage-quick-c-total" />
                <FunnelBar label="Без начатого триажа" value={c.without_triage} total={total} icon="bi-person-x" colorClass="triage-quick-c-warn" />
                <FunnelBar label="Триаж в процессе (на шагах)" value={c.triage_in_progress} total={total} icon="bi-list-task" colorClass="triage-quick-c-open" />
                <FunnelBar label="Фаза действий по приоритету" value={c.in_actions_phase} total={total} icon="bi-lightning-charge-fill" colorClass="triage-quick-c-act" />
                <FunnelBar label="Полностью завершено" value={c.fully_completed} total={total} icon="bi-check2-all" colorClass="triage-quick-c-done" />

                <hr className="my-3" />
                <div className="small text-muted mb-1">На шагах (доля от «в процессе»)</div>
                {c.triage_in_progress > 0 ? (
                  <>
                    <FunnelBar label="Шаг 1" value={c.step1} total={c.triage_in_progress} icon="bi-1-circle" colorClass="triage-quick-s1" />
                    <FunnelBar label="Шаг 2" value={c.step2} total={c.triage_in_progress} icon="bi-2-circle" colorClass="triage-quick-s2" />
                    <FunnelBar label="Шаг 3" value={c.step3} total={c.triage_in_progress} icon="bi-3-circle" colorClass="triage-quick-s3" />
                  </>
                ) : (
                  <p className="small text-muted mb-0">Нет активных триажей — детализация по шагам не показана.</p>
                )}
              </div>
            </div>

            <h2 className="h6 mb-2">Завершённые полностью — приоритет</h2>
            <div className="triage-stat-grid triage-stat-grid--compact mb-2">
              <div className="triage-stat-kpi triage-stat-kpi--neutral">
                <div className="triage-stat-kpi-value">{pb.red ?? 0}</div>
                <div className="triage-stat-kpi-label">Красный</div>
              </div>
              <div className="triage-stat-kpi triage-stat-kpi--neutral">
                <div className="triage-stat-kpi-value">{pb.yellow ?? 0}</div>
                <div className="triage-stat-kpi-label">Жёлтый</div>
              </div>
              <div className="triage-stat-kpi triage-stat-kpi--neutral">
                <div className="triage-stat-kpi-value">{pb.purple ?? 0}</div>
                <div className="triage-stat-kpi-label">Фиолетовый</div>
              </div>
              <div className="triage-stat-kpi triage-stat-kpi--neutral">
                <div className="triage-stat-kpi-value">{pb.green ?? 0}</div>
                <div className="triage-stat-kpi-label">Зелёный</div>
              </div>
              <div className="triage-stat-kpi triage-stat-kpi--neutral">
                <div className="triage-stat-kpi-value">{pb.pending ?? 0}</div>
                <div className="triage-stat-kpi-label">Не определён</div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
