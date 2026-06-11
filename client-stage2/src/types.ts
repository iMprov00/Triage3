export type Stage2TriageRow = {
  current_phase: string;
  phase_label: string;
  priority: string;
  priority_name?: string;
  suggested_priority?: string;
  suggested_priority_name?: string;
  display_priority?: string | null;
  display_priority_name?: string | null;
  pre_doctor_completed?: boolean;
  decision_completed?: boolean;
  workflow_route?: string;
  completed_at?: string | null;
  started_at?: string | null;
};

export type Stage2PatientListRow = {
  id: number;
  full_name: string;
  admission_date: string;
  admission_time?: string | null;
  performer_name?: string | null;
  birth_date?: string | null;
  appeal_type?: string | null;
  pregnancy_display?: string | null;
  transferred_at?: string | null;
  transfer_source?: string;
  can_delete: boolean;
  can_edit: boolean;
  card_state_class: string;
  stage1_priority?: string | null;
  stage1_priority_name?: string | null;
  stage2_triage?: Stage2TriageRow | null;
  stage2_case_id?: number;
};

export type EligiblePatientRow = {
  id: number;
  full_name: string;
  admission_date: string;
  admission_time?: string | null;
  performer_name?: string | null;
  appeal_type?: string | null;
  stage1_priority?: string | null;
  stage1_priority_name?: string | null;
  actions_completed_at?: string | null;
};
