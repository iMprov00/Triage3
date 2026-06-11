# frozen_string_literal: true

class Stage2ActionsReportPresenter
  def self.call(patient, stage2_case)
    new(patient, stage2_case).call
  end

  def initialize(patient, stage2_case)
    @patient = patient
    @stage2_case = stage2_case
    @st = stage2_case.stage2_triage
  end

  def call
    return { error: "Триаж этапа 2 не найден" } unless @st

    decision = Stage2DecisionSummaryPresenter.call(@patient, @stage2_case)
    return decision if decision[:error]

    {
      patient_id: @patient.id,
      full_name: @patient.full_name,
      stage2_triage: {
        priority: @st.priority,
        priority_name: @st.priority_name,
        suggested_priority: @st.suggested_priority,
        suggested_priority_name: @st.suggested_priority_name,
        actions_started_at: @st.actions_started_at,
        actions_completed_at: @st.actions_completed_at,
        completed_at: @st.completed_at
      },
      decision_summary: decision,
      actions_phase: actions_phase_stats,
      audit_events: audit_events_payload,
      workflow_events: workflow_events_payload
    }
  end

  private

  def actions_phase_stats
    started = @st.actions_started_at
    completed = @st.actions_completed_at
    return nil unless started

    end_time = completed || Time.current
    seconds = (end_time - started).to_i
    {
      seconds_used: seconds,
      completed: completed.present?
    }
  end

  def audit_events_payload
    @patient.stage2_audit_events
      .where(stage2_case_id: @stage2_case.id)
      .order(:occurred_at)
      .map { |ev| format_audit_event(ev) }
  end

  def workflow_events_payload
    audit_events_payload.select do |ev|
      %w[
        pre_doctor_submitted
        suggested_priority_computed
        decision_confirmed
        priority_action_marked
        priority_action_unmarked
        actions_completed
      ].include?(ev[:event_type])
    end
  end

  def format_audit_event(ev)
    payload = ev.payload_hash
    action_key = payload["action"].to_s
    {
      id: ev.id,
      event_type: ev.event_type,
      event_label: Stage2AuditEvent::EVENT_LABELS[ev.event_type] || ev.event_type,
      occurred_at: ev.occurred_at,
      payload: payload,
      action_text: action_key.present? ? Stage2Triage.action_text_for_key(action_key) : nil
    }
  end
end
