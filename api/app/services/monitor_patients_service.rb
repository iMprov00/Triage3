# frozen_string_literal: true

# Данные для монитора (get_monitor_patients_data из app.rb).
class MonitorPatientsService
  def self.call
    triage_patients = Patient.joins(:triage)
      .where(triages: { timer_active: true })
      .includes(:triage)

    action_patients = Patient.joins(:triage)
      .where.not(triages: { completed_at: nil })
      .where(triages: { actions_completed_at: nil })
      .includes(:triage)

    (triage_patients.to_a + action_patients.to_a).uniq(&:id).map { |patient| patient_payload(patient) }
  end

  def self.patient_payload(patient)
    triage = patient.triage
    is_in_actions = triage.completed_at.present? && triage.actions_completed_at.nil?

    data = {
      id: patient.id,
      full_name: patient.full_name,
      performer_name: patient.performer_name,
      appeal_type: patient.appeal_type,
      admission_time: patient.admission_time_formatted,
      step: triage.step,
      step_name: triage.step_name,
      priority: triage.priority,
      is_in_actions: is_in_actions
    }

    if is_in_actions
      now = Time.now
      if triage.actions_started_at
        actions_elapsed = (now - triage.actions_started_at).to_i
        actions_remaining = [0, Triage::ACTIONS_TIME_LIMIT - actions_elapsed].max
        actions_ends_at = (triage.actions_started_at + Triage::ACTIONS_TIME_LIMIT).to_f
        data[:actions_time_remaining] = actions_remaining
        data[:actions_timer_ends_at] = actions_ends_at
        data[:actions_max_time] = Triage::ACTIONS_TIME_LIMIT
      end

      if triage.brigade_called_at && triage.brigade_time_limit
        brigade_elapsed = (now - triage.brigade_called_at).to_i
        brigade_remaining = [0, triage.brigade_time_limit - brigade_elapsed].max
        brigade_ends_at = (triage.brigade_called_at + triage.brigade_time_limit).to_f
        data[:brigade_time_remaining] = brigade_remaining
        data[:brigade_timer_ends_at] = brigade_ends_at
        data[:brigade_max_time] = triage.brigade_time_limit
        data[:brigade_timer_label] = triage.brigade_timer_label
      end

      if triage.red_arrest_actions_flow?
        prog = triage.red_arrest_actions_progress_for_monitor
        data[:actions_total] = prog[:total]
        data[:actions_completed] = prog[:completed]
      else
        actions = triage.priority_actions || []
        completed_actions = (triage.actions_data || {}).keys.length
        data[:actions_total] = actions.length
        data[:actions_completed] = completed_actions
      end
    else
      data[:time_remaining] = triage.time_remaining
      data[:timer_ends_at] = triage.timer_ends_at
      max_times = { 1 => 120, 2 => 300, 3 => 600 }
      data[:max_time] = max_times[triage.step] || 120
    end

    data
  end
end
