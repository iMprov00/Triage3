# frozen_string_literal: true

class Stage2DecisionSummaryPresenter
  def self.call(patient, stage2_case)
    new(patient, stage2_case).call
  end

  def initialize(patient, stage2_case)
    @patient = patient
    @stage2_case = stage2_case
    @st = stage2_case.stage2_triage
    @s1 = patient.triage
  end

  def call
    return { error: "Триаж этапа 2 не найден" } unless @st

    stage1 = Stage2Stage1SummaryPresenter.call(@patient)
    return stage1 if stage1[:error]

    {
      patient_id: @patient.id,
      full_name: @patient.full_name,
      stage1: stage1,
      pre_doctor: format_pre_doctor(@st.pre_doctor_data),
      doctor_examination: format_doctor_examination(@st.doctor_data),
      suggested_priority: @st.suggested_priority,
      suggested_priority_name: @st.suggested_priority_name,
      suggested_priority_reasons: priority_reasons(@st),
      destination_hint: Stage2Rules::DESTINATION_HINTS[@st.suggested_priority],
      decision_priorities: Stage2Rules::DECISION_PRIORITIES.map do |key|
        {
          key: key,
          label: Stage2Rules::PRIORITY_NAMES[key],
          destination_hint: Stage2Rules::DESTINATION_HINTS[key]
        }
      end
    }
  end

  private

  def format_pre_doctor(data)
    return {} if data.blank?

    discharge = option_label(Stage2Rules::DISCHARGE_OPTIONS, data["discharge"])
    fhr = option_label(Stage2Rules::FETAL_HEART_RATE_OPTIONS, data["fetal_heart_rate"])
    uterine = option_label(Stage2Rules::UTERINE_TONE_OPTIONS, data["uterine_tone"])
    skin_color = option_label(Stage2Rules::SKIN_COLOR_OPTIONS, data["skin_color"] || legacy_skin_color(data))
    edema = option_label(Stage2Rules::EDEMA_LOCATION_OPTIONS, data["edema_location"])

    vitals = data["vitals"] || {}
    {
      discharge: discharge,
      fetal_heart_rate: fhr,
      uterine_tone: uterine,
      contraction_duration_sec: data["contraction_duration_sec"],
      contraction_interval_min: data["contraction_interval_min"],
      pain_vas: data["pain_vas"],
      skin_color: skin_color,
      has_rash: data["has_rash"] == true || data["skin_finding"] == "rash",
      rash_description: data["rash_description"],
      has_edema: data["has_edema"] == true || data["skin_finding"] == "edema",
      edema_location: edema,
      ctg_ordered: data["ctg_ordered"] == true,
      ultrasound_ordered: data["ultrasound_ordered"] == true,
      vitals: vitals,
      doctor_called: data["doctor_called"] == true,
      called_doctor_name: data["called_doctor_name"],
      accepted_at: data["accepted_at"],
      completed_at: data["completed_at"],
      duration_seconds: data["duration_seconds"]
    }
  end

  def format_doctor_examination(data)
    return {} if data.blank?

    inv = data["investigations"] || {}
    investigations = Stage2Rules::INVESTIGATION_OPTIONS.map do |opt|
      { key: opt[:key], label: opt[:label], done: inv[opt[:key]] == true }
    end
    lab_investigations = Stage2Rules::LAB_INVESTIGATION_OPTIONS.map do |opt|
      done = inv[opt[:key]] == true
      done ||= inv["#{opt[:key]}_done"] == true if %w[labs_blood labs_urine].include?(opt[:key])
      { key: opt[:key], label: opt[:label], done: done }
    end

    {
      investigations: investigations,
      lab_investigations: lab_investigations,
      ctg: format_ctg(data["ctg"]),
      ultrasound: format_ultrasound(data["ultrasound"]),
      medical_conclusion: data["medical_conclusion"],
      completed_at: data["completed_at"]
    }
  end

  def format_ctg(ctg)
    return nil unless ctg.is_a?(Hash) && ctg["result_type"].present?

    label = option_label(Stage2Rules::CTG_RESULT_OPTIONS, ctg["result_type"])
    parts = []
    parts << "#{ctg['basal_hr']} уд/мин" if ctg["basal_hr"].present?
    detail = parts.presence&.join("; ")
    { label: label, detail: detail }.compact
  end

  def format_ultrasound(us)
    return nil unless us.is_a?(Hash) && us["finding"].present?

    label = option_label(Stage2Rules::ULTRASOUND_FINDING_OPTIONS, us["finding"])
    detail = us["disorders_text"] if us["finding"] == "disorders_found"
    { label: label, detail: detail }.compact
  end

  def option_label(options, key)
    options.find { |o| o[:key] == key.to_s }&.dig(:label) || key
  end

  def legacy_skin_color(data)
    skin = data["skin_finding"].to_s
    return skin unless %w[rash edema].include?(skin)

    "normal_color"
  end

  def priority_reasons(st)
    return [] unless st&.pre_doctor_completed?

    result = Stage2Rules::PreDoctorPriorityStrategy.new.evaluate_with_reasons(st.pre_doctor_data)
    result[:reasons] || []
  end
end
