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

  SKIN_COLOR_OPTIONS = [
    { key: "normal_color", label: "Обычного цвета" },
    { key: "pale", label: "Бледные" },
    { key: "cyanotic", label: "Цианотичные" },
    { key: "jaundiced", label: "Желтушные" }
  ].freeze

  # Legacy alias for backward compatibility in reports
  SKIN_FINDING_OPTIONS = SKIN_COLOR_OPTIONS.freeze

  EDEMA_LOCATION_OPTIONS = [
    { key: "lower_limbs", label: "Нижние конечности" },
    { key: "upper_limbs", label: "Верхние конечности" },
    { key: "face", label: "Лицо" },
    { key: "anterior_abdominal_wall", label: "Передняя брюшная стенка" }
  ].freeze

  INVESTIGATION_OPTIONS = [
    { key: "ctg_done", label: "КТГ" },
    { key: "ultrasound_done", label: "УЗИ" }
  ].freeze

  LAB_INVESTIGATION_OPTIONS = [
    { key: "labs_blood", label: "Анализ крови" },
    { key: "labs_urine", label: "Анализ мочи" },
    { key: "labs_biochemistry", label: "Биохимический анализ крови" },
    { key: "labs_hiv", label: "Обследование ВИЧ" },
    { key: "labs_syphilis", label: "Обследование сифилиса" },
    { key: "labs_hemostasis", label: "Обследование системы гемостаза" },
    { key: "labs_blood_group", label: "Определение группы крови и резус-фактора" }
  ].freeze

  CTG_RESULT_OPTIONS = [
    { key: "normal", label: "Нормальный тип" },
    { key: "doubtful", label: "Сомнительный тип" },
    { key: "pathological", label: "Патологический тип" }
  ].freeze

  ULTRASOUND_FINDING_OPTIONS = [
    { key: "no_disorders", label: "Нарушений не выявлено" },
    { key: "disorders_found", label: "Выявлены нарушения", requires_text: true }
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
      evaluate_with_reasons(data)[:priority]
    end

    def evaluate_with_reasons(data)
      d = normalize(data)
      if red?(d)
        return { priority: "red", reasons: red_reasons(d) }
      end
      if grey?(d)
        return { priority: "grey", reasons: grey_reasons(d) }
      end
      if yellow?(d)
        return { priority: "yellow", reasons: yellow_reasons(d) }
      end
      if orange?(d)
        return { priority: "orange", reasons: orange_reasons(d) }
      end

      { priority: "green", reasons: ["Критериев для более высокого приоритета не выявлено"] }
    end

    private

    def normalize(data)
      src = data.is_a?(Hash) ? data.stringify_keys : {}
      legacy_skin = src["skin_finding"].to_s

      skin_color = src["skin_color"].to_s.presence
      if skin_color.blank? && legacy_skin.present? && !%w[rash edema].include?(legacy_skin)
        skin_color = legacy_skin
      end
      skin_color = "normal_color" if skin_color.blank?

      has_rash = truthy?(src["has_rash"]) || legacy_skin == "rash"
      has_edema = truthy?(src["has_edema"]) || legacy_skin == "edema"

      {
        discharge: src["discharge"].to_s,
        fetal_heart_rate: src["fetal_heart_rate"].to_s,
        uterine_tone: src["uterine_tone"].to_s,
        pain_vas: src["pain_vas"].to_i,
        skin_color: skin_color,
        has_rash: has_rash,
        has_edema: has_edema,
        vitals: src["vitals"] || {}
      }
    end

    def truthy?(val)
      val == true || val.to_s == "true" || val == "1" || val == 1
    end

    def option_label(options, key)
      options.find { |o| o[:key] == key.to_s }&.dig(:label) || key.to_s
    end

    def red?(d)
      red_reasons(d).any?
    end

    def red_reasons(d)
      reasons = []
      if d[:discharge] == "heavy_bleeding"
        reasons << option_label(DISCHARGE_OPTIONS, "heavy_bleeding")
      end
      if %w[absent bradycardia tachycardia].include?(d[:fetal_heart_rate])
        reasons << option_label(FETAL_HEART_RATE_OPTIONS, d[:fetal_heart_rate])
      end
      if d[:uterine_tone] == "elevated" && d[:pain_vas] >= 7
        reasons << "Повышенный маточный тонус и боль по ВАШ ≥ 7"
      end
      if d[:skin_color] == "cyanotic"
        reasons << option_label(SKIN_COLOR_OPTIONS, "cyanotic")
      end
      reasons
    end

    def grey?(d)
      grey_reasons(d).any?
    end

    def grey_reasons(d)
      return [] unless d[:discharge] == "suspected_liquor"

      [option_label(DISCHARGE_OPTIONS, "suspected_liquor")]
    end

    def yellow?(d)
      yellow_reasons(d).any?
    end

    def yellow_reasons(d)
      reasons = []
      if %w[moderate_bleeding amniotic_waters].include?(d[:discharge])
        reasons << option_label(DISCHARGE_OPTIONS, d[:discharge])
      end
      if d[:fetal_heart_rate] == "not_assessed"
        reasons << option_label(FETAL_HEART_RATE_OPTIONS, "not_assessed")
      end
      if d[:uterine_tone] == "elevated"
        reasons << option_label(UTERINE_TONE_OPTIONS, "elevated")
      end
      if d[:uterine_tone] == "labor_irregular"
        reasons << option_label(UTERINE_TONE_OPTIONS, "labor_irregular")
      end
      if d[:pain_vas].between?(4, 6)
        reasons << "Боль по ВАШ #{d[:pain_vas]} (4–6)"
      end
      if %w[pale jaundiced].include?(d[:skin_color])
        reasons << option_label(SKIN_COLOR_OPTIONS, d[:skin_color])
      end
      reasons << "Наличие сыпи" if d[:has_rash]
      reasons << "Наличие отёков" if d[:has_edema]
      reasons.concat(vital_yellow_reasons(d[:vitals]))
      reasons
    end

    def orange?(d)
      orange_reasons(d).any?
    end

    def orange_reasons(d)
      return [] unless d[:uterine_tone] == "labor_regular"

      [option_label(UTERINE_TONE_OPTIONS, "labor_regular")]
    end

    def vital_yellow?(vitals)
      vital_yellow_reasons(vitals).any?
    end

    def vital_yellow_reasons(vitals)
      return [] unless vitals.is_a?(Hash)

      reasons = []
      rr = vitals["respiratory_rate"].to_i
      sat = vitals["saturation"].to_i
      sbp = vitals["systolic_bp"].to_i
      dbp = vitals["diastolic_bp"].to_i
      hr = vitals["heart_rate"].to_i

      reasons << "ЧД вне нормы (#{rr})" if rr > 0 && (rr > 24 || rr < 16)
      reasons << "Сатурация < 93% (#{sat}%)" if sat > 0 && sat < 93
      reasons << "Систолическое АД ≥ 140 (#{sbp})" if sbp >= 140
      reasons << "Диастолическое АД ≥ 90 (#{dbp})" if dbp >= 90
      reasons << "ЧСС вне нормы (#{hr})" if hr > 0 && (hr > 110 || hr < 50)
      reasons
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
      { key: "s2_red_stabilize", text: "Немедленная стабилизация состояния", recommendation: true },
      { key: "s2_red_or", text: "Подготовка к экстренному родоразрешению / операции", recommendation: true },
      { key: "s2_red_anesthesia", text: "Вызов анестезиолога-реаниматолога", recommendation: true },
      { key: "s2_red_monitor", text: "Непрерывный мониторинг плода и матери", recommendation: true },
      { key: "s2_red_exit", text: "Госпитализация: операционная / родовый блок", final: true, final_always_available: true }
    ].freeze

    YELLOW_ACTIONS = [
      { key: "s2_yellow_exam", text: "Расширенное обследование (КТГ, УЗИ, анализы)", recommendation: true },
      { key: "s2_yellow_consult", text: "Консультация акушера-гинеколога", recommendation: true },
      { key: "s2_yellow_pit", text: "Подготовка к госпитализации в ПИТ", recommendation: true },
      { key: "s2_yellow_vitals", text: "Контроль витальных функций", recommendation: true },
      { key: "s2_yellow_exit", text: "Госпитализация: ПИТ", final: true, final_always_available: true }
    ].freeze

    ORANGE_ACTIONS = [
      { key: "s2_orange_observe", text: "Наблюдение в родовом отделении", recommendation: true },
      { key: "s2_orange_ctg", text: "КТГ / мониторинг плода", recommendation: true },
      { key: "s2_orange_docs", text: "Оформление документации", recommendation: true },
      { key: "s2_orange_exit", text: "Госпитализация: родовое отделение", final: true, final_always_available: true }
    ].freeze

    GREY_ACTIONS = [
      { key: "s2_grey_prepare", text: "Подготовка к госпитализации в профильное учреждение", recommendation: true },
      { key: "s2_grey_docs", text: "Оформление сопроводительной документации", recommendation: true },
      { key: "s2_grey_notify", text: "Уведомление принимающей стороны", recommendation: true },
      { key: "s2_grey_exit", text: "Госпитализация: профильное учреждение", final: true, final_always_available: true }
    ].freeze

    GREEN_ACTIONS = [
      { key: "s2_green_exam", text: "Плановое обследование", recommendation: true },
      { key: "s2_green_consult", text: "Консультация врача", recommendation: true },
      { key: "s2_green_admit", text: "Подготовка к госпитализации", recommendation: true },
      { key: "s2_green_exit", text: "Госпитализация: отделение патологии", final: true, final_always_available: true },
      { key: "s2_green_no_admission", text: "Нет показаний к госпитализации", final: true, final_always_available: true }
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
