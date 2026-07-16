import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { apiJson } from "../api";
import FormErrorToast from "../components/FormErrorToast";
import Stage1ChecklistButton from "../components/Stage1ChecklistButton";
import Stage2DraftBanner from "../components/Stage2DraftBanner";
import Stage2PhaseEditConfirmDialog from "../components/Stage2PhaseEditConfirmDialog";
import VasSmileyPicker from "../components/VasSmileyPicker";
import { useStage2DraftSync } from "../hooks/useStage2DraftSync";
import type { AuthOutletContext } from "../sessionTypes";
import { focusPreDoctorFormError } from "../utils/preDoctorFormErrors";
import {
  applyPreDoctorPhaseData,
  buildPreDoctorDraftPayload,
  draftRevisionFrom,
} from "../utils/stage2DraftHelpers";
import { stage2ActivePhasePath, stage2PathIsEditMode } from "../stage2Ui";

type Option = { key: string; label: string };

type VitalField = { key: string; label: string };

type PreDoctorOptions = {
  discharge: Option[];
  fetal_heart_rate: Option[];
  uterine_tone: Option[];
  skin_colors?: Option[];
  skin_findings?: Option[];
  edema_locations: Option[];
  vitals: VitalField[];
  pain_vas_min: number;
  pain_vas_max: number;
};

type TriageState = {
  pre_doctor_data: Record<string, unknown>;
  pre_doctor_completed: boolean;
  workflow_route: string;
  actions_completed_at?: string | null;
  can_edit_saved_phases?: boolean;
};

type PhaseEditPreview = {
  ok: boolean;
  suggested_priority?: string;
  suggested_priority_name?: string;
  suggested_priority_changed?: boolean;
  downstream_reset?: boolean;
  notice_hint?: string;
};

const EMPTY_VITALS: Record<string, string> = {
  systolic_bp: "",
  diastolic_bp: "",
  heart_rate: "",
  respiratory_rate: "",
  saturation: "",
};

function YesNoChoice({
  value,
  onChange,
  name,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div className="d-flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      <label className={`triage-check-item triag-btn-selector ${value === true ? "triag-btn-selector--active" : ""}`}>
        <input
          type="radio"
          className="form-check-input"
          name={name}
          checked={value === true}
          onChange={() => onChange(true)}
        />
        <span>Да</span>
      </label>
      <label className={`triage-check-item triag-btn-selector ${value === false ? "triag-btn-selector--active" : ""}`}>
        <input
          type="radio"
          className="form-check-input"
          name={name}
          checked={value === false}
          onChange={() => onChange(false)}
        />
        <span>Нет</span>
      </label>
    </div>
  );
}

export default function PreDoctorStepPage() {
  const { patientId } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const auth = useOutletContext<AuthOutletContext | undefined>();
  const userId = auth?.user?.id;
  const pid = Number(patientId);
  const isEditMode = stage2PathIsEditMode(location.pathname, "pre_doctor");
  const [opts, setOpts] = useState<PreDoctorOptions | null>(null);
  const [patientName, setPatientName] = useState("");
  const [discharge, setDischarge] = useState("");
  const [fetalHr, setFetalHr] = useState("");
  const [uterineTone, setUterineTone] = useState("");
  const [contractionDurationSec, setContractionDurationSec] = useState("");
  const [contractionIntervalMin, setContractionIntervalMin] = useState("");
  const [painVas, setPainVas] = useState<number | null>(null);
  const [skinColor, setSkinColor] = useState("");
  const [hasRash, setHasRash] = useState<boolean | null>(null);
  const [rashDescription, setRashDescription] = useState("");
  const [hasEdema, setHasEdema] = useState<boolean | null>(null);
  const [edemaLocation, setEdemaLocation] = useState("");
  const [vitals, setVitals] = useState<Record<string, string>>(EMPTY_VITALS);
  const [doctorCalled, setDoctorCalled] = useState(false);
  const [ctgOrdered, setCtgOrdered] = useState(false);
  const [ultrasoundOrdered, setUltrasoundOrdered] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [editPreview, setEditPreview] = useState<PhaseEditPreview | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const formState = useMemo(
    () => ({
      discharge,
      fetalHr,
      uterineTone,
      contractionDurationSec,
      contractionIntervalMin,
      painVas,
      skinColor,
      hasRash,
      rashDescription,
      hasEdema,
      edemaLocation,
      vitals,
      doctorCalled,
      ctgOrdered,
      ultrasoundOrdered,
    }),
    [
      discharge,
      fetalHr,
      uterineTone,
      contractionDurationSec,
      contractionIntervalMin,
      painVas,
      skinColor,
      hasRash,
      rashDescription,
      hasEdema,
      edemaLocation,
      vitals,
      doctorCalled,
      ctgOrdered,
      ultrasoundOrdered,
    ],
  );

  const applyRemote = useCallback((pd: Record<string, unknown>) => {
    applyPreDoctorPhaseData(pd, {
      setDischarge,
      setFetalHr,
      setUterineTone,
      setContractionDurationSec,
      setContractionIntervalMin,
      setPainVas,
      setSkinColor,
      setHasRash,
      setRashDescription,
      setHasEdema,
      setEdemaLocation,
      setVitals,
      setDoctorCalled,
      setCtgOrdered,
      setUltrasoundOrdered,
    });
  }, []);

  const { notice, scheduleSave, finishHydration } = useStage2DraftSync({
    patientId,
    phase: "pre_doctor",
    userId,
    enabled: draftEnabled && !isEditMode,
    buildPayload: () => buildPreDoctorDraftPayload(formState),
    applyRemote,
  });

  function showError(message: string) {
    setErr(message);
  }

  useEffect(() => {
    if (!err) return;
    focusPreDoctorFormError(err);
  }, [err]);

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

        if (!isEditMode && triage.pre_doctor_completed) {
          const route = triage.workflow_route;
          if (route === "doctor_examination") {
            nav("/patients", { replace: true });
            return;
          }
          if (route === "decision") {
            nav(`/patients/${patientId}/decision`, { replace: true });
            return;
          }
          if (route === "actions") {
            nav(`/patients/${patientId}/actions`, { replace: true });
            return;
          }
        }

        if (isEditMode) {
          if (triage.actions_completed_at) {
            showError("Действия по приоритету завершены. Редактирование недоступно.");
            return;
          }
          if (!triage.can_edit_saved_phases) {
            showError("Недостаточно прав для редактирования");
            return;
          }
          if (!triage.pre_doctor_completed) {
            nav(`/patients/${patientId}/workflow`, { replace: true });
            return;
          }
        }

        const pd = triage.pre_doctor_data || {};
        applyRemote(pd);
        if (!isEditMode) {
          finishHydration(draftRevisionFrom(pd));
          setDraftEnabled(true);
        }
      } catch {
        showError("Не удалось загрузить форму");
      }
    })();
  }, [patientId, nav, applyRemote, finishHydration, isEditMode]);

  useEffect(() => {
    if (!draftEnabled || isEditMode) return;
    scheduleSave();
  }, [draftEnabled, formState, scheduleSave, isEditMode]);

  function onUterineToneChange(value: string) {
    setUterineTone(value);
    if (value !== "labor_regular") setContractionIntervalMin("");
    if (value !== "labor_regular" && value !== "labor_irregular") {
      setContractionDurationSec("");
    }
  }

  function setVital(key: string, value: string) {
    setVitals((prev) => ({ ...prev, [key]: value }));
  }

  function buildSubmitPayload() {
    return {
      pre_doctor: {
        discharge,
        fetal_heart_rate: fetalHr,
        uterine_tone: uterineTone,
        pain_vas: painVas,
        skin_color: skinColor,
        has_rash: hasRash === true,
        rash_description: hasRash === true ? rashDescription.trim() : undefined,
        has_edema: hasEdema === true,
        edema_location: hasEdema === true ? edemaLocation : undefined,
        contraction_duration_sec:
          uterineTone === "labor_regular" || uterineTone === "labor_irregular"
            ? Number(contractionDurationSec)
            : undefined,
        contraction_interval_min: uterineTone === "labor_regular" ? Number(contractionIntervalMin) : undefined,
        doctor_called: doctorCalled,
        ctg_ordered: ctgOrdered,
        ultrasound_ordered: ultrasoundOrdered,
        vitals: {
          systolic_bp: Number(vitals.systolic_bp),
          diastolic_bp: Number(vitals.diastolic_bp),
          heart_rate: Number(vitals.heart_rate),
          respiratory_rate: Number(vitals.respiratory_rate),
          saturation: Number(vitals.saturation),
        },
      },
    };
  }

  function validateClient(): string | null {
    if (painVas == null) return "Оцените боль по ВАШ";
    if (!skinColor) return "Укажите осмотр кожных покровов";
    if (hasRash === null) return "Укажите наличие сыпи";
    if (hasRash === true && !rashDescription.trim()) return "Опишите сыпь";
    if (hasEdema === null) return "Укажите наличие отёков";
    if (hasEdema === true && !edemaLocation) return "Укажите локализацию отёков";
    if (uterineTone === "labor_regular" && (!contractionDurationSec || !contractionIntervalMin)) {
      return "Укажите длительность и интервал схваток";
    }
    if (uterineTone === "labor_irregular" && !contractionDurationSec) {
      return "Укажите длительность схваток";
    }
    if (!doctorCalled) return "Отметьте вызов врача";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;

    const validationErr = validateClient();
    if (validationErr) {
      showError(validationErr);
      return;
    }

    if (isEditMode) {
      setBusy(true);
      setErr("");
      try {
        const preview = await apiJson<PhaseEditPreview>(
          `/api/v1/stage2/patients/${patientId}/triage/preview_phase_update/pre_doctor`,
          { method: "POST", json: buildSubmitPayload() },
        );
        setEditPreview(preview);
        setEditConfirmOpen(true);
      } catch (ex: unknown) {
        const error = ex as { body?: { error?: string } };
        showError(error.body?.error || "Не удалось подготовить сохранение");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/pre_doctor`, {
        method: "POST",
        json: buildSubmitPayload(),
      });
      nav("/patients");
    } catch (ex: unknown) {
      const error = ex as { body?: { error?: string } };
      showError(error.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEditSave() {
    if (!patientId) return;
    setBusy(true);
    try {
      const res = await apiJson<{ triage: TriageState }>(
        `/api/v1/stage2/patients/${patientId}/triage/update_phase/pre_doctor`,
        { method: "POST", json: buildSubmitPayload() },
      );
      setEditConfirmOpen(false);
      nav(stage2ActivePhasePath(patientId, res.triage.workflow_route));
    } catch (ex: unknown) {
      const error = ex as { body?: { error?: string } };
      showError(error.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const skinOptions = opts?.skin_colors || opts?.skin_findings || [];
  const uterineOption = opts?.uterine_tone.find((o) => o.key === uterineTone);

  return (
    <div className="container-fluid triag-page-wide">
      <FormErrorToast message={err} onDismiss={() => setErr("")} />
      <Stage2DraftBanner notice={notice} />
      <div className="triage-page-shell">
        <div className="triage-page-head mb-4">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="triag-page-heading mb-0">
            {isEditMode ? "Редактирование шага 1" : "Доврачебный осмотр"} · {patientName || "Пациент"}
          </h1>
          <span className="triage-page-head-meta text-muted">Этап 2 · шаг 1</span>
          <Stage1ChecklistButton patientId={pid} />
        </div>

        <form onSubmit={(e) => void submit(e)} className="card triage-form-card shadow-sm">
          <div className="card-body d-grid gap-4">
            <section id="pre-doctor-skin">
              <h2 className="h6 mb-2">Осмотр кожных покровов</h2>
              <select
                id="pre-doctor-skin-color"
                className="form-select"
                required
                value={skinColor}
                onChange={(e) => setSkinColor(e.target.value)}
              >
                <option value="">— выберите —</option>
                {skinOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </section>

            <section id="pre-doctor-rash">
              <h2 className="h6 mb-2">Сыпь</h2>
              <YesNoChoice value={hasRash} onChange={setHasRash} name="pre-doctor-rash" />
              {hasRash === true && (
                <div className="mt-3">
                  <label className="form-label small" htmlFor="pre-doctor-rash-description">
                    Описание
                  </label>
                  <textarea
                    id="pre-doctor-rash-description"
                    className="form-control"
                    rows={2}
                    required
                    value={rashDescription}
                    onChange={(e) => setRashDescription(e.target.value)}
                    placeholder="Опишите характер и локализацию сыпи"
                  />
                </div>
              )}
            </section>

            <section id="pre-doctor-edema">
              <h2 className="h6 mb-2">Отёки</h2>
              <YesNoChoice
                value={hasEdema}
                onChange={(v) => {
                  setHasEdema(v);
                  if (!v) setEdemaLocation("");
                }}
                name="pre-doctor-edema"
              />
              {hasEdema === true && (
                <div className="mt-3">
                  <label className="form-label small" htmlFor="pre-doctor-edema-location">
                    Локализация
                  </label>
                  <select
                    id="pre-doctor-edema-location"
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

            <section id="pre-doctor-uterine">
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

            <section id="pre-doctor-pain">
              <h2 className="h6 mb-2">Оценка боли по ВАШ</h2>
              <p className="small text-muted mb-2">Пациент может нажать на смайлик (0 — нет боли, 10 — максимальная боль)</p>
              <VasSmileyPicker
                value={painVas}
                onChange={setPainVas}
                min={opts?.pain_vas_min ?? 0}
                max={opts?.pain_vas_max ?? 10}
              />
            </section>

            <section id="pre-doctor-fhr">
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

            <section id="pre-doctor-discharge">
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

            <section id="pre-doctor-vitals">
              <h2 className="h6 mb-2">Витальные функции</h2>
              <div className="row g-2">
                {(opts?.vitals || []).map((v) => (
                  <div key={v.key} className="col-6 col-md-4 col-lg">
                    <label className="form-label small mb-0" htmlFor={`pre-doctor-field-${v.key}`}>
                      {v.label}
                    </label>
                    <input
                      id={`pre-doctor-field-${v.key}`}
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

            <section id="pre-doctor-investigations">
              <h2 className="h6 mb-2">Назначенные исследования</h2>
              <div className="d-flex flex-wrap gap-2">
                <label className={`triage-check-item triag-btn-selector ${ctgOrdered ? "triage-check-item--yellow triag-btn-selector--active" : ""}`}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={ctgOrdered}
                    onChange={(e) => setCtgOrdered(e.target.checked)}
                  />
                  <span>Назначено КТГ</span>
                </label>
                <label className={`triage-check-item triag-btn-selector ${ultrasoundOrdered ? "triage-check-item--yellow triag-btn-selector--active" : ""}`}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={ultrasoundOrdered}
                    onChange={(e) => setUltrasoundOrdered(e.target.checked)}
                  />
                  <span>Назначено УЗИ</span>
                </label>
              </div>
            </section>

            <section id="pre-doctor-doctor-call">
              <h2 className="h6 mb-2">Вызов врача</h2>
              <label className={`triage-check-item triag-btn-selector ${doctorCalled ? "triage-check-item--yellow triag-btn-selector--active" : ""}`}>
                <input
                  id="pre-doctor-doctor-called"
                  type="checkbox"
                  className="form-check-input"
                  checked={doctorCalled}
                  onChange={(e) => {
                    setDoctorCalled(e.target.checked);
                    if (err) setErr("");
                  }}
                />
                <span>Вызван врач</span>
              </label>
            </section>

            <button type="submit" className="btn btn-primary triag-btn-primary" disabled={busy || !opts}>
              {busy ? "Сохранение…" : isEditMode ? "Сохранить изменения" : "Завершить доврачебный осмотр"}
            </button>
          </div>
        </form>
      </div>

      <Stage2PhaseEditConfirmDialog
        open={editConfirmOpen}
        title="Сохранить изменения шага 1?"
        busy={busy}
        onCancel={() => setEditConfirmOpen(false)}
        onConfirm={() => void confirmEditSave()}
      >
        {editPreview?.suggested_priority_changed && (
          <p className="mb-2">
            Рекомендация алгоритма изменится на{" "}
            <strong>{editPreview.suggested_priority_name || editPreview.suggested_priority}</strong>.
          </p>
        )}
        {editPreview?.downstream_reset && (
          <p className="mb-0 text-warning">Последующие шаги будут сброшены и потребуют повторного заполнения.</p>
        )}
        {!editPreview?.suggested_priority_changed && !editPreview?.downstream_reset && (
          <p className="mb-0">Подтвердите сохранение изменений доврачебного осмотра.</p>
        )}
      </Stage2PhaseEditConfirmDialog>
    </div>
  );
}
