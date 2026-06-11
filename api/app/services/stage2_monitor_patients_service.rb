# frozen_string_literal: true

class Stage2MonitorPatientsService
  def self.call
    new.call
  end

  def call
    Stage2Case.joins(:patient, :stage2_triage)
      .includes(:patient, :stage2_triage)
      .where(stage2_triages: { completed_at: nil })
      .where.not(stage2_triages: { current_phase: "exit" })
      .order("stage2_cases.transferred_at ASC")
      .map { |c| monitor_row(c) }
  end

  private

  def monitor_row(case_record)
    p = case_record.patient
    st = case_record.stage2_triage
    display_priority = st.display_priority
    {
      id: p.id,
      full_name: p.full_name,
      performer_name: case_record.performer_name.presence || p.performer_name,
      appeal_type: p.appeal_type,
      admission_time: case_record.admission_time_formatted,
      current_phase: st.current_phase,
      phase_label: st.phase_label,
      priority: display_priority || st.priority,
      priority_name: st.display_priority_name,
      workflow_route: st.workflow_route,
      stage1_priority: p.triage&.priority,
      stage1_priority_name: p.triage&.priority_name
    }
  end
end
