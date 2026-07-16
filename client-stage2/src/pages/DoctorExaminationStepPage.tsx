import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { apiJson } from "../api";
import FormErrorToast from "../components/FormErrorToast";
import Stage1ChecklistButton from "../components/Stage1ChecklistButton";
import Stage2DraftBanner from "../components/Stage2DraftBanner";
import Stage2PhaseEditConfirmDialog from "../components/Stage2PhaseEditConfirmDialog";
import { useStage2DraftSync } from "../hooks/useStage2DraftSync";
import type { AuthOutletContext } from "../sessionTypes";
import { focusDoctorExaminationFormError } from "../utils/doctorExaminationFormErrors";
import {
  applyDoctorPhaseData,
  buildDoctorDraftPayload,
  draftRevisionFrom,
} from "../utils/stage2DraftHelpers";
import { stage2ActivePhasePath, stage2PathIsEditMode } from "../stage2Ui";

type Option = { key: string; label: string };

type DoctorExaminationOptions = {
  investigations: Option[];
  lab_investigations: Option[];
  ctg_results: Option[];
  ultrasound_findings: Option[];
};

type TriageState = {
  doctor_data: Record<string, unknown>;
  doctor_examination_completed: boolean;
  workflow_route: string;
  pre_doctor_completed: boolean;
  actions_completed_at?: string | null;
  can_edit_saved_phases?: boolean;
};

type CtgState = {
  resultType: string;
  basalHr: string;
};

type UltrasoundState = {
  finding: string;
  disordersText: string;
};

const LAB_KEYS = [
  "labs_blood",
  "labs_urine",
  "labs_biochemistry",
  "labs_hiv",
  "labs_syphilis",
  "labs_hemostasis",
  "labs_blood_group",
] as const;

function emptyLabs(): Record<string, boolean> {
  return Object.fromEntries(LAB_KEYS.map((k) => [k, false]));
}

export default function DoctorExaminationStepPage() {
  const { patientId } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const auth = useOutletContext<AuthOutletContext | undefined>();
  const userId = auth?.user?.id;
  const isEditMode = stage2PathIsEditMode(location.pathname, "doctor_examination");
  const [opts, setOpts] = useState<DoctorExaminationOptions | null>(null);
  const [patientName, setPatientName] = useState("");
  const [investigations, setInvestigations] = useState<Record<string, boolean>>({
    ctg_done: false,
    ultrasound_done: false,
    ...emptyLabs(),
  });
  const [labsOpen, setLabsOpen] = useState(false);
  const [ctg, setCtg] = useState<CtgState>({ resultType: "", basalHr: "" });
  const [ultrasound, setUltrasound] = useState<UltrasoundState>({
    finding: "",
    disordersText: "",
  });
  const [medicalConclusion, setMedicalConclusion] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const formState = useMemo(
    () => ({ investigations, ctg, ultrasound, medicalConclusion }),
    [investigations, ctg, ultrasound, medicalConclusion],
  );

  const applyRemote = useCallback((doc: Record<string, unknown>) => {
    applyDoctorPhaseData(doc, {
      setInvestigations,
      setLabsOpen,
      setCtg,
      setUltrasound,
      setMedicalConclusion,
    });
  }, []);

  const { notice, scheduleSave, finishHydration } = useStage2DraftSync({
    patientId,
    phase: "doctor_examination",
    userId,
    enabled: draftEnabled && !isEditMode,
    buildPayload: () => buildDoctorDraftPayload(formState),
    applyRemote,
  });

  function showError(message: string) {
    setErr(message);
  }

  useEffect(() => {
    if (!err) return;
    focusDoctorExaminationFormError(err);
  }, [err]);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const [options, triage, details] = await Promise.all([
          apiJson<DoctorExaminationOptions>("/api/v1/stage2/meta/doctor_examination_options"),
          apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`),
          apiJson<{ patient: { full_name: string } }>(`/api/v1/stage2/patients/${patientId}`),
        ]);
        setOpts(options);
        setPatientName(details.patient.full_name);

        if (!triage.pre_doctor_completed) {
          nav(`/patients/${patientId}/workflow`, { replace: true });
          return;
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
          if (!triage.doctor_examination_completed) {
            nav(`/patients/${patientId}/doctor-examination`, { replace: true });
            return;
          }
        } else if (triage.doctor_examination_completed) {
          if (triage.workflow_route === "decision") {
            nav(`/patients/${patientId}/decision`, { replace: true });
          } else {
            nav("/patients", { replace: true });
          }
          return;
        }

        const doc = triage.doctor_data || {};
        applyRemote(doc);
        if (!isEditMode) {
          finishHydration(draftRevisionFrom(doc));
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

  function toggleInvestigation(key: string, checked: boolean) {
    setInvestigations((prev) => ({ ...prev, [key]: checked }));
    if (key === "ctg_done" && !checked) {
      setCtg({ resultType: "", basalHr: "" });
    }
    if (key === "ultrasound_done" && !checked) {
      setUltrasound({ finding: "", disordersText: "" });
    }
  }

  function toggleLab(key: string, checked: boolean) {
    setInvestigations((prev) => ({ ...prev, [key]: checked }));
    if (checked) setLabsOpen(true);
  }

  function openLabs() {
    setLabsOpen(true);
  }

  function buildSubmitPayload() {
    const invPayload: Record<string, boolean> = {
      ctg_done: investigations.ctg_done === true,
      ultrasound_done: investigations.ultrasound_done === true,
    };
    for (const key of LAB_KEYS) {
      if (investigations[key]) invPayload[key] = true;
    }

    return {
      doctor_examination: {
        investigations: invPayload,
        ctg: investigations.ctg_done
          ? {
              result_type: ctg.resultType || undefined,
              basal_hr: ctg.basalHr ? Number(ctg.basalHr) : undefined,
            }
          : undefined,
        ultrasound: investigations.ultrasound_done
          ? {
              finding: ultrasound.finding || undefined,
              disorders_text: ultrasound.finding === "disorders_found" ? ultrasound.disordersText.trim() : undefined,
            }
          : undefined,
        medical_conclusion: medicalConclusion.trim() || undefined,
      },
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;

    if (isEditMode) {
      setBusy(true);
      setErr("");
      try {
        await apiJson(
          `/api/v1/stage2/patients/${patientId}/triage/preview_phase_update/doctor_examination`,
          { method: "POST", json: buildSubmitPayload() },
        );
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
      await apiJson(`/api/v1/stage2/patients/${patientId}/triage/doctor_examination`, {
        method: "POST",
        json: buildSubmitPayload(),
      });
      nav(`/patients/${patientId}/decision`);
    } catch (ex: unknown) {
      const e = ex as { body?: { error?: string } };
      showError(e.body?.error || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEditSave() {
    if (!patientId) return;
    setBusy(true);
    try {
      const res = await apiJson<{ triage: TriageState }>(
        `/api/v1/stage2/patients/${patientId}/triage/update_phase/doctor_examination`,
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

  const anyLabChecked = LAB_KEYS.some((k) => investigations[k]);

  return (
    <div className="container-fluid triag-page-wide">
      <FormErrorToast message={err} onDismiss={() => setErr("")} />
      <Stage2DraftBanner notice={notice} />
      <div className="triage-page-shell">
        <div className="triage-page-head mb-3">
          <Link to="/patients" className="triage-back-link">
            <i className="bi bi-arrow-left" aria-hidden /> К списку
          </Link>
          <h1 className="triag-page-heading mb-0">
            {isEditMode ? "Редактирование шага 2" : "Врачебный осмотр"} · {patientName || "Пациент"}
          </h1>
          <span className="triage-page-head-meta text-muted">Этап 2 · шаг 2</span>
          {patientId && <Stage1ChecklistButton patientId={Number(patientId)} />}
        </div>

        <form onSubmit={(e) => void submit(e)} className="card triage-form-card shadow-sm">
          <div className="card-body d-grid gap-4">
            <section>
              <h2 className="h6 mb-2">Исследования</h2>
              <div className="d-grid gap-2">
                {(opts?.investigations || []).map((o) => (
                  <div key={o.key} className="d-grid gap-2">
                    <label
                      className={`triage-check-item triag-btn-selector ${investigations[o.key] === true ? "triag-btn-selector--active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={investigations[o.key] === true}
                        onChange={(e) => toggleInvestigation(o.key, e.target.checked)}
                      />
                      <span>{o.label}</span>
                    </label>

                    {o.key === "ctg_done" && investigations.ctg_done && (
                      <div id="doctor-exam-ctg" className="ms-1 ps-3 border-start border-2 py-2 d-grid gap-2">
                        <div className="small text-muted fw-semibold">Результат КТГ</div>
                        {(opts?.ctg_results || []).map((opt) => (
                          <label
                            key={opt.key}
                            className={`triage-check-item triag-btn-selector ${ctg.resultType === opt.key ? "triage-check-item--yellow triag-btn-selector--active" : ""}`}
                          >
                            <input
                              type="radio"
                              className="form-check-input"
                              name="ctg_result"
                              checked={ctg.resultType === opt.key}
                              onChange={() => setCtg((prev) => ({ ...prev, resultType: opt.key }))}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        <div>
                          <label className="form-label small" htmlFor="ctg-basal-hr">
                            Базальная ЧСС плода (уд/мин)
                          </label>
                          <input
                            id="ctg-basal-hr"
                            type="number"
                            min={1}
                            className="form-control"
                            style={{ maxWidth: 160 }}
                            value={ctg.basalHr}
                            onChange={(e) => setCtg((prev) => ({ ...prev, basalHr: e.target.value }))}
                            placeholder="120"
                          />
                        </div>
                      </div>
                    )}

                    {o.key === "ultrasound_done" && investigations.ultrasound_done && (
                      <div id="doctor-exam-ultrasound" className="ms-1 ps-3 border-start border-2 py-2 d-grid gap-2">
                        <div className="small text-muted fw-semibold">Результат УЗИ</div>
                        {(opts?.ultrasound_findings || []).map((opt) => (
                          <label
                            key={opt.key}
                            className={`triage-check-item triag-btn-selector ${ultrasound.finding === opt.key ? "triage-check-item--yellow triag-btn-selector--active" : ""}`}
                          >
                            <input
                              type="radio"
                              className="form-check-input"
                              name="ultrasound_finding"
                              checked={ultrasound.finding === opt.key}
                              onChange={() =>
                                setUltrasound((prev) => ({
                                  ...prev,
                                  finding: opt.key,
                                  disordersText: opt.key === "disorders_found" ? prev.disordersText : "",
                                }))
                              }
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        {ultrasound.finding === "disorders_found" && (
                          <div>
                            <label className="form-label small" htmlFor="ultrasound-disorders-text">
                              Выявленные нарушения
                            </label>
                            <textarea
                              id="ultrasound-disorders-text"
                              className="form-control"
                              rows={2}
                              maxLength={1000}
                              value={ultrasound.disordersText}
                              onChange={(e) => setUltrasound((prev) => ({ ...prev, disordersText: e.target.value }))}
                              placeholder="Опишите нарушения"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <div className="d-grid gap-2">
                  {!labsOpen ? (
                    <button
                      type="button"
                      className={`triage-check-item triag-btn-selector text-start ${anyLabChecked ? "triag-btn-selector--active" : ""}`}
                      onClick={openLabs}
                    >
                      Назначены лабораторные исследования
                    </button>
                  ) : (
                    <>
                      <div className="small text-muted fw-semibold">Назначены лабораторные исследования</div>
                      <div id="doctor-exam-labs" className="ms-1 ps-3 border-start border-2 py-2 d-grid gap-2">
                        {(opts?.lab_investigations || []).map((opt) => (
                          <label
                            key={opt.key}
                            className={`triage-check-item triag-btn-selector ${investigations[opt.key] === true ? "triag-btn-selector--active" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={investigations[opt.key] === true}
                              onChange={(e) => toggleLab(opt.key, e.target.checked)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="h6 mb-2">Врачебное заключение</h2>
              <textarea
                className="form-control"
                rows={4}
                maxLength={2000}
                placeholder="Краткое заключение врача…"
                value={medicalConclusion}
                onChange={(e) => setMedicalConclusion(e.target.value)}
              />
            </section>

            <button type="submit" className="btn btn-primary triag-btn-primary" disabled={busy || !opts}>
              {busy ? "Сохранение…" : isEditMode ? "Сохранить изменения" : "Завершить врачебный осмотр и перейти к решению"}
            </button>
          </div>
        </form>
      </div>

      <Stage2PhaseEditConfirmDialog
        open={editConfirmOpen}
        title="Сохранить изменения шага 2?"
        busy={busy}
        onCancel={() => setEditConfirmOpen(false)}
        onConfirm={() => void confirmEditSave()}
      >
        <p className="mb-0">Подтвердите сохранение изменений врачебного осмотра.</p>
      </Stage2PhaseEditConfirmDialog>
    </div>
  );
}
