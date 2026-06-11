import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

export type PeriodAnalytics = {
  steps_completed_histogram: Record<string, number>;
  step_timer_overdue_submits: number;
  actions_phase_completed_over_limit: number;
  brigade_phase_completed_over_limit: number;
  audit_occurred_from: string;
  audit_occurred_to: string;
};

type Props = {
  counts: DashboardCounts;
  priority_breakdown: Record<string, number>;
  period_analytics: PeriodAnalytics;
};

const PRIORITY_META: { key: string; name: string; color: string }[] = [
  { key: "red", name: "Красный", color: "#dc2626" },
  { key: "yellow", name: "Жёлтый", color: "#f59e0b" },
  { key: "purple", name: "Фиолетовый", color: "#8b5cf6" },
  { key: "green", name: "Зелёный", color: "#10b981" },
  { key: "pending", name: "Не определён", color: "#9ca3af" },
];

function tooltipNum(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? String(n) : "0";
}

export default function FullStatisticsCharts({ counts, priority_breakdown, period_analytics }: Props) {
  const t = counts.total_patients;
  const pa = period_analytics;

  const hist = pa.steps_completed_histogram;
  const stepData = [
    { name: "0 шагов", value: Number(hist["0"] ?? 0), fill: "#9ca3af" },
    { name: "1 шаг", value: Number(hist["1"] ?? 0), fill: "#3b82f6" },
    { name: "2 шага", value: Number(hist["2"] ?? 0), fill: "#f59e0b" },
    { name: "3 шага", value: Number(hist["3"] ?? 0), fill: "#10b981" },
  ];

  const alertData = [
    { name: "Просрочка шага (сохранения)", value: pa.step_timer_overdue_submits, fill: "#dc2626" },
    { name: "Фаза действий > 5 мин", value: pa.actions_phase_completed_over_limit, fill: "#ea580c" },
    { name: "Бригада > 12 мин до завершения", value: pa.brigade_phase_completed_over_limit, fill: "#b45309" },
  ];

  const priorityData = PRIORITY_META.map((m) => ({
    name: m.name,
    value: Number(priority_breakdown[m.key] ?? 0),
    fill: m.color,
  })).filter((d) => d.value > 0);

  const priorityTotal = priorityData.reduce((s, d) => s + d.value, 0);

  const renderPieLabel = (props: Record<string, unknown>) => {
    const percent = Number(props.percent ?? 0);
    const value = Number(props.value ?? 0);
    const cx = Number(props.cx ?? 0);
    const cy = Number(props.cy ?? 0);
    const midAngle = Number(props.midAngle ?? 0);
    const innerRadius = Number(props.innerRadius ?? 0);
    const outerRadius = Number(props.outerRadius ?? 0);
    if (!percent || percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#374151" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${value} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  if (t === 0) {
    return (
      <div className="card border-0 shadow-sm mb-3 triage-full-charts">
        <div className="card-body text-muted small py-4 text-center">Нет данных за выбранный период — диаграммы не отображаются.</div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm mb-3 triage-full-charts">
      <div className="card-body">
        <h2 className="h6 text-body mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-bar-chart-line-fill" aria-hidden />
          Наглядно за период
        </h2>
        <p className="small text-muted mb-3 mb-lg-4">
          Гистограмма шагов и просрочки фаз считаются по <strong>всем</strong> записям выборки. События просрочки шага — по аудиту с{" "}
          <strong>{new Date(pa.audit_occurred_from).toLocaleString("ru-RU")}</strong> по{" "}
          <strong>{new Date(pa.audit_occurred_to).toLocaleString("ru-RU")}</strong> (только пациенты из выборки).
        </p>

        <div className="row g-4">
          <div className="col-12 col-xl-5">
            <h3 className="h6 text-secondary mb-2">Завершённые полностью — приоритет</h3>
            <div className="triage-full-chart-box triage-full-chart-box--pie">
              {priorityTotal > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="48%"
                        innerRadius={52}
                        outerRadius={82}
                        paddingAngle={2}
                        label={renderPieLabel}
                        labelLine={false}
                      >
                        {priorityData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="#fff" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => [`${tooltipNum(v)} чел.`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="list-unstyled small mb-0 mt-2 triage-full-priority-legend">
                    {PRIORITY_META.map((m) => {
                      const val = Number(priority_breakdown[m.key] ?? 0);
                      if (val <= 0) return null;
                      const pct = ((val / priorityTotal) * 100).toFixed(1);
                      return (
                        <li key={m.key} className="d-flex align-items-center gap-2 py-1">
                          <span className="triage-full-priority-swatch" style={{ backgroundColor: m.color }} />
                          <span>
                            <strong>{m.name}</strong> — {val} чел. ({pct}%)
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted small text-center px-3">
                  Нет завершённых триажей с приоритетом в этой выборке
                </div>
              )}
            </div>
          </div>

          <div className="col-12 col-xl-7">
            <h3 className="h6 text-secondary mb-2">Сколько шагов триажа завершено (накопительно)</h3>
            <p className="small text-muted mb-2">
              По каждому пациенту с начатым триажем: число завершённых шагов по меткам времени (не «текущий шаг»). Пациенты без триажа:{" "}
              <strong>{counts.without_triage}</strong> — в эту гистограмму не входят.
            </p>
            <div className="triage-full-chart-box triage-full-chart-box--mid">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stepData} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={48} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                  <Tooltip formatter={(v: unknown) => [`${tooltipNum(v)}`, "Пациентов"]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Пациентов">
                    {stepData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-12">
            <h3 className="h6 text-secondary mb-2">Просрочки за период (факты)</h3>
            <ul className="small text-muted mb-2 ps-3">
              <li>
                <strong>Шаг:</strong> сохранения шага 1–3 в журнале аудита с признаком просрочки за указанный интервал времени.
              </li>
              <li>
                <strong>Фаза действий / бригада:</strong> среди завершённых триажей — сколько раз фактическая длительность превысила лимит (5 мин / 12 мин от вызова бригады до завершения фазы).
              </li>
            </ul>
            <div className="triage-full-chart-box triage-full-chart-box--mid">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={alertData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => [`${tooltipNum(v)}`, "Случаев"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Случаев">
                    {alertData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
