import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api";
import Stage1ChecklistModal from "../components/Stage1ChecklistModal";
import VasSmileyPicker from "../components/VasSmileyPicker";

type Option = { key: string; label: string; requires?: string[]; requires_edema_location?: boolean };

type VitalField = { key: string; label: string };

type PreDoctorOptions = {
  discharge: Option[];
  fetal_heart_rate: Option[];
  uterine_tone: Option[];
  skin_findings: Option[];
  edema_locations: Option[];
  vitals: VitalField[];
  pain_vas_min: number;
  pain_vas_max: number;
};

type TriageState = {
  pre_doctor_data: Record<string, unknown>;
  pre_doctor_completed: boolean;
};

const EMPTY_VITALS: Record<string, string> = {
  systolic_bp: "",
  diastolic_bp: "",
  heart_rate: "",
  respiratory_rate: "",
  saturation: "",
};

export default function PreDoctorStepPage() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const pid = Number(patientId);
  const [opts, setOpts] = useState<PreDoctorOptions | null>(null);
  const [patientName, setPatientName] = useState("");
  const [discharge, setDischarge] = useState("");
  const [fetalHr, setFetalHr] = useState("");
  const [uterineTone, setUterineTone] = useState("");
  const [contractionDurationSec, setContractionDurationSec] = useState("");
  const [contractionIntervalMin, setContractionIntervalMin] = useState("");
  const [painVas, setPainVas] = useState<number | null>(null);
  const [skinFinding, setSkinFinding] = useState("");
  const [edemaLocation, setEdemaLocation] = useState("");
  const [vitals, setVitals] = useState<Record<string, string>>(EMPTY_VITALS);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const [options, triage, details] = await Promise.all([
          apiJson<PreDoctorOptions>("/api/v1/stage2/meta/pre_doctor_options"),
          apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
          apiJson<{ patient: { full_name: string } }>(`/api/v1/stage2/patients/${patientId}`),
        ]);
        setOpts(options);
        setPatientName(details.patient.full_name);
        if (triage.pre_doctor_completed) {
          nav(`/patients/${patientId}/priority-actions`, { replace: true });
          return;
        }
        const pd = triage.pre_doctor_data || {};
        if (pd.discharge) setDischarge(String(pd.discharge));
        if (pd.fetal_heart_rate) setFetalHr(String(pd.fetal_heart_rate));
        if (pd.uterine_tone) setUterineTone(String(pd.uterine_tone));
        if (pd.contraction_duration_sec != null) setContractionDurationSec(String(pd.contraction_duration_sec));
        if (pd.contraction_interval_min != null) setContractionIntervalMin(String(pd.contraction_interval_min));
        if (typeof pd.pain_vas === "number") setPainVas(pd.pain_vas);
        if (pd.skin_finding) setSkinFinding(String(pd.skin_finding));
        if (pd.edema_location) setEdemaLocation(String(pd.edema_location));
        const v = (pd.vitals as Record<string, unknown>) || {};
        setVitals({
          systolic_bp: v.systolic_bp != null ? String(v.systolic_bp) : "",
          diastolic_bp: v.diastolic_bp != null ? String(v.diastolic_bp) : "",
          heart_rate: v.heart_rate != null ? String(v.heart_rate) : "",
          respiratory_rate: v.respiratory_rate != null ? String(v.respiratory_rate) : "",
          saturation: v.saturation != null ? String(v.saturation) : "",
        });
      } catch {
        setErr("Не удалось загрузить форму");
      }
    })();
  }, [patientId, nav]);

  function onUterineToneChange(value: string) {
    setUterineTone(value);
    if (value !== "labor_regular") setContractionIntervalMin("");
    if (value !== "labor_regular" && value !== "labor_irregular") {
      setContractionDurationSec("");
    }
  }

  function onSkinChange(value: string) {
    setSkinFinding(value);
    if (value !== "edema") setEdemaLocation("");
  }

  function setVital(key: string, value: string) {
    setVitals((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || painVas == null) {
      setErr("Оцените боль по ВАШ");
      return;
    }
    if (!skinFinding) {
      setErr("Укажите осмотр кожных покровов");
      return;
    }
    if (skinFinding === "edema" && !edemaLocation) {
      setErr("Укажите локализацию отёков");
      return;
    }
    if (uterineTone === "labor_regular" && (!contractionDurationSec || !contractionIntervalMin)) {
      setErr("Укажите длительность и интервал схваток");
      return;
    }
    if (uterineTone === "labor_irregular" && !contractionDurationSec) {
      setErr("Укажите длительность схваток");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/pre_doctor`, {
        method: "POST",
        json: {
          pre_doctor: {
            discharge,
            fetal_heart_rate: fetalHr,
            uterine_tone: uterineTone,
            pain_vas: painVas,
            skin_finding: skinFinding,
            edema_location: skinFinding === "edema" ? edemaLocation : undefined,
            contraction_duration_sec:
              uterineTone === "labor_regular" || uterineTone === "labor_irregular"
                ? Number(contractionDurationSec)
                : undefined,
            contraction_interval_min: uterineTone === "labor_regular" ? Number(contractionIntervalMin) : undefined,
            vitals: {
              systolic_bp: Number(vitals.systolic_bp),
              diastolic_bp: Number(vitals.diastolic_bp),
              heart_rate: Number(vitals.heart_rate),
              respiratory_rate: Number(vitals.respiratory_rate),
              saturation: Number(vitals.saturation),
            },
          },
        },
      });
      nav(`/patients/${patientId}/priority-actions`);
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      setErr(e.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const uterineOption = opts?.uterine_tone.find((o) => o.key === uterineTone);

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell">
        <div className="triage-page-head mb-4">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="h4 mb-1">Доврачебный этап · {patientName || "Пациент"}</h1>
          <p className="text-muted small mb-2">Этап 2 · осмотр и назначение приоритета</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setChecklistOpen(true)}>
            <i className="bi bi-list-check me-1" aria-hidden />
            Посмотреть чек-лист этапа 1
          </button>
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        <form onSubmit={(e) => void submit(e)} className="card triage-form-card shadow-sm">
          <div className="card-body d-grid gap-4">
            <section>
              <h2 className="h6 mb-2">Осмотр выделений</h2>
              <select className="form-select" required value={discharge} onChange={(e) => setDischarge(e.target.value)}>
                <option value="">— выберите —</option>
                {(opts?.discharge || []).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <h2 className="h6 mb-2">Оценка сердцебиения плода</h2>
              <select className="form-select" required value={fetalHr} onChange={(e) => setFetalHr(e.target.value)}>
                <option value="">— выберите —</option>
                {(opts?.fetal_heart_rate || []).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <h2 className="h6 mb-2">Оценка маточного тонуса</h2>
              <select
                className="form-select"
                required
                value={uterineTone}
                onChange={(e) => onUterineToneChange(e.target.value)}
              >
                <option value="">— выберите —</option>
                {(opts?.uterine_tone || []).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>

              {uterineTone === "labor_regular" && (
                <div className="mt-3 p-3 border rounded bg-light">
                  <p className="small text-muted mb-2">Схватки по длительности и интервалу:</p>
                  <div className="row g-2 align-items-center">
                    <div className="col-auto small">Схватки по</div>
                    <div className="col-3 col-sm-2">
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm"
                        value={contractionDurationSec}
                        onChange={(e) => setContractionDurationSec(e.target.value)}
                        placeholder="60"
                        required
                      />
                    </div>
                    <div className="col-auto small">сек через</div>
                    <div className="col-3 col-sm-2">
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm"
                        value={contractionIntervalMin}
                        onChange={(e) => setContractionIntervalMin(e.target.value)}
                        placeholder="5"
                        required
                      />
                    </div>
                    <div className="col-auto small">мин</div>
                  </div>
                </div>
              )}

              {uterineTone === "labor_irregular" && (
                <div className="mt-3 p-3 border rounded bg-light">
                  <div className="row g-2 align-items-center">
                    <div className="col-auto small">Схватки по</div>
                    <div className="col-3 col-sm-2">
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm"
                        value={contractionDurationSec}
                        onChange={(e) => setContractionDurationSec(e.target.value)}
                        placeholder="45"
                        required
                      />
                    </div>
                    <div className="col-auto small">сек, нерегулярные</div>
                  </div>
                </div>
              )}

              {uterineOption && uterineTone !== "labor_regular" && uterineTone !== "labor_irregular" && uterineOption.label && (
                <p className="small text-muted mt-2 mb-0">{uterineOption.label}</p>
              )}
            </section>

            <section>
              <h2 className="h6 mb-2">Оценка боли по ВАШ</h2>
              <p className="small text-muted mb-2">Пациент может нажать на смайлик (0 — нет боли, 10 — максимальная боль)</p>
              <VasSmileyPicker
                value={painVas}
                onChange={setPainVas}
                min={opts?.pain_vas_min ?? 0}
                max={opts?.pain_vas_max ?? 10}
              />
            </section>

            <section>
              <h2 className="h6 mb-2">Осмотр кожных покровов</h2>
              <div className="d-grid gap-2">
                {(opts?.skin_findings || []).map((o) => (
                  <label
                    key={o.key}
                    className={`triage-check-item stage2-skin-check ${skinFinding === o.key ? "triage-check-item--yellow" : ""}`}
                  >
                    <input
                      type="radio"
                      className="form-check-input"
                      name="skin_finding"
                      checked={skinFinding === o.key}
                      onChange={() => onSkinChange(o.key)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              {skinFinding === "edema" && (
                <div className="mt-3">
                  <label className="form-label small">Локализация отёков</label>
                  <select
                    className="form-select"
                    required
                    value={edemaLocation}
                    onChange={(e) => setEdemaLocation(e.target.value)}
                  >
                    <option value="">— выберите —</option>
                    {(opts?.edema_locations || []).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <section>
              <h2 className="h6 mb-2">Витальные функции</h2>
              <div className="row g-2">
                {(opts?.vitals || []).map((v) => (
                  <div key={v.key} className="col-6 col-md-4 col-lg">
                    <label className="form-label small mb-0">{v.label}</label>
                    <input
                      type="number"
                      className="form-control"
                      required
                      min={v.key === "saturation" ? 0 : 1}
                      max={v.key === "saturation" ? 100 : undefined}
                      value={vitals[v.key] || ""}
                      onChange={(e) => setVital(v.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <button type="submit" className="btn btn-primary" disabled={busy || !opts}>
              {busy ? "Сохранение…" : "Завершить доврачебный этап и назначить приоритет"}
            </button>
          </div>
        </form>
      </div>

      <Stage1ChecklistModal patientId={pid} open={checklistOpen} onClose={() => setChecklistOpen(false)} />
    </div>
  );
}
