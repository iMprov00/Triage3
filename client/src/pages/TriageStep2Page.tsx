import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";
import { triageStepMaxSeconds } from "../triageUi";

type Options = { positions: string[]; urgency_criteria: string[]; infection_signs: string[] };

export default function TriageStep2Page() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [opts, setOpts] = useState<Options | null>(null);
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [position, setPosition] = useState("");
  const [urgency, setUrgency] = useState<string[]>([]);
  const [infection, setInfection] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const [o, t] = await Promise.all([
          apiJson<Options>("/api/v1/meta/triage_options"),
          apiJson<Record<string, unknown>>(`/api/v1/patients/${patientId}/triage`),
        ]);
        setOpts(o);
        setTriage(t);
        const s2 = (t.step2_data as Record<string, unknown>) || {};
        if (typeof s2.position === "string") setPosition(s2.position);
        setUrgency(Array.isArray(s2.urgency_criteria) ? (s2.urgency_criteria as string[]) : []);
        setInfection(Array.isArray(s2.infection_signs) ? (s2.infection_signs as string[]) : []);
      } catch {
        setErr("Ошибка загрузки");
      }
    })();
  }, [patientId]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const rem =
    triage?.timer_active && triage.timer_ends_at
      ? Math.max(0, Math.floor((triage.timer_ends_at as number) - Date.now() / 1000))
      : 0;
  const maxTime = triageStepMaxSeconds(triage);
  const timerPct = Math.min(100, (rem / maxTime) * 100);
  const timerTone = rem <= 0 ? "danger" : timerPct <= 25 ? "danger" : timerPct <= 50 ? "warning" : "ok";

  function toggle(arr: string[], v: string, set: (x: string[]) => void) {
    if (arr.includes(v)) set(arr.filter((x) => x !== v));
    else set([...arr, v]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!opts) return;
    try {
      const idxUrgency = urgency.map((label) => String(opts.urgency_criteria.indexOf(label))).filter((i) => i !== "-1");
      const idxInf = infection.map((label) => String(opts.infection_signs.indexOf(label))).filter((i) => i !== "-1");
      const r = await apiJson<{ result?: string }>(`/api/v1/patients/${patientId}/triage/step2`, {
        method: "POST",
        json: { position, urgency_criteria: idxUrgency, infection_signs: idxInf },
      });
      if (r.result === "priority_assigned") nav(`/patients/${patientId}/triage/actions`);
      else nav(`/patients/${patientId}/triage/step3`);
    } catch {
      setErr("Ошибка сохранения");
    }
  }

  if (!opts || !triage) return <div className="container-fluid triag-page-wide"><div className="triage-page-shell py-2 py-sm-3">{err || "Загрузка…"}</div></div>;

  if ((triage.step as number) !== 2) {
    return (
      <div className="container-fluid triag-page-wide">
        <div className="triage-page-shell py-2 py-sm-3">
        <Link to="/patients" className="triage-back-link">← Назад</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell py-2 py-sm-3">
      <div className="triage-page-head">
        <Link to="/patients" className="triage-back-link">← Пациенты</Link>
        <h1 className="h4 triage-page-title">Шаг 2</h1>
      </div>
      <div className={`triage-timer-card triage-timer-card--${timerTone} ${rem <= 0 ? "triage-timer-card--expired" : ""}`}>
        <div className="triage-timer-row">
          <span className="small text-muted">Осталось времени</span>
          <span className="triage-timer-value">{formatTimer(rem)}</span>
        </div>
        <div className="progress triage-timer-progress">
          <div className={`progress-bar triage-timer-bar triage-timer-bar--${timerTone}`} style={{ width: `${timerPct}%` }} />
        </div>
      </div>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <form onSubmit={(e) => void submit(e)} className="card triage-form-card">
        <div className="card-body">
          <label className="form-label">Положение</label>
          <select
            className={`form-select mb-3 ${
              position && position !== "активное положение, свободное перемещение" ? "triage-select-yellow" : ""
            }`}
            required
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="">—</option>
            {opts.positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div className="mb-2 fw-semibold">Критерии неотложности</div>
          <div className="row row-cols-1 g-2 mb-3">
            {opts.urgency_criteria.map((c) => (
              <div key={c} className="col">
                <label className={`triage-check-item ${urgency.includes(c) ? "triage-check-item--yellow" : ""}`}>
                  <input type="checkbox" className="triage-check-input" checked={urgency.includes(c)} onChange={() => toggle(urgency, c, setUrgency)} />
                  <span className="form-check-label triage-check-label">{c}</span>
                </label>
              </div>
            ))}
          </div>
          <div className="mb-2 fw-semibold">Инфекция</div>
          <div className="row row-cols-1 g-2">
            {opts.infection_signs.map((c) => (
              <div key={c} className="col">
                <label className={`triage-check-item ${infection.includes(c) ? "triage-check-item--purple" : ""}`}>
                  <input type="checkbox" className="triage-check-input" checked={infection.includes(c)} onChange={() => toggle(infection, c, setInfection)} />
                  <span className="form-check-label triage-check-label">{c}</span>
                </label>
              </div>
            ))}
          </div>
          <button type="submit" className="btn btn-primary mt-3">
            Сохранить
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
