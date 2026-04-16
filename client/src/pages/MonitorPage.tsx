import { useCallback, useEffect, useMemo, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { apiJson, formatTimer } from "../api";

type MonitorPatientRow = {
  id: number;
  full_name: string;
  performer_name?: string | null;
  appeal_type?: string | null;
  admission_time?: string | null;
  step: number;
  step_name: string;
  priority?: string | null;
  priority_name?: string | null;
  is_in_actions: boolean;
  timer_ends_at?: number | null;
  max_time?: number;
  time_remaining?: number;
  actions_timer_ends_at?: number | null;
  actions_max_time?: number;
  actions_time_remaining?: number;
  brigade_timer_ends_at?: number | null;
  brigade_max_time?: number;
  brigade_timer_label?: string | null;
  actions_total?: number;
  actions_completed?: number;
};

function priorityTone(priority?: string | null): "red" | "yellow" | "purple" | "green" | "neutral" {
  const p = (priority || "").toLowerCase();
  if (p === "red") return "red";
  if (p === "yellow") return "yellow";
  if (p === "purple") return "purple";
  if (p === "green") return "green";
  return "neutral";
}

function timerVisualTone(remaining: number, maxTime: number): "danger" | "warning" | "ok" {
  if (remaining <= 0) return "danger";
  const pct = maxTime > 0 ? (remaining / maxTime) * 100 : 0;
  if (pct <= 25) return "danger";
  if (pct <= 50) return "warning";
  return "ok";
}

function endsRemaining(endsAt?: number | null): number {
  if (endsAt == null) return 0;
  return Math.max(0, Math.floor(endsAt - Date.now() / 1000));
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatWeekdayDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MonitorPage() {
  const [rows, setRows] = useState<MonitorPatientRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [lastCableAt, setLastCableAt] = useState<number | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<MonitorPatientRow[]>("/api/v1/monitor/patients");
      setRows(data);
      setLoadErr("");
      setLastFetchAt(Date.now() / 1000);
    } catch {
      setLoadErr("Нет связи с сервером");
    }
  }, []);

  useEffect(() => {
    document.title = "Монитор · Триаж";
    return () => {
      document.title = "TriagV3";
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const consumer = createConsumer("/cable");
    const sub = consumer.subscriptions.create("MonitorChannel", {
      received(msg: { patients?: MonitorPatientRow[]; at?: number }) {
        if (msg.patients) {
          setRows(msg.patients);
          setLoadErr("");
        }
        if (typeof msg.at === "number") setLastCableAt(msg.at);
      },
    });
    return () => {
      sub.unsubscribe();
      consumer.disconnect();
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const pa = priorityTone(a.priority);
      const pb = priorityTone(b.priority);
      const order = { red: 0, yellow: 1, purple: 2, green: 3, neutral: 4 };
      if (order[pa] !== order[pb]) return order[pa] - order[pb];
      return String(a.full_name).localeCompare(String(b.full_name), "ru");
    });
  }, [rows]);

  const liveHint = useMemo(() => {
    if (lastCableAt != null) {
      const sec = Math.max(0, Math.floor(Date.now() / 1000 - lastCableAt));
      if (sec < 3) return "онлайн-обновления";
      if (sec < 60) return `канал: ${sec} с назад`;
      return `канал: ${Math.floor(sec / 60)} мин назад`;
    }
    if (lastFetchAt != null) {
      const sec = Math.max(0, Math.floor(Date.now() / 1000 - lastFetchAt));
      if (sec < 60) return `список: ${sec} с назад`;
      return `список: ${Math.floor(sec / 60)} мин назад`;
    }
    return "загрузка…";
  }, [lastCableAt, lastFetchAt, now]);

  return (
    <div className="triag-monitor-page monitor-tv">
      <header className="monitor-tv-header">
        <div className="monitor-tv-brand">
          <img className="monitor-tv-logo" src="/icons/icon.png" width={56} height={56} alt="" />
          <div>
            <h1 className="monitor-tv-title">Монитор триажа</h1>
            <p className="monitor-tv-subtitle">активные пациенты · центр учреждения</p>
          </div>
        </div>
        <div className="monitor-tv-clock-block">
          <div className="monitor-tv-clock" aria-live="polite">
            {formatClock(now)}
          </div>
          <div className="monitor-tv-date">{formatWeekdayDate(now)}</div>
          <div className="monitor-tv-live">{loadErr || liveHint}</div>
        </div>
      </header>

      {sortedRows.length === 0 ? (
        <div className="monitor-tv-empty">
          <div className="monitor-tv-empty-icon" aria-hidden />
          <p className="monitor-tv-empty-title">Нет активных пациентов на мониторе</p>
          <p className="monitor-tv-empty-text">
            Здесь появятся пациенты с запущенным таймером триажа или в фазе выполнения действий.
          </p>
        </div>
      ) : (
        <div className="monitor-tv-grid">
          {sortedRows.map((r) => (
            <MonitorTvCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonitorTvCard({ row: r }: { row: MonitorPatientRow }) {
  const tone = priorityTone(r.priority);
  const priorityLabel = (r.priority_name || "").trim() || "—";

  if (r.is_in_actions) {
    const maxA = r.actions_max_time || 300;
    const remA = r.actions_timer_ends_at != null ? endsRemaining(r.actions_timer_ends_at) : r.actions_time_remaining ?? 0;
    const pctA = Math.min(100, maxA > 0 ? (remA / maxA) * 100 : 0);
    const barToneA = timerVisualTone(remA, maxA);

    const hasBrigade = r.brigade_timer_ends_at != null && (r.brigade_max_time || 0) > 0;
    const maxB = r.brigade_max_time || 1;
    const remB = hasBrigade ? endsRemaining(r.brigade_timer_ends_at) : 0;
    const pctB = hasBrigade ? Math.min(100, maxB > 0 ? (remB / maxB) * 100 : 0) : 0;
    const barToneB = timerVisualTone(remB, maxB);

    const total = r.actions_total ?? 0;
    const done = Math.min(r.actions_completed ?? 0, total);
    const actionPct = total > 0 ? (done / total) * 100 : 0;

    return (
      <article className={`monitor-tv-card monitor-tv-card--priority-${tone}`}>
        <div className="monitor-tv-card-accent" aria-hidden />
        <div className="monitor-tv-card-inner">
          <div className="monitor-tv-card-top">
            <h2 className="monitor-tv-name">{r.full_name}</h2>
            <div className={`monitor-tv-pill monitor-tv-pill--${tone}`}>{priorityLabel}</div>
          </div>
          <div className="monitor-tv-meta">
            {r.appeal_type ? <span className="monitor-tv-meta-item">{r.appeal_type}</span> : null}
            {r.admission_time ? <span className="monitor-tv-meta-item">Поступление · {r.admission_time}</span> : null}
            <span className="monitor-tv-meta-item">
              Исполнитель: <strong>{r.performer_name || "—"}</strong>
            </span>
          </div>
          <div className="monitor-tv-phase monitor-tv-phase--actions">Фаза действий по приоритету</div>

          {total > 0 ? (
            <div className="monitor-tv-actions-progress">
              <div className="monitor-tv-actions-progress-label">
                Выполнено <strong>{done}</strong> из <strong>{total}</strong>
              </div>
              <div className="monitor-tv-bar track">
                <div className="monitor-tv-bar fill monitor-tv-bar--muted" style={{ width: `${actionPct}%` }} />
              </div>
            </div>
          ) : null}

          <div className="monitor-tv-timer-block">
            <div className="monitor-tv-timer-label">Таймер действий</div>
            <div className={`monitor-tv-digits monitor-tv-digits--${barToneA}`}>{formatTimer(remA)}</div>
            <div className="monitor-tv-bar track monitor-tv-bar-tall">
              <div className={`monitor-tv-bar fill monitor-tv-bar--${barToneA}`} style={{ width: `${pctA}%` }} />
            </div>
          </div>

          {hasBrigade ? (
            <div className="monitor-tv-timer-block monitor-tv-timer-block--secondary">
              <div className="monitor-tv-timer-label">{r.brigade_timer_label || "Бригада"}</div>
              <div className={`monitor-tv-digits monitor-tv-digits--sm monitor-tv-digits--${barToneB}`}>{formatTimer(remB)}</div>
              <div className="monitor-tv-bar track">
                <div className={`monitor-tv-bar fill monitor-tv-bar--${barToneB}`} style={{ width: `${pctB}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const maxT = r.max_time || 120;
  const remT = r.timer_ends_at != null ? endsRemaining(r.timer_ends_at) : r.time_remaining ?? 0;
  const pctT = Math.min(100, maxT > 0 ? (remT / maxT) * 100 : 0);
  const barToneT = timerVisualTone(remT, maxT);

  return (
    <article className={`monitor-tv-card monitor-tv-card--priority-${tone}`}>
      <div className="monitor-tv-card-accent" aria-hidden />
      <div className="monitor-tv-card-inner">
        <div className="monitor-tv-card-top">
          <h2 className="monitor-tv-name">{r.full_name}</h2>
          <div className={`monitor-tv-pill monitor-tv-pill--${tone}`}>{priorityLabel}</div>
        </div>
        <div className="monitor-tv-meta">
          {r.appeal_type ? <span className="monitor-tv-meta-item">{r.appeal_type}</span> : null}
          {r.admission_time ? <span className="monitor-tv-meta-item">Поступление · {r.admission_time}</span> : null}
          <span className="monitor-tv-meta-item">
            Исполнитель: <strong>{r.performer_name || "—"}</strong>
          </span>
        </div>
        <div className="monitor-tv-phase">
          Триаж · шаг {r.step}: {r.step_name}
        </div>
        <div className="monitor-tv-timer-block">
          <div className="monitor-tv-timer-label">Осталось на шаг</div>
          <div className={`monitor-tv-digits monitor-tv-digits--${barToneT}`}>{formatTimer(remT)}</div>
          <div className="monitor-tv-bar track monitor-tv-bar-tall">
            <div className={`monitor-tv-bar fill monitor-tv-bar--${barToneT}`} style={{ width: `${pctT}%` }} />
          </div>
        </div>
      </div>
    </article>
  );
}
