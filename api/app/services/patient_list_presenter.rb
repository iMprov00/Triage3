# frozen_string_literal: true

class PatientListPresenter
  NOVOSIBIRSK_OFFSET = 7 * 3600

  def self.format_time_nsk(time, format = "%d.%m.%Y %H:%M")
    return nil unless time

    (time.utc + NOVOSIBIRSK_OFFSET).strftime(format)
  end

  def self.card_state_class(patient)
    t = patient.triage
    return "patient-b-card--notriage" if t.nil?
    return "patient-b-card--done" if t.actions_completed?

    return "patient-b-card--triage-active" if t.completed_at.blank?

    case t.priority.to_s
    when "red" then "patient-b-card--priority-red"
    when "yellow" then "patient-b-card--priority-yellow"
    when "purple" then "patient-b-card--priority-purple"
    when "green" then "patient-b-card--priority-green"
    else "patient-b-card--triage-active"
    end
  end

  def self.to_list_hash(patient, viewer)
    t = patient.triage
    max_time = if t
                 case t.step
                 when 1 then 120
                 when 2 then 300
                 when 3 then 600
                 else 120
                 end
               else
                 120
               end
    {
      id: patient.id,
      full_name: patient.full_name,
      admission_date: patient.admission_date.to_s,
      admission_time: patient.admission_time_formatted,
      performer_name: patient.performer_name,
      birth_date: patient.birth_date&.to_s,
      appeal_type: patient.appeal_type,
      pregnancy_display: patient.pregnancy_display,
      created_at: format_time_nsk(patient.created_at, "%d.%m.%Y %H:%M"),
      can_delete: !other_role?(viewer),
      can_edit_saved_steps: !other_role?(viewer) || patient_performer?(patient, viewer),
      card_state_class: card_state_class(patient),
      triage: t ? triage_hash(t, max_time) : nil
    }
  end

  def self.other_role?(user)
    user&.job_position&.kind == "other"
  end

  def self.patient_performer?(patient, user)
    return false unless user && patient

    if patient.performer_user_id.present? && patient.performer_user_id == user.id
      return true
    end

    patient.performer_name.to_s.strip == user.full_name.to_s.strip
  end

  def self.triage_hash(t, max_time)
    {
      step: t.step,
      priority: t.priority,
      priority_name: t.priority_name,
      completed_at: t.completed_at,
      actions_completed_at: t.actions_completed_at,
      timer_active: t.timer_active,
      time_remaining: t.time_remaining,
      timer_ends_at: t.timer_ends_at,
      expired: t.expired?,
      max_time: max_time,
      step1_data: t.step1_data || {},
      step2_data: t.step2_data || {},
      step3_data: t.step3_data || {}
    }
  end
end
