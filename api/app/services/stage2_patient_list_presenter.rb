# frozen_string_literal: true

class Stage2PatientListPresenter
  NOVOSIBIRSK_OFFSET = PatientListPresenter::NOVOSIBIRSK_OFFSET

  def self.format_time_nsk(time, format = "%d.%m.%Y %H:%M")
    PatientListPresenter.format_time_nsk(time, format)
  end

  def self.card_state_class(patient, stage2_case)
    st = stage2_case&.stage2_triage
    return "patient-b-card--notriage" unless st

    return "patient-b-card--done" if st.completed?

    effective_priority = st.display_priority || patient.triage&.priority
    case effective_priority.to_s
    when "red" then "patient-b-card--priority-red"
    when "yellow" then "patient-b-card--priority-yellow"
    when "orange" then "patient-b-card--priority-orange"
    when "grey" then "patient-b-card--priority-grey"
    when "green" then "patient-b-card--priority-green"
    else "patient-b-card--triage-active"
    end
  end

  def self.to_list_hash(patient, stage2_case, viewer)
    st = stage2_case.stage2_triage
    s1 = patient.triage
    {
      id: patient.id,
      full_name: patient.full_name,
      admission_date: (stage2_case.admission_date || patient.admission_date).to_s,
      admission_time: stage2_case.admission_time_formatted || patient.admission_time_formatted,
      performer_name: stage2_case.performer_name.presence || patient.performer_name,
      birth_date: patient.birth_date&.to_s,
      appeal_type: patient.appeal_type,
      pregnancy_display: patient.pregnancy_display,
      created_at: format_time_nsk(stage2_case.transferred_at, "%d.%m.%Y %H:%M"),
      transferred_at: format_time_nsk(stage2_case.transferred_at, "%d.%m.%Y %H:%M"),
      transfer_source: stage2_case.transfer_source,
      can_delete: !other_role?(viewer),
      can_edit: !other_role?(viewer) || case_performer?(stage2_case, patient, viewer),
      card_state_class: card_state_class(patient, stage2_case),
      stage1_priority: s1&.priority,
      stage1_priority_name: s1&.priority_name,
      stage2_triage: stage2_triage_hash(st),
      stage2_case_id: stage2_case.id
    }
  end

  def self.stage2_triage_hash(st)
    return nil unless st

    {
      current_phase: st.current_phase,
      phase_label: st.phase_label,
      priority: st.priority,
      priority_name: st.priority_name,
      suggested_priority: st.suggested_priority,
      suggested_priority_name: st.suggested_priority_name,
      display_priority: st.display_priority,
      display_priority_name: st.display_priority_name,
      pre_doctor_completed: st.pre_doctor_completed?,
      decision_completed: st.decision_completed?,
      workflow_route: st.workflow_route,
      completed_at: st.completed_at,
      started_at: st.started_at
    }
  end

  def self.other_role?(user)
    user&.job_position&.kind == "other"
  end

  def self.case_performer?(stage2_case, patient, user)
    return false unless user

    if stage2_case.performer_user_id.present? && stage2_case.performer_user_id == user.id
      return true
    end

    name = stage2_case.performer_name.presence || patient.performer_name
    name.to_s.strip == user.full_name.to_s.strip
  end
end
