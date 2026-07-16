import { useCallback, useEffect, useMemo, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { apiJson } from "../api";

type MonitorPatientRow = {
  id: number;
  full_name: string;
  performer_name?: string | null;
  appeal_type?: string | null;
  admission_time?: string | null;
  current_phase: string;
  phase_label: string;
  priority?: string | null;
  priority_name?: string | null;
  workflow_route?: string | null;
  stage1_priority?: string | null;
  stage1_priority_name?: string | null;
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

function workflowPhaseLabel(route?: string | null): string | null {
  if (route === "pre_doctor") return "Шаг 1";
  if (route === "doctor_examination") return "Шаг 2";
  if (route === "decision") return "Решение";
  if (route === "actions") return "Действия";
  return null;
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

  const load = useCallback(async () => {
    try {
      const data = await apiJson<MonitorPatientRow[]>("/api/v1/stage2/monitor/patients");
      setRows(data);
      setLoadErr("");
    } catch {
      setLoadErr("Нет связи с сервером");
    }
  }, []);

  useEffect(() => {
    document.title = "Монитор · Триаж · Этап 2";
    return () => {
      document.title = "Триаж · Этап 2";
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
    const sub = consumer.subscriptions.create("Stage2PatientsListChannel", {
      received(msg: { type?: string; patients?: MonitorPatientRow[] }) {
        if (msg.type === "monitor_tick" && msg.patients) {
          setRows(msg.patients);
          setLoadErr("");
        }
        if (msg.type === "refresh") void load();
      },
    });
    return () => {
      sub.unsubscribe();
      consumer.disconnect();
    };
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), "ru"));
  }, [rows]);

  return (
    <div className="triag-monitor-page monitor-tv">
      <header className="monitor-tv-header">
        <div className="monitor-tv-brand">
          <img className="monitor-tv-logo" src="/icons/icon.png" width={56} height={56} alt="" />
          <div>
            <h1 className="monitor-tv-title">Монитор · Этап 2</h1>
            <p className="monitor-tv-subtitle">активные пациенты второго этапа триажа</p>
          </div>
        </div>
        <div className="monitor-tv-clock-block">
          <div className="monitor-tv-clock" aria-live="polite">
            {formatClock(now)}
          </div>
          <div className="monitor-tv-date">{formatWeekdayDate(now)}</div>
          <div className="monitor-tv-live">{loadErr || "онлайн-обновления"}</div>
        </div>
      </header>

      {sortedRows.length === 0 ? (
        <div className="monitor-tv-empty">
          <p className="monitor-tv-empty-title">Нет активных пациентов на этапе 2</p>
          <p className="monitor-tv-empty-text">Пациенты появятся после приёма с этапа 1.</p>
        </div>
      ) : (
        <div className="monitor-tv-grid">
          {sortedRows.map((r) => {
            const tone = priorityTone(r.stage1_priority || r.priority);
            const priorityLabel = r.priority_name || r.stage1_priority_name || "—";
            const workflowLabel = workflowPhaseLabel(r.workflow_route);
            return (
              <article key={r.id} className={`monitor-tv-card monitor-tv-card--priority-${tone}`}>
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
                    {workflowLabel ? `${workflowLabel} · ` : ""}
                    {r.phase_label}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
