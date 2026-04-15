import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";

const APPEAL_TYPES = [
  "Плановая госпитализация по направлению",
  "Самообращение",
  "СМП",
  "ДКЦ",
];

type Props = { mode: "new" | "edit" };

export default function PatientFormPage({ mode }: Props) {
  const { patientId } = useParams();
  const nav = useNavigate();
  const [fullName, setFullName] = useState("");
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [admissionTime, setAdmissionTime] = useState("08:00");
  const [birthDate, setBirthDate] = useState("");
  const [appealType, setAppealType] = useState(APPEAL_TYPES[0]);
  const [pregnancyUnknown, setPregnancyUnknown] = useState(false);
  const [pregnancyWeeks, setPregnancyWeeks] = useState("");
  const [performerUserId, setPerformerUserId] = useState<number | "">("");
  const [users, setUsers] = useState<{ id: number; full_name: string }[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const m = await apiJson<{ users: { id: number; full_name: string }[] }>("/api/v1/meta/performer_users");
        setUsers(m.users);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !patientId) return;
    void (async () => {
      try {
        const r = await apiJson<{ patient: Record<string, unknown> }>(`/api/v1/patients/${patientId}`);
        const p = r.patient;
        setFullName(String(p.full_name || ""));
        setAdmissionDate(String(p.admission_date || ""));
        setAdmissionTime(String(p.admission_time || "08:00"));
        setBirthDate(String(p.birth_date || ""));
        setAppealType(String(p.appeal_type || APPEAL_TYPES[0]));
        setPregnancyUnknown(Boolean(p.pregnancy_unknown));
        setPregnancyWeeks(p.pregnancy_weeks != null ? String(p.pregnancy_weeks) : "");
        if (p.performer_user_id) setPerformerUserId(Number(p.performer_user_id));
      } catch {
        setErr("Не удалось загрузить пациента");
      }
    })();
  }, [mode, patientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const body: Record<string, unknown> = {
      full_name: fullName,
      admission_date: admissionDate,
      admission_time: admissionTime,
      birth_date: birthDate,
      appeal_type: appealType,
      pregnancy_unknown: pregnancyUnknown,
      pregnancy_weeks: pregnancyUnknown ? null : pregnancyWeeks || null,
    };
    if (performerUserId !== "") body.performer_user_id = performerUserId;
    try {
      if (mode === "new") {
        await apiJson("/api/v1/patients", { method: "POST", json: body });
        nav(`/patients?admission_date=${encodeURIComponent(admissionDate)}`);
      } else {
        await apiJson(`/api/v1/patients/${patientId}`, { method: "PATCH", json: body });
        nav("/patients");
      }
    } catch (ex: unknown) {
      const e = ex as { body?: { errors?: string[] } };
      setErr(e.body?.errors?.join(", ") || "Ошибка сохранения");
    }
  }

  return (
    <div className="container py-3" style={{ maxWidth: 640 }}>
      <div className="mb-3">
        <Link to="/patients">← К списку</Link>
      </div>
      <h1 className="h4 mb-3">{mode === "new" ? "Новый пациент" : "Карта пациента"}</h1>
      <form onSubmit={(e) => void submit(e)} className="card shadow-sm">
        <div className="card-body">
          {err && <div className="alert alert-danger py-2">{err}</div>}
          <div className="mb-2">
            <label className="form-label">ФИО</label>
            <input className="form-control" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Дата поступления</label>
              <input type="date" className="form-control" required value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Время</label>
              <input type="time" className="form-control" required value={admissionTime} onChange={(e) => setAdmissionTime(e.target.value)} />
            </div>
          </div>
          <div className="mt-2">
            <label className="form-label">Дата рождения</label>
            <input type="date" className="form-control" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div className="mt-2">
            <label className="form-label">Вид обращения</label>
            <select className="form-select" value={appealType} onChange={(e) => setAppealType(e.target.value)}>
              {APPEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {users.length > 0 && (
            <div className="mt-2">
              <label className="form-label">Исполнитель</label>
              <select
                className="form-select"
                value={performerUserId === "" ? "" : String(performerUserId)}
                onChange={(e) => setPerformerUserId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">По умолчанию</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-check mt-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="pu"
              checked={pregnancyUnknown}
              onChange={(e) => setPregnancyUnknown(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="pu">
              Срок беременности неизвестен
            </label>
          </div>
          {!pregnancyUnknown && (
            <div className="mt-2">
              <label className="form-label">Недель беременности</label>
              <input type="number" step="0.1" className="form-control" value={pregnancyWeeks} onChange={(e) => setPregnancyWeeks(e.target.value)} />
            </div>
          )}
          <button type="submit" className="btn btn-primary mt-3">
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
