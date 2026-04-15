import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";

type Options = {
  eye_opening: string[];
  verbal_response: string[];
  motor_response: string[];
};

export default function TriageStep1Page() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [opts, setOpts] = useState<Options | null>(null);
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [eye, setEye] = useState("");
  const [verbal, setVerbal] = useState("");
  const [motor, setMotor] = useState("");
  const [breathing, setBreathing] = useState(true);
  const [heartbeat, setHeartbeat] = useState(true);
  const [seizures, setSeizures] = useState(false);
  const [bleeding, setBleeding] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [o, t] = await Promise.all([
          apiJson<Options>("/api/v1/meta/triage_options"),
          apiJson<Record<string, unknown>>(`/api/v1/patients/${patientId}/triage`),
        ]);
        setOpts(o);
        setTriage(t);
        const s1 = (t.step1_data as Record<string, unknown>) || {};
        if (typeof s1.eye_opening === "string") setEye(s1.eye_opening);
        if (typeof s1.verbal_response === "string") setVerbal(s1.verbal_response);
        if (typeof s1.motor_response === "string") setMotor(s1.motor_response);
        if (s1.breathing != null) setBreathing(s1.breathing === true || s1.breathing === "true");
        if (s1.heartbeat != null) setHeartbeat(s1.heartbeat === true || s1.heartbeat === "true");
        if (s1.seizures != null) setSeizures(s1.seizures === true || s1.seizures === "true");
        if (s1.active_bleeding != null) setBleeding(s1.active_bleeding === true || s1.active_bleeding === "true");
      } catch {
        setErr("Нет доступа или триаж не начат");
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
      const r = await apiJson<{ result?: string }>(`/api/v1/patients/${patientId}/triage/step1`, {
        method: "POST",
        json: {
          eye_opening: eye,
          verbal_response: verbal,
          motor_response: motor,
          breathing,
          heartbeat,
          seizures,
          active_bleeding: bleeding,
        },
      });
      if (r.result === "priority_assigned") nav(`/patients/${patientId}/triage/actions`);
      else nav(`/patients/${patientId}/triage/step2`);
    } catch (ex: unknown) {
      const er = ex as { body?: { error?: string } };
      setErr(er.body?.error || "Ошибка");
    }
  }

  if (!opts || !triage) {
    return (
      <div className="container py-3">
        {err || "Загрузка…"}
        <div className="mt-2">
          <Link to="/patients">← Назад</Link>
        </div>
      </div>
    );
  }

  if ((triage.step as number) !== 1) {
    return (
      <div className="container py-3">
        <p>Откройте текущий шаг из списка.</p>
        <Link to="/patients">← Назад</Link>
      </div>
    );
  }

  return (
    <div className="container py-3">
      <Link to="/patients">← Пациенты</Link>
      <h1 className="h4 mt-2">Шаг 1</h1>
      <div className="alert alert-secondary py-2">Осталось: {formatTimer(rem)}</div>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <form onSubmit={(e) => void submit(e)} className="card">
        <div className="card-body row g-3">
          <div className="col-md-4">
            <label className="form-label">Открывание глаз</label>
            <select className="form-select" required value={eye} onChange={(e) => setEye(e.target.value)}>
              <option value="">—</option>
              {opts.eye_opening.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Речь</label>
            <select className="form-select" required value={verbal} onChange={(e) => setVerbal(e.target.value)}>
              <option value="">—</option>
              {opts.verbal_response.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Двигательные</label>
            <select className="form-select" required value={motor} onChange={(e) => setMotor(e.target.value)}>
              <option value="">—</option>
              {opts.motor_response.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="checkbox" id="br" checked={breathing} onChange={(e) => setBreathing(e.target.checked)} />
              <label className="form-check-label" htmlFor="br">
                Дыхание да
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="checkbox" id="hb" checked={heartbeat} onChange={(e) => setHeartbeat(e.target.checked)} />
              <label className="form-check-label" htmlFor="hb">
                Сердцебиение да
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="checkbox" id="sz" checked={seizures} onChange={(e) => setSeizures(e.target.checked)} />
              <label className="form-check-label" htmlFor="sz">
                Судороги
              </label>
            </div>
            <div className="form-check form-check-inline">
              <input className="form-check-input" type="checkbox" id="bl" checked={bleeding} onChange={(e) => setBleeding(e.target.checked)} />
              <label className="form-check-label" htmlFor="bl">
                Кровотечение
              </label>
            </div>
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary">
              Сохранить шаг
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
