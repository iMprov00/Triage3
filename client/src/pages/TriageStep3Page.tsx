import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";

export default function TriageStep3Page() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

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

  const rem =
    triage?.timer_active && triage.timer_ends_at
      ? Math.max(0, Math.floor((triage.timer_ends_at as number) - Date.now() / 1000))
      : 0;

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

  if (!triage) return <div className="container py-3">{err || "Загрузка…"}</div>;

  if ((triage.step as number) !== 3) {
    return (
      <div className="container py-3">
        <Link to="/patients">← Назад</Link>
      </div>
    );
  }

  return (
    <div className="container py-3">
      <Link to="/patients">← Пациенты</Link>
      <h1 className="h4 mt-2">Шаг 3</h1>
      <div className="alert alert-secondary py-2">Осталось: {formatTimer(rem)}</div>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <form onSubmit={(e) => void submit(e)} className="card">
        <div className="card-body row g-2">
          {[
            ["respiratory_rate", "ЧДД"],
            ["saturation", "Сатурация"],
            ["systolic_bp", "Систолическое АД"],
            ["diastolic_bp", "Диастолическое АД"],
            ["heart_rate", "ЧСС"],
            ["temperature", "Температура"],
          ].map(([key, label]) => (
            <div className="col-md-6" key={key}>
              <label className="form-label">{label}</label>
              <input className="form-control" value={fields[key] || ""} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
            </div>
          ))}
          <div className="col-12">
            <button type="submit" className="btn btn-primary">
              Завершить триаж
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
