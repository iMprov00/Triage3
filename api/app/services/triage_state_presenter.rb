# frozen_string_literal: true

class TriageStatePresenter
  def self.call(patient, triage)
    {
      patient_id: patient.id,
      step: triage.step,
      priority: triage.priority,
      priority_name: triage.priority_name,
      completed_at: triage.completed_at,
      actions_completed_at: triage.actions_completed_at,
      timer_active: triage.timer_active,
      time_remaining: triage.time_remaining,
      timer_ends_at: triage.timer_ends_at,
      expired: triage.expired?,
      step1_data: triage.step1_data || {},
      step2_data: triage.step2_data || {},
      step3_data: triage.step3_data || {},
      actions_data: triage.actions_data || {},
      actions_started_at: triage.actions_started_at,
      actions_time_limit: Triage::ACTIONS_TIME_LIMIT,
      red_arrest_flow: triage.red_arrest_actions_flow?,
      priority_actions: triage.priority_actions,
      final_action: triage.final_action,
      can_complete_final: triage.can_complete_final_action?,
      brigade_timer_ends_at: triage.brigade_timer_ends_at,
      can_complete_red_arrest: triage.can_complete_red_arrest?
    }
  end
end
