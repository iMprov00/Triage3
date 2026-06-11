# frozen_string_literal: true

class Stage2Stage1SummaryPresenter
  def self.call(patient)
    new(patient).call
  end

  def initialize(patient)
    @patient = patient
    @triage = patient.triage
  end

  def call
    return { error: "Триаж этапа 1 не найден" } unless @triage

    t = @triage
    s1 = t.step1_data || {}
    s2 = t.step2_data || {}
    s3 = t.step3_data || {}

    {
      patient_id: @patient.id,
      full_name: @patient.full_name,
      priority: t.priority,
      priority_name: t.priority_name,
      actions_completed_at: PatientListPresenter.format_time_nsk(t.actions_completed_at, "%d.%m.%Y %H:%M"),
      step1: {
        eye_opening: s1["eye_opening"],
        verbal_response: s1["verbal_response"],
        motor_response: s1["motor_response"],
        breathing: bool_label(s1["breathing"], "Да", "Нет"),
        heartbeat: bool_label(s1["heartbeat"], "Да", "Нет"),
        seizures: bool_label(s1["seizures"], "Да", "Нет"),
        active_bleeding: bool_label(s1["active_bleeding"], "Да", "Нет")
      },
      step2: {
        position: s2["position"],
        urgency_criteria: format_indices(s2["urgency_criteria"], Triage::URGENCY_CRITERIA),
        infection_signs: format_indices(s2["infection_signs"], Triage::INFECTION_SIGNS)
      },
      step3: {
        respiratory_rate: s3["respiratory_rate"],
        saturation: s3["saturation"],
        systolic_bp: s3["systolic_bp"],
        diastolic_bp: s3["diastolic_bp"],
        heart_rate: s3["heart_rate"],
        temperature: s3["temperature"]
      }
    }
  end

  private

  def bool_label(val, yes_t, no_t)
    v = val == true || val.to_s == "true"
    v ? yes_t : no_t
  end

  def format_indices(indices, catalog)
    arr = Array(indices).map { |i| i.to_i }
    arr.filter_map { |i| catalog[i] }
  end
end
