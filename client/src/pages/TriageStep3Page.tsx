import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";
import { triageStepMaxSeconds } from "../triageUi";

export default function TriageStep3Page() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const t = await apiJson<Record<string, unknown>>(`/api/v1/patients/${patientId}/triage`);
        setTriage(t);
        const s3 = (t.step3_data as Record<string, unknown>) || {};
        const next: Record<string, string> = {};
        for (const k of ["respiratory_rate", "saturation", "systolic_bp", "diastolic_bp", "heart_rate", "temperature"]) {
          next[k] = s3[k] != null ? String(s3[k]) : "";
        }
        setFields(next);
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

  function fieldPriorityTone(key: string, raw: string): "yellow" | "purple" | null {
    const s = raw.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (key === "respiratory_rate" && (n > 24 || n < 16)) return "yellow";
    if (key === "saturation" && n < 93) return "yellow";
    if (key === "systolic_bp" && n >= 140) return "yellow";
    if (key === "diastolic_bp" && n >= 90) return "yellow";
    if (key === "heart_rate" && (n > 110 || n < 50)) return "yellow";
    if (key === "temperature" && n >= 37.5) return "purple";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await apiJson(`/api/v1/patients/${patientId}/triage/step3`, {
        method: "POST",
        json: fields,
      });
      nav(`/patients/${patientId}/triage/actions`);
    } catch {
      setErr("Ошибка сохранения");
    }
  }

  if (!triage) return <div className="container-fluid triag-page-wide"><div className="triage-page-shell py-2 py-sm-3">{err || "Загрузка…"}</div></div>;

  if ((triage.step as number) !== 3) {
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
        <h1 className="h4 triage-page-title">Шаг 3</h1>
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
      <form onSubmit={(e) => void submit(e)} className="card triage-form-card triage-step3-form">
        <div className="card-body row g-2">
          {[
            ["respiratory_rate", "ЧДД"],
            ["saturation", "Сатурация"],
            ["systolic_bp", "Систолическое АД"],
            ["diastolic_bp", "Диастолическое АД"],
            ["heart_rate", "ЧСС"],
            ["temperature", "Температура"],
          ].map(([key, label]) => {
            const tone = fieldPriorityTone(key, fields[key] || "");
            const toneClass =
              tone === "yellow" ? " triage-input-yellow" : tone === "purple" ? " triage-input-purple" : "";
            return (
            <div className="col-md-6" key={key}>
              <label className="form-label">{label}</label>
              <input
                type="text"
                inputMode="decimal"
                className={`form-control${toneClass}`}
                value={fields[key] || ""}
                onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
              />
            </div>
            );
          })}
          <div className="col-12">
            <button type="submit" className="btn btn-primary">
              Завершить триаж
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
