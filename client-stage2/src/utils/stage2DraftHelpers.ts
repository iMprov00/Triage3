export function draftRevisionFrom(data: Record<string, unknown> | undefined): number {
  const rev = data?.draft_revision;
  return typeof rev === "number" ? rev : Number(rev) || 0;
}

function legacySkinColor(pd: Record<string, unknown>): string {
  if (pd.skin_color) return String(pd.skin_color);
  const legacy = String(pd.skin_finding || "");
  if (legacy && legacy !== "rash" && legacy !== "edema") return legacy;
  return "";
}

export function applyPreDoctorPhaseData(
  pd: Record<string, unknown>,
  setters: {
    setDischarge: (v: string) => void;
    setFetalHr: (v: string) => void;
    setUterineTone: (v: string) => void;
    setContractionDurationSec: (v: string) => void;
    setContractionIntervalMin: (v: string) => void;
    setPainVas: (v: number | null) => void;
    setSkinColor: (v: string) => void;
    setHasRash: (v: boolean | null) => void;
    setRashDescription: (v: string) => void;
    setHasEdema: (v: boolean | null) => void;
    setEdemaLocation: (v: string) => void;
    setVitals: (v: Record<string, string>) => void;
    setDoctorCalled: (v: boolean) => void;
    setCtgOrdered: (v: boolean) => void;
    setUltrasoundOrdered: (v: boolean) => void;
  },
) {
  if (pd.discharge) setters.setDischarge(String(pd.discharge));
  if (pd.fetal_heart_rate) setters.setFetalHr(String(pd.fetal_heart_rate));
  if (pd.uterine_tone) setters.setUterineTone(String(pd.uterine_tone));
  if (pd.contraction_duration_sec != null) setters.setContractionDurationSec(String(pd.contraction_duration_sec));
  if (pd.contraction_interval_min != null) setters.setContractionIntervalMin(String(pd.contraction_interval_min));
  if (typeof pd.pain_vas === "number") setters.setPainVas(pd.pain_vas);

  const skinColor = legacySkinColor(pd);
  if (skinColor) setters.setSkinColor(skinColor);

  if (pd.has_rash === true || pd.skin_finding === "rash") {
    setters.setHasRash(true);
  } else if (pd.has_rash === false) {
    setters.setHasRash(false);
  }
  if (pd.rash_description) setters.setRashDescription(String(pd.rash_description));

  if (pd.has_edema === true || pd.skin_finding === "edema") {
    setters.setHasEdema(true);
  } else if (pd.has_edema === false) {
    setters.setHasEdema(false);
  }
  if (pd.edema_location) setters.setEdemaLocation(String(pd.edema_location));

  const v = (pd.vitals as Record<string, unknown>) || {};
  setters.setVitals({
    systolic_bp: v.systolic_bp != null ? String(v.systolic_bp) : "",
    diastolic_bp: v.diastolic_bp != null ? String(v.diastolic_bp) : "",
    heart_rate: v.heart_rate != null ? String(v.heart_rate) : "",
    respiratory_rate: v.respiratory_rate != null ? String(v.respiratory_rate) : "",
    saturation: v.saturation != null ? String(v.saturation) : "",
  });
  if (pd.doctor_called === true) setters.setDoctorCalled(true);
  if (pd.doctor_called === false) setters.setDoctorCalled(false);
  if (pd.ctg_ordered === true) setters.setCtgOrdered(true);
  if (pd.ctg_ordered === false) setters.setCtgOrdered(false);
  if (pd.ultrasound_ordered === true) setters.setUltrasoundOrdered(true);
  if (pd.ultrasound_ordered === false) setters.setUltrasoundOrdered(false);
}

export function buildPreDoctorDraftPayload(state: {
  discharge: string;
  fetalHr: string;
  uterineTone: string;
  contractionDurationSec: string;
  contractionIntervalMin: string;
  painVas: number | null;
  skinColor: string;
  hasRash: boolean | null;
  rashDescription: string;
  hasEdema: boolean | null;
  edemaLocation: string;
  vitals: Record<string, string>;
  doctorCalled: boolean;
  ctgOrdered: boolean;
  ultrasoundOrdered: boolean;
}) {
  return {
    pre_doctor: {
      discharge: state.discharge || undefined,
      fetal_heart_rate: state.fetalHr || undefined,
      uterine_tone: state.uterineTone || undefined,
      pain_vas: state.painVas ?? undefined,
      skin_color: state.skinColor || undefined,
      has_rash: state.hasRash ?? undefined,
      rash_description: state.hasRash === true ? state.rashDescription.trim() || undefined : undefined,
      has_edema: state.hasEdema ?? undefined,
      edema_location: state.hasEdema === true ? state.edemaLocation || undefined : undefined,
      contraction_duration_sec:
        state.uterineTone === "labor_regular" || state.uterineTone === "labor_irregular"
          ? state.contractionDurationSec
            ? Number(state.contractionDurationSec)
            : undefined
          : undefined,
      contraction_interval_min:
        state.uterineTone === "labor_regular"
          ? state.contractionIntervalMin
            ? Number(state.contractionIntervalMin)
            : undefined
          : undefined,
      doctor_called: state.doctorCalled,
      ctg_ordered: state.ctgOrdered,
      ultrasound_ordered: state.ultrasoundOrdered,
      vitals: {
        systolic_bp: state.vitals.systolic_bp ? Number(state.vitals.systolic_bp) : undefined,
        diastolic_bp: state.vitals.diastolic_bp ? Number(state.vitals.diastolic_bp) : undefined,
        heart_rate: state.vitals.heart_rate ? Number(state.vitals.heart_rate) : undefined,
        respiratory_rate: state.vitals.respiratory_rate ? Number(state.vitals.respiratory_rate) : undefined,
        saturation: state.vitals.saturation ? Number(state.vitals.saturation) : undefined,
      },
    },
  };
}

const LAB_KEYS = [
  "labs_blood",
  "labs_urine",
  "labs_biochemistry",
  "labs_hiv",
  "labs_syphilis",
  "labs_hemostasis",
  "labs_blood_group",
] as const;

function labFlag(inv: Record<string, unknown>, key: string): boolean {
  if (inv[key] === true) return true;
  if (key === "labs_blood" && inv.labs_blood_done === true) return true;
  if (key === "labs_urine" && inv.labs_urine_done === true) return true;
  return false;
}

export function applyDoctorPhaseData(
  doc: Record<string, unknown>,
  setters: {
    setInvestigations: (v: Record<string, boolean>) => void;
    setLabsOpen: (v: boolean) => void;
    setCtg: (v: { resultType: string; basalHr: string }) => void;
    setUltrasound: (v: { finding: string; disordersText: string }) => void;
    setMedicalConclusion: (v: string) => void;
  },
) {
  const inv = (doc.investigations as Record<string, unknown>) || {};
  const labs: Record<string, boolean> = Object.fromEntries(LAB_KEYS.map((k) => [k, false]));
  for (const key of LAB_KEYS) {
    labs[key] = labFlag(inv, key);
  }
  setters.setInvestigations({
    ctg_done: inv.ctg_done === true,
    ultrasound_done: inv.ultrasound_done === true,
    ...labs,
  });
  setters.setLabsOpen(LAB_KEYS.some((k) => labs[k]));

  const ctgData = (doc.ctg as Record<string, unknown>) || {};
  setters.setCtg({
    resultType: ctgData.result_type != null ? String(ctgData.result_type) : "",
    basalHr: ctgData.basal_hr != null ? String(ctgData.basal_hr) : "",
  });

  const usData = (doc.ultrasound as Record<string, unknown>) || {};
  setters.setUltrasound({
    finding: usData.finding != null ? String(usData.finding) : "",
    disordersText: usData.disorders_text != null ? String(usData.disorders_text) : "",
  });

  if (doc.medical_conclusion) setters.setMedicalConclusion(String(doc.medical_conclusion));
}

export function buildDoctorDraftPayload(state: {
  investigations: Record<string, boolean>;
  ctg: { resultType: string; basalHr: string };
  ultrasound: { finding: string; disordersText: string };
  medicalConclusion: string;
}) {
  const invPayload: Record<string, boolean> = {
    ctg_done: state.investigations.ctg_done === true,
    ultrasound_done: state.investigations.ultrasound_done === true,
  };
  for (const key of LAB_KEYS) {
    if (state.investigations[key]) invPayload[key] = true;
  }

  return {
    doctor_examination: {
      investigations: invPayload,
      ctg: state.investigations.ctg_done
        ? {
            result_type: state.ctg.resultType || undefined,
            basal_hr: state.ctg.basalHr ? Number(state.ctg.basalHr) : undefined,
          }
        : undefined,
      ultrasound: state.investigations.ultrasound_done
        ? {
            finding: state.ultrasound.finding || undefined,
            disorders_text:
              state.ultrasound.finding === "disorders_found" ? state.ultrasound.disordersText.trim() : undefined,
          }
        : undefined,
      medical_conclusion: state.medicalConclusion.trim() || undefined,
    },
  };
}

export function buildDecisionDraftPayload(selected: string, note: string) {
  return {
    decision: {
      priority: selected || undefined,
      note: note.trim() || undefined,
    },
  };
}
