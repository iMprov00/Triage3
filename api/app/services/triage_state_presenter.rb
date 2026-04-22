# frozen_string_literal: true

class TriageStatePresenter
  def self.call(patient, triage, viewer: nil)
    h = {
      patient_id: patient.id,
      patient_full_name: patient.full_name,
      step: triage.step,
      priority: triage.priority,
      priority_name: triage.priority_name,
      completed_at: triage.completed_at,
      actions_completed_at: triage.actions_completed_at,
      timer_active: triage.timer_active,
      time_remaining: triage.time_remaining,
      timer_ends_at: triage.timer_ends_at,
      max_time: triage.step_duration,
      expired: triage.expired?,
      step1_data: triage.step1_data || {},
      step2_data: triage.step2_data || {},
      step3_data: triage.step3_data || {},
      actions_data: triage.actions_data || {},
      actions_started_at: triage.actions_started_at,
      actions_time_limit: Triage::ACTIONS_TIME_LIMIT,
      actions_timer_ends_at: triage.actions_timer_ends_at,
      brigade_called_at: triage.brigade_called_at&.iso8601(3),
      brigade_time_limit: triage.brigade_time_limit,
      brigade_timer_label: triage.brigade_timer_label,
      red_arrest_flow: triage.red_arrest_actions_flow?,
      actions_flow_kind: triage.actions_flow_kind,
      actions_flow_schema: begin
        schema = triage.actions_flow_schema
        if schema
          {
            team: schema[:team].map { |e| { key: e[:key].to_s, label: e[:label] } },
            manips: schema[:manips].map { |e| { key: e[:key].to_s, label: e[:label] } },
            vitals: schema[:vitals].map { |e| { key: e[:key].to_s, label: e[:label] } }
          }
        else
          nil
        end
      end,
      red_arrest_schema: {
        team: Triage::RED_ARREST_TEAM.map { |e| { key: e[:key].to_s, label: e[:label] } },
        manips: Triage::RED_ARREST_MANIPS.map { |e| { key: e[:key].to_s, label: e[:label] } },
        vitals: Triage::RED_ARREST_VITALS.map { |e| { key: e[:key].to_s, label: e[:label] } }
      },
      priority_actions: triage.priority_actions,
      final_action: triage.final_action,
      can_complete_final: triage.can_complete_final_action?,
      brigade_timer_ends_at: triage.brigade_timer_ends_at,
      can_complete_red_arrest: triage.can_complete_red_arrest?,
      can_complete_actions_flow: triage.can_complete_actions_flow?
    }
    if viewer
      h[:can_edit_saved_steps] =
        !PatientListPresenter.other_role?(viewer) || PatientListPresenter.patient_performer?(patient, viewer)
    end
    h
  end
end
