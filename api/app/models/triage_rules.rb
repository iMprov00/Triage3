module TriageRules
  # Базовый контракт стратегии определения приоритета.
  class PriorityStrategy
    def evaluate_step1(_triage)
      nil
    end

    def evaluate_step2(_triage)
      nil
    end

    def evaluate_step3(_triage)
      'green'
    end

    def step1_data_implies_red_priority?(_step1_data)
      false
    end

    def step1_data_implies_red_arrest?(_step1_data)
      false
    end
  end

  # Текущая бизнес-логика (без изменений поведения).
  class DefaultPriorityStrategy < PriorityStrategy
    def evaluate_step1(triage)
      step1_data_implies_red_priority?(triage.step1_data) ? 'red' : nil
    end

    def evaluate_step2(triage)
      step2 = triage.step2_data || {}
      position = step2['position']
      urgency = step2['urgency_criteria'] || []
      infection = step2['infection_signs'] || []

      if position != 'активное положение, свободное перемещение' ||
         triage.any_urgency_criteria_selected?(urgency)
        return 'yellow'
      end

      if position == 'активное положение, свободное перемещение' &&
         !triage.any_urgency_criteria_selected?(urgency) &&
         triage.any_infection_signs_selected?(infection)
        return 'purple'
      end

      nil
    end

    def evaluate_step3(triage)
      vitals = triage.step3_data || {}

      respiratory_rate = vitals['respiratory_rate'].to_i
      saturation = vitals['saturation'].to_i
      systolic_bp = vitals['systolic_bp'].to_i
      diastolic_bp = vitals['diastolic_bp'].to_i
      heart_rate = vitals['heart_rate'].to_i
      temperature = vitals['temperature'].to_f

      yellow_conditions = []
      yellow_conditions << :respiratory_rate if respiratory_rate > 24 || respiratory_rate < 16
      yellow_conditions << :saturation if saturation < 93
      yellow_conditions << :systolic_bp if systolic_bp >= 140
      yellow_conditions << :diastolic_bp if diastolic_bp >= 90
      yellow_conditions << :heart_rate if heart_rate > 110 || heart_rate < 50

      purple_conditions = []
      purple_conditions << :temperature if temperature >= 37.5

      return 'yellow' if yellow_conditions.any?
      return 'purple' if purple_conditions.any?

      'green'
    end

    def step1_data_implies_red_priority?(step1_data)
      s1 = step1_data || {}
      return true if truthy?(s1['seizures'])
      return true if truthy?(s1['active_bleeding'])
      return true if explicitly_no?(s1['breathing']) || explicitly_no?(s1['heartbeat'])

      eye = Triage::EYE_OPENING_SCORES[s1['eye_opening']] || 0
      verbal = Triage::VERBAL_SCORES[s1['verbal_response']] || 0
      motor = Triage::MOTOR_SCORES[s1['motor_response']] || 0
      (eye + verbal + motor) <= 8
    end

    def step1_data_implies_red_arrest?(step1_data)
      s1 = step1_data || {}
      explicitly_no?(s1['breathing']) || explicitly_no?(s1['heartbeat'])
    end

    private

    def truthy?(value)
      value == true || value.to_s == 'true'
    end

    def explicitly_no?(value)
      value == false || value.to_s == 'false'
    end
  end

  # Базовый контракт каталога действий.
  class ActionsCatalog
    def actions_for(priority:, triage: nil)
      _ = triage
      _ = priority
      []
    end

    def action_text_for_key(key)
      key.to_s
    end
  end

  # Текущий каталог действий (без изменения данных и порядка).
  class DefaultActionsCatalog < ActionsCatalog
    def actions_for(priority:, triage: nil)
      _ = triage
      case priority.to_s
      when 'red' then Triage::RED_PRIORITY_ACTIONS
      when 'yellow' then Triage::YELLOW_PRIORITY_ACTIONS
      when 'purple' then Triage::PURPLE_PRIORITY_ACTIONS
      when 'green' then Triage::GREEN_PRIORITY_ACTIONS
      else []
      end
    end

    def action_text_for_key(key)
      return '' if key.blank?

      k = key.to_s
      return 'Красный (остановка): бригада вызвана' if k == 'ra_brigade_called'
      return 'Красный (остановка): значение АД зафиксировано' if k == 'ra_vital_bp'
      return 'Красный (остановка): значение пульса зафиксировано' if k == 'ra_vital_pulse'
      return 'Красный (остановка): значение сатурации зафиксировано' if k == 'ra_vital_saturation'
      return 'Красный (остановка): значение АД (замер 1) зафиксировано' if k == 'ra_vital_bp_1'
      return 'Красный (остановка): значение АД (замер 2) зафиксировано' if k == 'ra_vital_bp_2'
      return 'Красный (остановка): значение АД (замер 3) зафиксировано' if k == 'ra_vital_bp_3'
      return 'Красный (остановка): значение пульса (замер 1) зафиксировано' if k == 'ra_vital_pulse_1'
      return 'Красный (остановка): значение пульса (замер 2) зафиксировано' if k == 'ra_vital_pulse_2'
      return 'Красный (остановка): значение пульса (замер 3) зафиксировано' if k == 'ra_vital_pulse_3'
      return 'Красный (остановка): значение сатурации (замер 1) зафиксировано' if k == 'ra_vital_saturation_1'
      return 'Красный (остановка): значение сатурации (замер 2) зафиксировано' if k == 'ra_vital_saturation_2'
      return 'Красный (остановка): значение сатурации (замер 3) зафиксировано' if k == 'ra_vital_saturation_3'

      Triage::RED_ARREST_TEAM.each do |entry|
        return "Красный (остановка): вызов — #{entry[:label]}" if k == "ra_team_#{entry[:key]}"
      end
      Triage::RED_ARREST_MANIPS.each do |entry|
        return "Красный (остановка): манипуляция — #{entry[:label]}" if k == "ra_manip_#{entry[:key]}"
      end
      return 'Красный (остановка): сердцебиение плода — да' if k == 'ra_vital_fetal_heartbeat_yes'
      return 'Красный (остановка): сердцебиение плода — нет' if k == 'ra_vital_fetal_heartbeat_no'
      return 'Красный (остановка): активное кровотечение — да' if k == 'ra_vital_active_bleeding_yes'
      return 'Красный (остановка): активное кровотечение — нет' if k == 'ra_vital_active_bleeding_no'
      return 'Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (1)' if k == 'ra_manip_adrenaline_1'
      return 'Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (2)' if k == 'ra_manip_adrenaline_2'
      return 'Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (3)' if k == 'ra_manip_adrenaline_3'
      return 'Красный (остановка): манипуляция — выполнено кесарево сечение' if k == 'ra_manip_csection_done'
      return 'Красный (остановка): исход СЛР — восстановление сердечной деятельности / завершение СЛР' if k == 'ra_manip_resusc_outcome_recovery'
      return 'Красный (остановка): исход СЛР — смерть' if k == 'ra_manip_resusc_outcome_death'
      return 'Красный (остановка): манипуляция — назначено срочное кесарево сечение' if k == 'ra_manip_urgent_cesarean'
      return 'Красный (остановка): манипуляция — завершить СЛР' if k == 'ra_manip_slr_complete'

      if k.start_with?("red_arrest_")
        return "Красный (остановка): бригада вызвана" if k == "red_arrest_brigade_called"
        Triage::RED_ARREST_TEAM.each do |entry|
          return "Красный (остановка): вызов — #{entry[:label]}" if k == "red_arrest_team_#{entry[:key]}"
        end
        Triage::RED_ARREST_MANIPS.each do |entry|
          return "Красный (остановка): манипуляция — #{entry[:label]}" if k == "red_arrest_manip_#{entry[:key]}"
        end
        return "Красный (остановка): показатель АД (замер 1)" if k == "red_arrest_vital_bp_1"
        return "Красный (остановка): показатель АД (замер 2)" if k == "red_arrest_vital_bp_2"
        return "Красный (остановка): показатель АД (замер 3)" if k == "red_arrest_vital_bp_3"
        return "Красный (остановка): показатель Пульс (замер 1)" if k == "red_arrest_vital_pulse_1"
        return "Красный (остановка): показатель Пульс (замер 2)" if k == "red_arrest_vital_pulse_2"
        return "Красный (остановка): показатель Пульс (замер 3)" if k == "red_arrest_vital_pulse_3"
        return "Красный (остановка): показатель Сатурация (замер 1)" if k == "red_arrest_vital_saturation_1"
        return "Красный (остановка): показатель Сатурация (замер 2)" if k == "red_arrest_vital_saturation_2"
        return "Красный (остановка): показатель Сатурация (замер 3)" if k == "red_arrest_vital_saturation_3"
        return "Красный (остановка): сердцебиение плода — да" if k == "red_arrest_vital_fetal_heartbeat_yes"
        return "Красный (остановка): сердцебиение плода — нет" if k == "red_arrest_vital_fetal_heartbeat_no"
        return "Красный (остановка): активное кровотечение — да" if k == "red_arrest_vital_active_bleeding_yes"
        return "Красный (остановка): активное кровотечение — нет" if k == "red_arrest_vital_active_bleeding_no"
        return "Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (1)" if k == "red_arrest_manip_adrenaline_1"
        return "Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (2)" if k == "red_arrest_manip_adrenaline_2"
        return "Красный (остановка): манипуляция — введение адреналина 0,1% - 1,0 мл в/в (3)" if k == "red_arrest_manip_adrenaline_3"
        return "Красный (остановка): манипуляция — выполнено кесарево сечение" if k == "red_arrest_manip_csection_done"
        return "Красный (остановка): исход СЛР — восстановление сердечной деятельности / завершение СЛР" if k == "red_arrest_manip_resusc_outcome_recovery"
        return "Красный (остановка): исход СЛР — смерть" if k == "red_arrest_manip_resusc_outcome_death"
        return "Красный (остановка): манипуляция — назначено срочное кесарево сечение" if k == "red_arrest_manip_urgent_cesarean"
        return "Красный (остановка): манипуляция — завершить СЛР" if k == "red_arrest_manip_slr_complete"
      end

      {
        'red_seizures' => 'Красный (судороги)',
        'red_bleeding' => 'Красный (кровотечение)'
      }.each do |prefix, title|
        team_const = prefix == 'red_seizures' ? Triage::RED_SEIZURES_TEAM : Triage::RED_BLEEDING_TEAM
        manip_const = prefix == 'red_seizures' ? Triage::RED_SEIZURES_MANIPS : Triage::RED_BLEEDING_MANIPS
        vital_const = prefix == 'red_seizures' ? Triage::RED_SEIZURES_VITALS : Triage::RED_BLEEDING_VITALS

        return "#{title}: бригада вызвана" if k == "#{prefix}_brigade_called"

        team_const.each do |entry|
          return "#{title}: вызов — #{entry[:label]}" if k == "#{prefix}_team_#{entry[:key]}"
        end

        manip_const.each do |entry|
          return "#{title}: манипуляция — #{entry[:label]}" if k == "#{prefix}_manip_#{entry[:key]}"
        end

        vital_const.each do |entry|
          return "#{title}: показатель #{entry[:label]} (замер 1)" if k == "#{prefix}_vital_#{entry[:key]}_1"
          return "#{title}: показатель #{entry[:label]} (замер 2)" if k == "#{prefix}_vital_#{entry[:key]}_2"
          return "#{title}: показатель #{entry[:label]} (замер 3)" if k == "#{prefix}_vital_#{entry[:key]}_3"
          return "#{title}: показатель #{entry[:label]} зафиксирован" if k == "#{prefix}_vital_#{entry[:key]}"
        end
      end

      [Triage::RED_PRIORITY_ACTIONS, Triage::YELLOW_PRIORITY_ACTIONS, Triage::PURPLE_PRIORITY_ACTIONS, Triage::GREEN_PRIORITY_ACTIONS].each do |arr|
        arr.each do |action|
          return action[:text] if action[:key] == k
        end
      end
      k
    end
  end
end
