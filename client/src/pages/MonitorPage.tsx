import { useEffect, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { formatTimer } from "../api";

type Row = Record<string, unknown>;

export default function MonitorPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const consumer = createConsumer("/cable");
    const sub = consumer.subscriptions.create("MonitorChannel", {
      received(msg: { patients?: Row[] }) {
        if (msg.patients) setRows(msg.patients);
      },
    });
    return () => {
      sub.unsubscribe();
      consumer.disconnect();
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setRows((r) => [...r]), 1000);
    return () => window.clearInterval(t);
  }, []);

  function triageRemaining(r: Row): number {
    const ends = r.timer_ends_at as number | undefined;
    if (!ends) return 0;
    return Math.max(0, Math.floor(ends - Date.now() / 1000));
  }

  function actionsRemaining(r: Row): number {
    const ends = r.actions_timer_ends_at as number | undefined;
    if (!ends) return 0;
    return Math.max(0, Math.floor(ends - Date.now() / 1000));
  }

  return (
    <div className="container-fluid py-3 bg-dark text-white min-vh-100">
      <h1 className="h4 mb-3">Монитор</h1>
      <div className="row g-3">
        {rows.map((r) => (
          <div key={String(r.id)} className="col-12 col-md-6 col-lg-4">
            <div className="card bg-secondary text-white h-100">
              <div className="card-body">
                <div className="fw-bold">{String(r.full_name)}</div>
                <div className="small text-white-50">{String(r.performer_name || "")}</div>
                {r.is_in_actions ? (
                  <div className="mt-2">
                    <div className="small">Действия</div>
                    {r.actions_timer_ends_at != null && (
                      <div className="h5 mb-0">{formatTimer(actionsRemaining(r))}</div>
                    )}
                    {r.brigade_timer_ends_at != null && (
                      <div className="small mt-1">Бригада: {formatTimer(Math.max(0, Math.floor((r.brigade_timer_ends_at as number) - Date.now() / 1000)))}</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="small">
                      Шаг {String(r.step)} — {String(r.step_name)}
                    </div>
                    {r.timer_ends_at != null && <div className="h5 mb-0">{formatTimer(triageRemaining(r))}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
