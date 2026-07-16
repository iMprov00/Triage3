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
    stopped_at = detect_stopped_at_step(t, s2, s3)
    step3_out = format_step3_vitals(s3)
    step3_out = merge_actions_vitals(step3_out, t) if vitals_blank?(step3_out)

    {
      patient_id: @patient.id,
      full_name: @patient.full_name,
      priority: t.priority,
      priority_name: t.priority_name,
      actions_completed_at: PatientListPresenter.format_time_nsk(t.actions_completed_at, "%d.%m.%Y %H:%M"),
      stopped_at_step: stopped_at,
      stopped_at_step_note: stopped_at_step_note(stopped_at),
      step1: {
        eye_opening: s1["eye_opening"],
        verbal_response: s1["verbal_response"],
        motor_response: s1["motor_response"],
        breathing: bool_label(s1["breathing"], "Да", "Нет"),
        heartbeat: bool_label(s1["heartbeat"], "Да", "Нет"),
        seizures: bool_label(s1["seizures"], "Да", "Нет"),
        active_bleeding: bool_label(s1["active_bleeding"], "Да", "Нет"),
        eye_score: @triage.eye_score,
        verbal_score: @triage.verbal_score,
        motor_score: @triage.motor_score,
        total_consciousness_score: @triage.total_consciousness_score
      },
      step2: {
        position: s2["position"],
        urgency_criteria: format_indices(s2["urgency_criteria"], Triage::URGENCY_CRITERIA),
        infection_signs: format_indices(s2["infection_signs"], Triage::INFECTION_SIGNS)
      },
      step3: step3_out
    }
  end

  private

  def detect_stopped_at_step(triage, s2, s3)
    return 3 if step2_filled?(s2) && step3_filled?(s3)
    return 2 if step2_filled?(s2) && triage.completed_at.present?
    return 1 if triage.completed_at.present?

    nil
  end

  def step2_filled?(s2)
    s2.present? && (
      s2["position"].present? ||
      Array(s2["urgency_criteria"]).any? ||
      Array(s2["infection_signs"]).any?
    )
  end

  def step3_filled?(s3)
    s3.present? && %w[respiratory_rate saturation systolic_bp diastolic_bp heart_rate temperature].any? do |k|
      s3[k].present?
    end
  end

  def stopped_at_step_note(step)
    case step
    when 1
      "Триаж этапа 1 завершён на шаге 1 — критерии неотложности и витальные функции (шаги 2–3) не заполнялись."
    when 2
      "Триаж этапа 1 завершён на шаге 2 — витальные функции (шаг 3) не заполнялись."
    else
      nil
    end
  end

  def format_step3_vitals(s3)
    {
      respiratory_rate: s3["respiratory_rate"],
      saturation: s3["saturation"],
      systolic_bp: s3["systolic_bp"],
      diastolic_bp: s3["diastolic_bp"],
      heart_rate: s3["heart_rate"],
      temperature: s3["temperature"]
    }
  end

  def vitals_blank?(step3)
    step3.values.all? { |v| v.blank? && v != 0 }
  end

  def merge_actions_vitals(step3, triage)
    from_actions = vitals_from_actions_data(triage)
    return step3 if from_actions.empty?

    step3.merge(from_actions) { |_key, existing, incoming| existing.presence || incoming }
  end

  def vitals_from_actions_data(triage)
    data = triage.actions_data
    return {} unless data.is_a?(Hash)

    schema = triage.actions_flow_schema
    bucket = schema&.dig(:bucket)&.to_s
    return {} if bucket.blank?

    vitals = data.dig(bucket, "vitals")
    return {} unless vitals.is_a?(Hash) && vitals.any?

    out = {}
    bp = vitals["bp"]
    if bp.is_a?(Hash)
      values = Array(bp["values"] || bp[:values])
      out[:systolic_bp] = values[0] if values[0].present?
      out[:diastolic_bp] = values[1] if values[1].present?
    end

    pulse = vitals["pulse"]
    out[:heart_rate] = pulse["value"] || pulse[:value] if pulse.is_a?(Hash)

    spo2 = vitals["saturation"]
    out[:saturation] = spo2["value"] || spo2[:value] if spo2.is_a?(Hash)

    out.transform_keys(&:to_s).transform_values { |v| v.to_s.presence }.compact
  end

  def bool_label(val, yes_t, no_t)
    v = val == true || val.to_s == "true"
    v ? yes_t : no_t
  end

  def format_indices(indices, catalog)
    Array(indices).filter_map do |item|
      s = item.to_s.strip
      if s.match?(/^\d+$/)
        i = s.to_i
        catalog[i] if i >= 0 && i < catalog.size
      elsif catalog.include?(s)
        s
      end
    end
  end
end
