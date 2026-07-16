export type Stage2Phase = "pre_doctor" | "doctor_examination" | "decision";

const EDIT_PATHS: Record<Stage2Phase, string> = {
  pre_doctor: "pre-doctor",
  doctor_examination: "doctor-examination",
  decision: "decision",
};

export function stage2PathIsEditMode(pathname: string, phase: Stage2Phase): boolean {
  return pathname.includes(`/workflow/edit/${EDIT_PATHS[phase]}`);
}

export function stage2EditPhasePath(patientId: string | number, phase: Stage2Phase): string {
  return `/patients/${patientId}/workflow/edit/${EDIT_PATHS[phase]}`;
}

export function stage2ActivePhasePath(patientId: string | number, workflowRoute: string): string {
  if (workflowRoute === "decision") return `/patients/${patientId}/decision`;
  if (workflowRoute === "doctor_examination") return `/patients/${patientId}/doctor-examination`;
  if (workflowRoute === "actions") return `/patients/${patientId}/actions`;
  if (workflowRoute === "completed") return `/patients/${patientId}/actions/report`;
  return `/patients/${patientId}/workflow`;
}

export function stage2HasSavedPhaseData(
  triage: {
    pre_doctor_completed?: boolean;
    doctor_examination_completed?: boolean;
    decision_completed?: boolean;
    decision_data?: Record<string, unknown>;
  },
  phase: Stage2Phase,
): boolean {
  if (phase === "pre_doctor") return triage.pre_doctor_completed === true;
  if (phase === "doctor_examination") return triage.doctor_examination_completed === true;
  if (phase === "decision") {
    return triage.decision_completed === true && Boolean(triage.decision_data?.completed_at);
  }
  return false;
}

export type Stage2PhaseEditPreview = {
  ok: boolean;
  error?: string;
  suggested_priority_changed?: boolean;
  suggested_priority?: string;
  suggested_priority_name?: string;
  priority_changed?: boolean;
  current_priority?: string;
  current_priority_name?: string;
  new_priority?: string;
  new_priority_name?: string;
  downstream_reset?: boolean;
};

export type Stage2PhaseEditUpdateResponse = {
  ok: boolean;
  error?: string;
  triage?: {
    workflow_route: string;
    [key: string]: unknown;
  };
};
