# frozen_string_literal: true

module Stage2Rules
  DISCHARGE_OPTIONS = [
    { key: "mucous", label: "Слизистые" },
    { key: "heavy_bleeding", label: "Кровянистые обильные" },
    { key: "moderate_bleeding", label: "Кровянистые умеренные" },
    { key: "amniotic_waters", label: "Околоплодные воды" },
    { key: "suspected_liquor", label: "Подозрение на амниотическую жидкость" }
  ].freeze

  FETAL_HEART_RATE_OPTIONS = [
    { key: "normal", label: "Норма (110–160 уд/мин)" },
    { key: "bradycardia", label: "Брадикардия" },
    { key: "tachycardia", label: "Тахикардия" },
    { key: "absent", label: "Отсутствует" },
    { key: "not_assessed", label: "Не оценено" }
  ].freeze

  UTERINE_TONE_OPTIONS = [
    { key: "normal", label: "Нормальный" },
    { key: "elevated", label: "Повышенный" },
    {
      key: "labor_regular",
      label: "Возможна родовая деятельность",
      requires: %w[contraction_duration_sec contraction_interval_min]
    },
    {
      key: "labor_irregular",
      label: "Схватки нерегулярные",
      requires: %w[contraction_duration_sec]
    }
  ].freeze

  SKIN_FINDING_OPTIONS = [
    { key: "normal_color", label: "Обычного цвета" },
    { key: "pale", label: "Бледные" },
    { key: "cyanotic", label: "Цианотичные" },
    { key: "jaundiced", label: "Желтушные" },
    { key: "rash", label: "Наличие сыпи" },
    { key: "edema", label: "Наличие отёков", requires_edema_location: true }
  ].freeze

  EDEMA_LOCATION_OPTIONS = [
    { key: "lower_limbs", label: "Нижние конечности" },
    { key: "upper_limbs", label: "Верхние конечности" },
    { key: "face", label: "Лицо" },
    { key: "anterior_abdominal_wall", label: "Передняя брюшная стенка" }
  ].freeze

  VITAL_FIELDS = %w[systolic_bp diastolic_bp heart_rate respiratory_rate saturation].freeze

  PRIORITY_NAMES = {
    "pending" => "Не определён",
    "red" => "Красный",
    "yellow" => "Жёлтый",
    "orange" => "Оранжевый",
    "grey" => "Серый",
    "green" => "Зелёный"
  }.freeze

  class PreDoctorPriorityStrategy
    def evaluate(data)
      d = normalize(data)
      return "red" if red?(d)
      return "yellow" if yellow?(d)

      "green"
    end

    private

    def normalize(data)
      {
        discharge: (data["discharge"] || data[:discharge]).to_s,
        fetal_heart_rate: (data["fetal_heart_rate"] || data[:fetal_heart_rate]).to_s,
        uterine_tone: (data["uterine_tone"] || data[:uterine_tone]).to_s,
        pain_vas: (data["pain_vas"] || data[:pain_vas]).to_i,
        skin_finding: (data["skin_finding"] || data[:skin_finding]).to_s,
        vitals: data["vitals"] || data[:vitals] || {}
      }
    end

    def red?(d)
      return true if d[:discharge] == "heavy_bleeding"
      return true if %w[absent bradycardia tachycardia].include?(d[:fetal_heart_rate])
      return true if d[:uterine_tone] == "elevated" && d[:pain_vas] >= 7
      return true if d[:skin_finding] == "cyanotic"

      false
    end

    def yellow?(d)
      return true if %w[moderate_bleeding amniotic_waters suspected_liquor].include?(d[:discharge])
      return true if d[:fetal_heart_rate] == "not_assessed"
      return true if d[:uterine_tone] == "elevated"
      return true if %w[labor_regular labor_irregular].include?(d[:uterine_tone])
      return true if d[:pain_vas].between?(4, 6)
      return true if %w[pale jaundiced rash edema].include?(d[:skin_finding])
      return true if vital_yellow?(d[:vitals])

      false
    end

    def vital_yellow?(vitals)
      return false unless vitals.is_a?(Hash)

      rr = vitals["respiratory_rate"].to_i
      sat = vitals["saturation"].to_i
      sbp = vitals["systolic_bp"].to_i
      dbp = vitals["diastolic_bp"].to_i
      hr = vitals["heart_rate"].to_i

      return true if rr > 0 && (rr > 24 || rr < 16)
      return true if sat > 0 && sat < 93
      return true if sbp >= 140
      return true if dbp >= 90
      return true if hr > 0 && (hr > 110 || hr < 50)

      false
    end
  end
end
