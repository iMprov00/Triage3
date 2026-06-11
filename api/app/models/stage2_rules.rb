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

  INVESTIGATION_OPTIONS = [
    { key: "ctg_done", label: "КТГ выполнено" },
    { key: "ultrasound_done", label: "УЗИ выполнено" },
    { key: "labs_blood_done", label: "Анализ крови выполнен" },
    { key: "labs_urine_done", label: "Анализ мочи выполнен" }
  ].freeze

  VITAL_FIELDS = %w[systolic_bp diastolic_bp heart_rate respiratory_rate saturation].freeze

  DECISION_PRIORITIES = %w[red yellow orange grey green].freeze

  PRIORITY_NAMES = {
    "pending" => "Не определён",
    "red" => "Красный",
    "yellow" => "Жёлтый",
    "orange" => "Оранжевый",
    "grey" => "Серый",
    "green" => "Зелёный"
  }.freeze

  DESTINATION_HINTS = {
    "red" => "Операционная / родовой бокс",
    "yellow" => "ПИТ",
    "orange" => "Родовое отделение",
    "grey" => "Профильное учреждение",
    "green" => "Отделение патологии"
  }.freeze

  class PreDoctorPriorityStrategy
    def evaluate(data)
      d = normalize(data)
      return "red" if red?(d)
      return "grey" if grey?(d)
      return "yellow" if yellow?(d)
      return "orange" if orange?(d)

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

    def grey?(d)
      d[:discharge] == "suspected_liquor"
    end

    def yellow?(d)
      return true if %w[moderate_bleeding amniotic_waters].include?(d[:discharge])
      return true if d[:fetal_heart_rate] == "not_assessed"
      return true if d[:uterine_tone] == "elevated"
      return true if d[:uterine_tone] == "labor_irregular"
      return true if d[:pain_vas].between?(4, 6)
      return true if %w[pale jaundiced rash edema].include?(d[:skin_finding])
      return true if vital_yellow?(d[:vitals])

      false
    end

    def orange?(d)
      d[:uterine_tone] == "labor_regular"
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

  class ActionsCatalog
    def actions_for(priority:, triage: nil)
      _ = triage
      []
    end

    def action_text_for_key(key)
      key.to_s
    end
  end

  class DefaultActionsCatalog < ActionsCatalog
    RED_ACTIONS = [
      { key: "s2_red_stabilize", text: "Немедленная стабилизация состояния" },
      { key: "s2_red_or", text: "Подготовка к экстренному родоразрешению / операции" },
      { key: "s2_red_anesthesia", text: "Вызов анестезиолога-реаниматолога" },
      { key: "s2_red_monitor", text: "Непрерывный мониторинг плода и матери" },
      { key: "s2_red_exit", text: "Перевод: операционная / родовой бокс", final: true, final_always_available: false }
    ].freeze

    YELLOW_ACTIONS = [
      { key: "s2_yellow_exam", text: "Расширенное обследование (КТГ, УЗИ, анализы)" },
      { key: "s2_yellow_consult", text: "Консультация акушера-гинеколога" },
      { key: "s2_yellow_pit", text: "Подготовка к переводу в ПИТ" },
      { key: "s2_yellow_vitals", text: "Контроль витальных функций" },
      { key: "s2_yellow_exit", text: "Перевод: ПИТ", final: true, final_always_available: false }
    ].freeze

    ORANGE_ACTIONS = [
      { key: "s2_orange_observe", text: "Наблюдение в родовом отделении" },
      { key: "s2_orange_ctg", text: "КТГ / мониторинг плода" },
      { key: "s2_orange_docs", text: "Оформление документации" },
      { key: "s2_orange_exit", text: "Перевод: родовое отделение", final: true, final_always_available: false }
    ].freeze

    GREY_ACTIONS = [
      { key: "s2_grey_prepare", text: "Подготовка к переводу в профильное учреждение" },
      { key: "s2_grey_docs", text: "Оформление сопроводительной документации" },
      { key: "s2_grey_notify", text: "Уведомление принимающей стороны" },
      { key: "s2_grey_exit", text: "Перевод: профильное учреждение", final: true, final_always_available: false }
    ].freeze

    GREEN_ACTIONS = [
      { key: "s2_green_exam", text: "Плановое обследование" },
      { key: "s2_green_consult", text: "Консультация врача" },
      { key: "s2_green_admit", text: "Подготовка к госпитализации" },
      { key: "s2_green_exit", text: "Перевод: отделение патологии", final: true, final_always_available: false }
    ].freeze

    ALL_ACTIONS = (
      RED_ACTIONS + YELLOW_ACTIONS + ORANGE_ACTIONS + GREY_ACTIONS + GREEN_ACTIONS
    ).freeze

    def actions_for(priority:, triage: nil)
      _ = triage
      case priority.to_s
      when "red" then RED_ACTIONS
      when "yellow" then YELLOW_ACTIONS
      when "orange" then ORANGE_ACTIONS
      when "grey" then GREY_ACTIONS
      when "green" then GREEN_ACTIONS
      else []
      end
    end

    def action_text_for_key(key)
      action = ALL_ACTIONS.find { |a| a[:key] == key.to_s }
      action ? action[:text] : key.to_s
    end
  end
end
