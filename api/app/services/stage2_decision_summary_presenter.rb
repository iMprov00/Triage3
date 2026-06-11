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
      suggested_priority: @st.suggested_priority,
      suggested_priority_name: @st.suggested_priority_name,
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
    skin = option_label(Stage2Rules::SKIN_FINDING_OPTIONS, data["skin_finding"])
    edema = option_label(Stage2Rules::EDEMA_LOCATION_OPTIONS, data["edema_location"])

    inv = data["investigations"] || {}
    investigations = Stage2Rules::INVESTIGATION_OPTIONS.map do |opt|
      { key: opt[:key], label: opt[:label], done: inv[opt[:key]] == true }
    end

    vitals = data["vitals"] || {}
    {
      discharge: discharge,
      fetal_heart_rate: fhr,
      uterine_tone: uterine,
      contraction_duration_sec: data["contraction_duration_sec"],
      contraction_interval_min: data["contraction_interval_min"],
      pain_vas: data["pain_vas"],
      skin_finding: skin,
      edema_location: edema,
      vitals: vitals,
      investigations: investigations,
      completed_at: data["completed_at"]
    }
  end

  def option_label(options, key)
    options.find { |o| o[:key] == key.to_s }&.dig(:label) || key
  end
end
