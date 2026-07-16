# frozen_string_literal: true

class Stage2TriageStatePresenter
  def self.call(patient, stage2_case, viewer: nil)
    _ = viewer
    st = stage2_case.stage2_triage
    s1 = patient.triage
    {
      patient_id: patient.id,
      stage2_case_id: stage2_case.id,
      current_phase: st&.current_phase,
      phase_label: st&.phase_label,
      phases: Stage2Triage::PHASES.map { |k| { key: k, label: Stage2Triage::PHASE_LABELS[k] } },
      priority: st&.priority,
      priority_name: st&.priority_name,
      suggested_priority: st&.suggested_priority,
      suggested_priority_name: st&.suggested_priority_name,
      display_priority: st&.display_priority,
      display_priority_name: st&.display_priority_name,
      pre_doctor_data: st&.pre_doctor_data || {},
      pre_doctor_completed: st&.pre_doctor_completed? || false,
      doctor_data: st&.doctor_data || {},
      doctor_examination_completed: st&.doctor_examination_completed? || false,
      pre_doctor_timing: pre_doctor_timing(st),
      decision_data: st&.decision_data || {},
      decision_completed: st&.decision_completed? || false,
      investigations: st&.investigations_data || {},
      workflow_route: st&.workflow_route || "stub",
      pending_acceptance: stage2_case.pending_acceptance?,
      accepted: stage2_case.accepted?,
      can_submit_pre_doctor: st.present? && stage2_case.accepted? && !st.pre_doctor_completed? && st.current_phase == "pre_doctor",
      can_submit_doctor_examination: st.present? && stage2_case.accepted? && st.pre_doctor_completed? && !st.doctor_examination_completed?,
      can_submit_decision: st.present? && stage2_case.accepted? && st.doctor_examination_completed? && !st.decision_completed?,
      priority_actions: format_actions(st),
      actions_data: st&.actions_data || {},
      actions_started_at: st&.actions_started_at,
      actions_completed_at: st&.actions_completed_at,
      can_complete_actions: st.present? && st.decision_completed? && !st.actions_completed? &&
        st.can_complete_final_action? && final_action_completed?(st),
      phase_data: st&.phase_data_hash || {},
      started_at: st&.started_at,
      completed_at: st&.completed_at,
      stage1_priority: s1&.priority,
      stage1_priority_name: s1&.priority_name,
      can_advance: st.present? && !st.completed? && st.current_phase != "exit" && st.workflow_route == "stub"
    }.tap do |h|
      if viewer
        h[:can_edit_saved_phases] =
          !Stage2PatientListPresenter.other_role?(viewer) ||
          Stage2PatientListPresenter.case_performer?(stage2_case, patient, viewer)
      end
    end
  end

  def self.format_actions(st)
    return [] unless st&.decision_completed? && st.priority != "pending"

    st.priority_actions.map do |a|
      {
        key: a[:key],
        text: a[:text],
        final: a[:final] == true,
        recommendation: a[:recommendation] == true || (a[:final] != true),
        starts_timer: a[:starts_timer] == true,
        completed: st.action_completed?(a[:key])
      }
    end
  end

  def self.final_action_completed?(st)
    st.can_complete_final_action?
  end

  def self.pre_doctor_timing(st)
    return nil unless st&.pre_doctor_completed?

    data = st.pre_doctor_data
    accepted_at = data["accepted_at"]
    completed_at = data["completed_at"]
    duration = data["duration_seconds"]
    {
      accepted_at: accepted_at,
      completed_at: completed_at,
      duration_seconds: duration
    }
  end
end
