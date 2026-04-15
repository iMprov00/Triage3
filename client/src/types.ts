export type TriageListTriage = {
  step: number;
  priority: string;
  priority_name: string;
  completed_at: string | null;
  actions_completed_at: string | null;
  timer_active: boolean;
  time_remaining: number;
  timer_ends_at: number | null;
  expired: boolean;
  max_time: number;
  step1_data: Record<string, unknown>;
  step2_data: Record<string, unknown>;
  step3_data: Record<string, unknown>;
};

export type PatientListRow = {
  id: number;
  full_name: string;
  admission_date: string;
  admission_time: string;
  performer_name: string;
  birth_date?: string;
  appeal_type?: string;
  pregnancy_display?: string;
  can_delete: boolean;
  can_edit_saved_steps: boolean;
  card_state_class: string;
  triage: TriageListTriage | null;
};
