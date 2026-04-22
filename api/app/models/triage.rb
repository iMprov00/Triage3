class Triage < ApplicationRecord
  include BroadcastsRealtime

  belongs_to :patient
  has_many :triage_audit_events, dependent: :nullify

  validates :patient_id, presence: true

  # JSON: ключи "1","2","3","actions" → id пользователя, выполнившего этап
  
  # Этапы триажа
  STEPS = {
    1 => { name: 'Уровень сознания', duration: 120 },
    2 => { name: 'Двигательные функции и опрос', duration: 300 },
    3 => { name: 'Витальные функции', duration: 600 }
  }.freeze
  
  # Приоритеты
  PRIORITIES = {
    'red' => { name: 'красный', order: 1 },
    'yellow' => { name: 'желтый', order: 2 },
    'purple' => { name: 'фиолетовый', order: 3 },
    'green' => { name: 'зеленый', order: 4 }
  }.freeze
  
  # Сериализация данных этапов (YAML, совместимо с legacy Sinatra)
  serialize :step1_data, coder: YAML
  serialize :step2_data, coder: YAML
  serialize :step3_data, coder: YAML
  serialize :actions_data, coder: YAML
  
  # Действия для красного приоритета (в порядке выполнения) — классический сценарий
  RED_PRIORITY_ACTIONS = [
    { key: 'emergency_button', text: 'Нажата кнопка экстренного вызова' },
    { key: 'brigade_called', text: 'Вызвана бригада экстренной помощи', starts_timer: true, timer_minutes: 12 },
    { key: 'patient_prepared', text: 'Пациентка уложена на каталку, твердую поверхность и снята верхняя одежда' },
    { key: 'help_provided', text: 'Оказана помощь по алгоритму до прибытия бригады' },
    { key: 'delivered_to_or', text: 'Пациентка доставлена в операционную', final: true }
  ].freeze

  # Красный приоритет: нет дыхания и/или нет сердцебиения на шаге 1 — отдельный сценарий (двухколоночный экран)
  RED_ARREST_TEAM = [
    { key: 'midwife_triage', label: 'Акушерка триажного поста' },
    { key: 'procedural_nurse', label: 'Процедурная медсестра' },
    { key: 'obgyn_1', label: 'Акушер-гинеколог №1' },
    { key: 'obgyn_2', label: 'Акушер-гинеколог №2' },
    { key: 'nurse_anesthetist', label: 'Медицинская сестра-анестезист' },
    { key: 'anesthesiologist', label: 'Анестезиолог-реаниматолог' },
    { key: 'pediatric_resus', label: 'Детская реанимация' }
  ].freeze

  RED_ARREST_MANIPS = [
    { key: 'slr_start', label: 'Начало СЛР' },
    { key: 'oxygen_inhalation', label: 'Ингаляция кислорода' },
    { key: 'vein_catheter', label: 'Катетеризация вены' },
    { key: 'transport_or', label: 'Транспортировка в операционную' },
    { key: 'intubation', label: 'Интубация трахеи' },
    { key: 'defibrillator', label: 'Использование дефибриллятора' }
  ].freeze

  RED_ARREST_VITALS = [
    { key: 'bp', label: 'АД' },
    { key: 'pulse', label: 'Пульс' },
    { key: 'saturation', label: 'Сатурация' }
  ].freeze

  RED_SEIZURES_TEAM = [
    { key: 'midwife_triage', label: 'Акушерка триажного поста' },
    { key: 'junior_nurse_triage', label: 'Младшая медсестра триажного поста' },
    { key: 'obgyn', label: 'Акушер-гинеколог' },
    { key: 'anesthesiologist', label: 'Анестезиолог-реаниматолог' },
    { key: 'nurse_anesthetist', label: 'Медицинская сестра-анестезист' },
    { key: 'pediatric_resus', label: 'Детская реанимация' }
  ].freeze

  RED_SEIZURES_MANIPS = [
    { key: 'airway_patency', label: 'Обеспечена проходимость верхних дыхательных путей (открытие рта, выдвижение нижней челюсти, введен ротоглоточный воздуховод)' },
    { key: 'oxygen_inhalation', label: 'Ингаляционное введение кислорода через носовые канюли' },
    { key: 'vein_catheter', label: 'Катетеризация вены' },
    { key: 'magnesium_bolus', label: 'Введение сульфата магния 25%-16,0 в/в болюсно' },
    { key: 'magnesium_infusion', label: 'Введение сульфата магния 25%-4,0 мл/час инфузоматом' },
    { key: 'intubation', label: 'Интубация трахеи' },
    { key: 'fetal_heartbeat_check', label: 'Выслушивание сердцебиения плода фетальным датчиком' },
    { key: 'transport_or', label: 'Транспортировка в операционную' },
    { key: 'lab_material_sampling', label: 'Забор биологического материала на лабораторные исследования (кровь/моча)' },
    { key: 'emergency_c_section', label: 'Выполнено экстренное кесарево' }
  ].freeze

  RED_SEIZURES_VITALS = [
    { key: 'bp', label: 'АД' },
    { key: 'pulse', label: 'ЧСС' },
    { key: 'respiratory_rate', label: 'ЧДД' },
    { key: 'saturation', label: 'SpO2' }
  ].freeze

  RED_BLEEDING_TEAM = [
    { key: 'midwife_triage', label: 'Акушерка триажного поста' },
    { key: 'junior_nurse_triage', label: 'Младшая медицинская сестра триажного поста' },
    { key: 'anesthesiologist', label: 'Анестезиолог-реаниматолог' },
    { key: 'obgyn_po', label: 'Врач-акушер-гинеколог ПО' },
    { key: 'obgyn_2', label: 'Врач акушер-гинеколог №2' },
    { key: 'nurse_anesthetist', label: 'Медицинская сестра-анестезист' },
    { key: 'lab_technician', label: 'Лаборант' },
    { key: 'pediatric_resus', label: 'Детская реанимация' }
  ].freeze

  RED_BLEEDING_MANIPS = [
    { key: 'venous_access_g16', label: 'Обеспечение венозного доступа G16' },
    { key: 'blood_sampling', label: 'Забор крови на анализ' },
    { key: 'crystalloid_bolus_500', label: 'Начато введение кристаллоидного раствора 500 мл в/в струйно' },
    { key: 'second_vein_catheter_g16', label: 'Катетеризация второй вены G16' },
    { key: 'urinary_catheter', label: 'Катетеризация мочевого пузыря' },
    { key: 'humidified_oxygen', label: 'Подача увлажненного кислорода' },
    { key: 'transport_or', label: 'Транспортировка в операционную' },
    { key: 'emergency_c_section', label: 'Экстренное кесарево сечение' }
  ].freeze

  RED_BLEEDING_VITALS = [
    { key: 'bp', label: 'АД' },
    { key: 'pulse', label: 'ЧСС' },
    { key: 'saturation', label: 'SpO2' }
  ].freeze
  
  # Действия для желтого приоритета
  YELLOW_PRIORITY_ACTIONS = [
    { key: 'nurse_called', text: 'Вызвана младшая медсестра триажной палаты', starts_timer: true, timer_minutes: 12 },
    { key: 'delivered_to_triage', text: 'Пациентка доставлена в триажную палату', final: true, final_always_available: true }
  ].freeze

  # Действия для фиолетового приоритета
  PURPLE_PRIORITY_ACTIONS = [
    { key: 'nurse_called', text: 'Вызвана младшая медсестра боксированных палат', starts_timer: true, timer_minutes: 15 },
    { key: 'delivered_to_box', text: 'Пациентка доставлена в боксированную палату', final: true, final_always_available: true }
  ].freeze

  # Действия для зеленого приоритета
  GREEN_PRIORITY_ACTIONS = [
    { key: 'route_explained', text: 'Направляет пациента по маршруту «зеленого потока»', starts_timer: true, timer_minutes: 15 },
    { key: 'in_triage_room', text: 'Пациентка находится в триажной палате', final: true, final_always_available: true }
  ].freeze
  
  # Время на выполнение действий (5 минут)
  ACTIONS_TIME_LIMIT = 300
  
  # Баллы для глаз
  EYE_OPENING_SCORES = {
    'произвольно открывает' => 4,
    'глаза закрыты' => 3,
    'открывает в ответ на голос' => 3,
    'открывает в ответ на болезненную стимуляцию' => 2,
    'глаза закрыты, нет реакции' => 1
  }.freeze
  
  # Баллы для речевых реакций
  VERBAL_SCORES = {
    'четко и своевременно отвечает на вопросы' => 4,
    'плохо ориентируется, речь невнятна' => 3,
    'речь бессвязная, набор слов, общий смысл отсутствует' => 2,
    'не отвечает' => 1
  }.freeze
  
  # Баллы для двигательных реакций
  MOTOR_SCORES = {
    'осуществляет действия по требованию' => 6,
    'отталкивает конечности при болевом раздражении' => 5,
    'конечность дергается при болевом раздражении' => 4,
    'патологический сгибательный рефлекс' => 3,
    'патологический разгибательный рефлекс' => 2,
    'не двигается' => 1
  }.freeze
  
  # Позиции для этапа 2
  POSITIONS = [
    'активное положение, свободное перемещение',
    'использует средства передвижения: костыли, ходунки, каталку',
    'походка шаткая, придерживается за опору, хромает',
    'полусогнутое положение, придерживает живот или поясницу от болевых ощущений'
  ].freeze
  
  # Критерии неотложности
  URGENCY_CRITERIA = [
    'боли в животе, пояснице',
    'головная боль, головокружение',
    'потеря сознания/судороги в течении суток',
    'повышение АД 140/90 и более в течение суток',
    'кровянистые выделения из половых путей в течении суток',
    'отхождение околоплодных вод',
    'сниженное/отсутствие шевеления плода'
  ].freeze
  
  # Признаки инфекционных заболеваний
  INFECTION_SIGNS = [
    'температура тела 37,3 и выше в течении 7 дней',
    'кашель, насморк, боль в горле в настоящее время',
    'рвота, частый жидкий стул в течение 3 дней',
    'контакты с инфекционными больными в течении 7 дней',
    'возникшие в течение 14 дней высыпания на теле',
    'контакт с больными ОРВИ в течение 7 дней',
    'контакт с больными кишечными инфекциями в течении 7 дней'
  ].freeze
  
  after_initialize :set_defaults

  class << self
    attr_writer :priority_strategy, :actions_catalog

    def priority_strategy
      @priority_strategy ||= TriageRules::DefaultPriorityStrategy.new
    end

    def actions_catalog
      @actions_catalog ||= TriageRules::DefaultActionsCatalog.new
    end
  end
  
  def set_defaults
    self.step ||= 1
    self.step1_data ||= {}
    self.step2_data ||= {}
    self.step3_data ||= {}
    self.priority ||= 'pending'
  end
  
  def time_remaining
    return 0 unless timer_active && start_time
    elapsed = Time.now - start_time
    duration = STEPS[step][:duration]
    remaining = duration - elapsed.to_i
    remaining > 0 ? remaining : 0
  end

  # Время окончания таймера (Unix timestamp в секундах) — для клиентского обратного отсчёта в реальном времени
  def timer_ends_at
    return nil unless timer_active && start_time && STEPS[step]
    (start_time + STEPS[step][:duration]).to_i
  end
  
  def expired?
    time_remaining <= 0
  end
  
  def step_name
    STEPS[step] ? STEPS[step][:name] : "Шаг #{step}"
  end
  
  def step_duration
    STEPS[step] ? STEPS[step][:duration] : 120
  end

  # Длительность прохождения шага N по меткам completed_at (секунды), nil если данных нет
  def seconds_elapsed_for_step(step_num)
    case step_num
    when 1
      return nil unless step1_completed_at && created_at

      (step1_completed_at - created_at).to_i
    when 2
      return nil unless step2_completed_at && step1_completed_at

      (step2_completed_at - step1_completed_at).to_i
    when 3
      return nil unless step3_completed_at && step2_completed_at

      (step3_completed_at - step2_completed_at).to_i
    else
      nil
    end
  end

  def self.step_timing_for_step(triage, step_num)
    limit = STEPS[step_num][:duration]
    actual = triage.seconds_elapsed_for_step(step_num)
    {
      limit_seconds: limit,
      seconds_used: actual,
      within_limit: actual.nil? ? nil : (actual <= limit)
    }
  end

  def step_performers_hash
    raw = read_attribute(:step_performers)
    return {} if raw.blank?

    JSON.parse(raw)
  rescue JSON::ParserError
    {}
  end

  def set_step_performer_user!(step_key, user_id)
    h = step_performers_hash
    h[step_key.to_s] = user_id.to_i
    write_attribute(:step_performers, h.to_json)
  end

  def step_performer_user_id(step_key)
    step_performers_hash[step_key.to_s]
  end

  # Текст действия по ключу (для журнала аудита)
  def self.action_text_for_key(key)
    actions_catalog.action_text_for_key(key)
  end

  def self.priority_label_ru(code)
    return '—' if code.blank?
    return 'не определён' if code.to_s == 'pending'

    PRIORITIES[code.to_s] ? PRIORITIES[code.to_s][:name] : code.to_s
  end

  # Строки для страницы статистики: шаги 1–3
  def statistics_step_rows
    (1..3).map do |n|
      lim = STEPS[n][:duration]
      sec = seconds_elapsed_for_step(n)
      {
        step: n,
        name: STEPS[n][:name],
        limit_seconds: lim,
        seconds_used: sec,
        within_limit: sec.nil? ? nil : (sec <= lim)
      }
    end
  end

  # Блок «действия по приоритету» (5 минут)
  def statistics_actions_phase
    return nil unless actions_started_at

    lim = ACTIONS_TIME_LIMIT
    fin = actions_completed_at
    elapsed = if fin
                (fin - actions_started_at).to_i
              else
                (Time.current - actions_started_at).to_i
              end
    {
      limit_seconds: lim,
      seconds_used: elapsed,
      within_limit: fin ? (elapsed <= lim) : nil,
      completed: fin.present?
    }
  end

  # Общее время от создания триажа до завершения (сек)
  def statistics_total_triage_seconds
    return nil unless completed_at && created_at

    (completed_at - created_at).to_i
  end
  
  def priority_name
    PRIORITIES[priority] ? PRIORITIES[priority][:name] : 'не определен'
  end
  
  def eye_score
    eye_text = step1_data['eye_opening']
    EYE_OPENING_SCORES[eye_text] || 0
  end
  
  def verbal_score
    verbal_text = step1_data['verbal_response']
    VERBAL_SCORES[verbal_text] || 0
  end
  
  def motor_score
    motor_text = step1_data['motor_response']
    MOTOR_SCORES[motor_text] || 0
  end
  
  def total_consciousness_score
    eye_score + verbal_score + motor_score
  end
  
  def truthy_step1_flag?(value)
    value == true || value.to_s == 'true'
  end

  def self.step1_explicitly_no?(value)
    value == false || value.to_s == 'false'
  end

  # Красный на шаге 1: судороги / кровотечение / нет дыхания или сердцебиения / сумма баллов ≤ 8
  def self.step1_data_implies_red_priority?(s1)
    priority_strategy.step1_data_implies_red_priority?(s1)
  end

  # Отдельный сценарий действий: на шаге 1 явно «нет дыхания» и/или «нет сердцебиения»
  def self.step1_data_implies_red_arrest?(s1)
    priority_strategy.step1_data_implies_red_arrest?(s1)
  end

  def red_arrest_actions_flow?
    priority.to_s == 'red' && self.class.step1_data_implies_red_arrest?(step1_data)
  end

  def red_seizures_actions_flow?
    actions_flow_kind == 'red_seizures'
  end

  def red_bleeding_actions_flow?
    actions_flow_kind == 'red_bleeding'
  end

  def actions_flow_kind
    return nil unless priority.to_s == 'red'

    s1 = step1_data || {}
    no_breathing_or_heartbeat =
      self.class.step1_explicitly_no?(s1['breathing']) || self.class.step1_explicitly_no?(s1['heartbeat'])
    return 'red_arrest' if no_breathing_or_heartbeat
    return 'red_seizures' if truthy_step1_flag?(s1['seizures'])
    return 'red_bleeding' if truthy_step1_flag?(s1['active_bleeding'])

    nil
  end

  def actions_flow_schema
    case actions_flow_kind
    when 'red_arrest'
      { team: RED_ARREST_TEAM, manips: RED_ARREST_MANIPS, vitals: RED_ARREST_VITALS, bucket: 'red_arrest' }
    when 'red_seizures'
      { team: RED_SEIZURES_TEAM, manips: RED_SEIZURES_MANIPS, vitals: RED_SEIZURES_VITALS, bucket: 'red_seizures' }
    when 'red_bleeding'
      { team: RED_BLEEDING_TEAM, manips: RED_BLEEDING_MANIPS, vitals: RED_BLEEDING_VITALS, bucket: 'red_bleeding' }
    else
      nil
    end
  end

  def check_step1_priority
    next_priority = self.class.priority_strategy.evaluate_step1(self)
    if next_priority.present?
      self.priority = next_priority
      return true
    end
    false
  end

  # Шаг 2: отмеченные чекбоксы хранятся как индексы (строки "0".."n"); legacy — массив "true"
  def any_urgency_criteria_selected?(arr)
    return false unless arr.is_a?(Array)

    arr.any? do |c|
      c == 'true' || (c.to_s =~ /^\d+$/ && (0...URGENCY_CRITERIA.size).cover?(c.to_i))
    end
  end

  def any_infection_signs_selected?(arr)
    return false unless arr.is_a?(Array)

    arr.any? do |c|
      c == 'true' || (c.to_s =~ /^\d+$/ && (0...INFECTION_SIGNS.size).cover?(c.to_i))
    end
  end
  
  def check_step2_priority
    next_priority = self.class.priority_strategy.evaluate_step2(self)
    if next_priority.present?
      self.priority = next_priority
      return true
    end
    false
  end
  
  def check_step3_priority
    self.priority = self.class.priority_strategy.evaluate_step3(self)
    true # Этап 3 всегда определяет приоритет
  end
  
  def advance_step
    return false if completed_at
    
    case step
    when 1
      self.step1_completed_at = Time.now
      if check_step1_priority
        self.completed_at = Time.now
        self.timer_active = false
        self.actions_started_at = Time.now  # Автостарт действий
        save
        return 'priority_assigned'
      else
        self.step = 2
        self.start_time = Time.now
        save
        return 'step_advanced'
      end
    when 2
      self.step2_completed_at = Time.now
      if check_step2_priority
        self.completed_at = Time.now
        self.timer_active = false
        self.actions_started_at = Time.now  # Автостарт действий
        save
        return 'priority_assigned'
      else
        self.step = 3
        self.start_time = Time.now
        save
        return 'step_advanced'
      end
    when 3
      self.step3_completed_at = Time.now
      check_step3_priority
      self.completed_at = Time.now
      self.timer_active = false
      self.actions_started_at = Time.now  # Автостарт действий
      save
      return 'priority_assigned'
    end
  end
  
  def complete_triage
    update(
      timer_active: false,
      completed_at: Time.now
    )
  end
  
  def step_data(step_number)
    case step_number
    when 1 then step1_data || {}
    when 2 then step2_data || {}
    when 3 then step3_data || {}
    else {}
    end
  end
  
  def update_step_data(step_number, data)
    case step_number
    when 1
      self.step1_data = (step1_data || {}).merge(data)
    when 2
      self.step2_data = (step2_data || {}).merge(data)
    when 3
      self.step3_data = (step3_data || {}).merge(data)
    end
  end
  
  # === Методы для действий по приоритету ===
  
  # Начать действия по приоритету
  def start_actions!
    return if actions_started_at
    data = {}
    schema = actions_flow_schema
    if schema
      data[schema[:bucket]] = { 'team' => {}, 'manip' => {}, 'vitals' => {} }
    end
    update(
      actions_started_at: Time.now,
      actions_data: data
    )
  end

  def ensure_actions_flow_bucket!
    schema = actions_flow_schema
    return false unless schema

    self.actions_data ||= {}
    self.actions_data[schema[:bucket]] ||= { 'team' => {}, 'manip' => {}, 'vitals' => {} }
    h = actions_data[schema[:bucket]]
    h['team'] ||= {}
    h['manip'] ||= {}
    h['vitals'] ||= {}
    true
  end

  def actions_flow_data
    schema = actions_flow_schema
    return {} unless schema

    d = actions_data && actions_data[schema[:bucket]]
    d.is_a?(Hash) ? d : {}
  end

  def ensure_red_arrest_bucket!
    ensure_actions_flow_bucket!
  end

  def red_arrest_data
    actions_flow_data
  end

  # @return [Symbol] :ok_new, :ok_already, :invalid
  def mark_red_arrest_brigade!
    return :invalid unless actions_flow_schema
    return :ok_already if brigade_called_at

    return :invalid unless ensure_actions_flow_bucket!
    now = Time.now
    self.brigade_called_at = now
    actions_data[actions_flow_schema[:bucket]]['brigade_called_at'] = now.to_i
    save ? :ok_new : :invalid
  end

  # group: "team" | "manip"
  def toggle_red_arrest_item!(group, key, checked)
    schema = actions_flow_schema
    return false unless schema

    g = group.to_s
    raise ArgumentError, 'group' unless %w[team manip].include?(g)

    k = key.to_s
    allowed_team = schema[:team].map { |e| e[:key].to_s }
    allowed_manip = schema[:manips].map { |e| e[:key].to_s }
    if schema[:bucket] == 'red_arrest'
      allowed_manip += %w[
      adrenaline_1 adrenaline_2 adrenaline_3
      csection_done
      resusc_outcome_recovery
      resusc_outcome_death
      urgent_cesarean
      slr_complete
    ]
    end
    return false if g == 'team' && !allowed_team.include?(k)
    return false if g == 'manip' && !allowed_manip.include?(k)

    return false unless ensure_actions_flow_bucket!
    actions_data[schema[:bucket]][g] ||= {}
    if ActiveModel::Type::Boolean.new.cast(checked)
      # Взаимоисключающие исходы СЛР: при выборе одного автоматически снимаем второй.
      if g == 'manip' && %w[resusc_outcome_recovery resusc_outcome_death].include?(k)
        other = k == 'resusc_outcome_recovery' ? 'resusc_outcome_death' : 'resusc_outcome_recovery'
        actions_data[schema[:bucket]][g].delete(other)
      end
      actions_data[schema[:bucket]][g][key.to_s] = Time.now.to_i
    else
      actions_data[schema[:bucket]][g].delete(key.to_s)
    end
    save
  end

  def set_red_arrest_vital!(vkey, value)
    schema = actions_flow_schema
    return false unless schema

    return false unless ensure_actions_flow_bucket!
    vitals_keys = schema[:vitals].map { |e| e[:key].to_s }
    return false unless vital_allowed_key?(vkey.to_s, vitals_keys)

    vkey = vkey.to_s
    val = value.to_s.strip
    # Поддержка 3 последовательных замеров для AD/пульса/сатурации:
    # ключи приходят как bp_1..bp_3, pulse_1..pulse_3, saturation_1..saturation_3.
    if vkey =~ /\A([a-z_]+)_(1|2|3)\z/
      base = Regexp.last_match(1)
      return false unless vitals_keys.include?(base)
      idx = Regexp.last_match(2).to_i - 1
      entry = actions_data[schema[:bucket]]['vitals'][base]
      values = if entry.is_a?(Hash) && entry['values'].is_a?(Array)
                 entry['values']
               else
                 old_single = entry.is_a?(Hash) ? entry['value'].to_s : ''
                 [old_single, '', '']
               end
      values[idx] = val
      if values.all?(&:blank?)
        actions_data[schema[:bucket]]['vitals'].delete(base)
      else
        actions_data[schema[:bucket]]['vitals'][base] = { 'values' => values, 'at' => Time.now.to_i }
      end
      return save
    end

    return false unless vitals_keys.include?(vkey)

    actions_data[schema[:bucket]]['vitals'] ||= {}
    if val.empty?
      actions_data[schema[:bucket]]['vitals'].delete(vkey)
    else
      actions_data[schema[:bucket]]['vitals'][vkey] = { 'value' => val, 'at' => Time.now.to_i }
    end
    save
  end

  def vital_allowed_key?(key, allowed_base_keys)
    return true if allowed_base_keys.include?(key)
    return false unless key =~ /\A([a-z_]+)_(1|2|3)\z/

    allowed_base_keys.include?(Regexp.last_match(1))
  end

  def can_complete_red_arrest?
    return false unless actions_flow_kind == 'red_arrest'
    return false unless brigade_called_at

    manip = actions_flow_data['manip'] || {}
    manip['csection_done'].present? ||
      manip['resusc_outcome_recovery'].present? ||
      manip['resusc_outcome_death'].present? ||
      manip['urgent_cesarean'].present? ||
      manip['slr_complete'].present?
  end

  def can_complete_actions_flow?
    kind = actions_flow_kind
    return false unless kind
    return can_complete_red_arrest? if kind == 'red_arrest'

    true
  end

  def red_arrest_actions_progress_for_monitor
    schema = actions_flow_schema
    return { completed: 0, total: 0 } unless schema

    ra = actions_flow_data
    team_n = (ra['team'] || {}).size
    manip_n = (ra['manip'] || {}).size
    vit_n = (ra['vitals'] || {}).sum do |_, d|
      if d.is_a?(Hash) && d['values'].is_a?(Array)
        d['values'].count { |v| v.present? }
      elsif d.is_a?(Hash) && d['value'].present?
        1
      else
        0
      end
    end
    done = (brigade_called_at ? 1 : 0) + team_n + manip_n + vit_n
    total = 1 + schema[:team].size + schema[:manips].size + (schema[:vitals].size * 3)
    total += 7 if schema[:bucket] == 'red_arrest'
    { completed: done, total: total }
  end
  
  # Отметить действие как выполненное
  def mark_action!(action_key)
    return false if actions_flow_kind.present?

    self.actions_data ||= {}
    return if actions_data[action_key]
    
    actions_data[action_key] = Time.now.to_i
    
    # Проверяем, запускает ли это действие таймер
    action = priority_actions.find { |a| a[:key] == action_key }
    if action && action[:starts_timer] && !brigade_called_at
      self.brigade_called_at = Time.now
    end
    
    save
  end
  
  # Снять отметку с действия
  def unmark_action!(action_key)
    return false if actions_flow_kind.present?

    self.actions_data ||= {}
    actions_data.delete(action_key)
    
    # Проверяем, был ли это таймер
    action = priority_actions.find { |a| a[:key] == action_key }
    if action && action[:starts_timer]
      self.brigade_called_at = nil
    end
    
    save
  end
  
  # Проверить, выполнено ли действие
  def action_completed?(action_key)
    actions_data && actions_data[action_key].present?
  end
  
  # Проверить, можно ли отметить финальное действие
  def can_complete_final_action?
    return false unless actions_data

    final_def = priority_actions.find { |a| a[:final] }
    return true if final_def && final_def[:final_always_available]

    required_actions = priority_actions.reject { |a| a[:final] }
    required_actions.all? { |a| actions_data[a[:key]].present? }
  end
  
  # Завершить все действия
  def complete_actions!
    if actions_flow_kind.present?
      return false unless can_complete_actions_flow?
      update(actions_completed_at: Time.now)
      return true
    end

    final_action = priority_actions.find { |a| a[:final] }
    return false unless final_action
    return false unless can_complete_final_action? && action_completed?(final_action[:key])
    update(actions_completed_at: Time.now)
    true
  end
  
  # Действия завершены?
  def actions_completed?
    actions_completed_at.present?
  end
  
  # Получить список действий для текущего приоритета
  def priority_actions
    self.class.actions_catalog.actions_for(priority: priority, triage: self)
  end
  
  # Получить финальное действие для приоритета
  def final_action
    priority_actions.find { |a| a[:final] }
  end
  
  # Получить действие с таймером
  def timer_action
    priority_actions.find { |a| a[:starts_timer] }
  end
  
  # Оставшееся время на действия (5 минут)
  def actions_time_remaining
    return 0 unless actions_started_at
    elapsed = Time.now - actions_started_at
    [ACTIONS_TIME_LIMIT - elapsed.to_i, 0].max
  end
  
  # Таймер действий истёк?
  def actions_time_expired?
    actions_started_at && actions_time_remaining <= 0
  end
  
  # Время окончания таймера действий (Unix timestamp)
  def actions_timer_ends_at
    return nil unless actions_started_at
    actions_started_at.to_i + ACTIONS_TIME_LIMIT
  end
  
  # Время таймера для текущего приоритета (в секундах)
  def brigade_time_limit
    action = timer_action
    return 720 unless action # по умолчанию 12 минут
    (action[:timer_minutes] || 12) * 60
  end
  
  # Оставшееся время до прибытия бригады/медсестры
  def brigade_time_remaining
    return nil unless brigade_called_at
    elapsed = Time.now - brigade_called_at
    [brigade_time_limit - elapsed.to_i, 0].max
  end
  
  # Время окончания таймера бригады (Unix timestamp)
  def brigade_timer_ends_at
    return nil unless brigade_called_at
    brigade_called_at.to_i + brigade_time_limit
  end
  
  # Название таймера для UI
  def brigade_timer_label
    action = timer_action
    return 'Время прибытия' unless action
    
    minutes = action[:timer_minutes] || 12
    case priority
    when 'red' then "Время прибытия бригады (#{minutes} мин)"
    when 'yellow' then "Время прибытия медсестры (#{minutes} мин)"
    when 'purple' then "Время прибытия медсестры (#{minutes} мин)"
    when 'green' then "Время ожидания (#{minutes} мин)"
    else "Таймер (#{minutes} мин)"
    end
  end

  # Копия для расчёта предпросмотра без сохранения в БД
  def duplicate_for_preview
    d = dup
    %w[step1_data step2_data step3_data actions_data].each do |col|
      val = send(col)
      next if val.nil?

      d.send("#{col}=", Marshal.load(Marshal.dump(val)))
    end
    d
  end

  # Параметр из формы (строка "true") или из JSON API (boolean true)
  def param_bool(value)
    value == true || value.to_s == "true"
  end

  # Та же логика, что в post /triage/update_step/:step (без save)
  def apply_update_step!(step_num, params)
    old_p = normalized_priority_key(priority)
    old_start_time = start_time
    old_actions_started_at = actions_started_at
    old_brigade_called_at = brigade_called_at

    p = params
    case step_num
    when 1
      step_data = {
        'eye_opening' => p[:eye_opening] || p['eye_opening'],
        'verbal_response' => p[:verbal_response] || p['verbal_response'],
        'motor_response' => p[:motor_response] || p['motor_response'],
        'breathing' => param_bool(p[:breathing] || p["breathing"]),
        'heartbeat' => param_bool(p[:heartbeat] || p["heartbeat"]),
        'seizures' => param_bool(p[:seizures] || p["seizures"]),
        'active_bleeding' => param_bool(p[:active_bleeding] || p["active_bleeding"])
      }

      update_step_data(1, step_data)
      self.step1_completed_at = Time.now

      if check_step1_priority
        self.step2_data = {}
        self.step3_data = {}
        self.step2_completed_at = nil
        self.step3_completed_at = nil
        self.step = 1
        self.completed_at = Time.now
        self.timer_active = false
        self.actions_started_at = Time.now
      else
        self.step = 2
        self.priority = 'pending'
        self.completed_at = nil
        self.timer_active = true
        self.start_time = Time.now
        self.actions_started_at = nil
        self.actions_data = nil
        self.brigade_called_at = nil
        self.actions_completed_at = nil
      end

    when 2
      uc = p[:urgency_criteria] || p['urgency_criteria']
      inf = p[:infection_signs] || p['infection_signs']
      step_data = {
        'position' => p[:position] || p['position'],
        'urgency_criteria' => uc.nil? ? [] : Array(uc),
        'infection_signs' => inf.nil? ? [] : Array(inf)
      }

      update_step_data(2, step_data)
      self.step2_completed_at = Time.now

      if check_step2_priority
        self.step3_data = {}
        self.step3_completed_at = nil
        self.step = 2
        self.completed_at = Time.now
        self.timer_active = false
        self.actions_started_at = Time.now
      else
        self.step = 3
        self.priority = 'pending'
        self.completed_at = nil
        self.timer_active = true
        self.start_time = Time.now
        self.actions_started_at = nil
        self.actions_data = nil
        self.brigade_called_at = nil
        self.actions_completed_at = nil
      end

    when 3
      step_data = {
        'respiratory_rate' => p[:respiratory_rate] || p['respiratory_rate'],
        'saturation' => p[:saturation] || p['saturation'],
        'systolic_bp' => p[:systolic_bp] || p['systolic_bp'],
        'diastolic_bp' => p[:diastolic_bp] || p['diastolic_bp'],
        'heart_rate' => p[:heart_rate] || p['heart_rate'],
        'temperature' => p[:temperature] || p['temperature']
      }

      update_step_data(3, step_data)
      self.step3_completed_at = Time.now
      check_step3_priority
      self.completed_at = Time.now
      self.timer_active = false
      self.actions_started_at = Time.now
    end

    # При неизменном приоритете не сбрасываем таймеры шага и действий (и таймер вызова бригады/медсестры)
    if old_p == normalized_priority_key(priority)
      self.start_time = old_start_time
      self.actions_started_at = old_actions_started_at
      self.brigade_called_at = old_brigade_called_at
    end

    self
  end

  def normalized_priority_key(value)
    s = value.to_s.strip
    s.empty? ? 'pending' : s
  end

  def preview_priority_label(p)
    PRIORITIES[p] ? PRIORITIES[p][:name] : 'не определён'
  end

  # Результат для модального окна перед сохранением правок шага
  def preview_step_update(step_num, params)
    t = duplicate_for_preview
    old_priority = priority
    old_label = preview_priority_label(old_priority)
    t.apply_update_step!(step_num, params)
    new_priority = t.priority
    new_label = preview_priority_label(new_priority)
    priority_changed = old_priority.to_s != new_priority.to_s
    {
      priority_changed: priority_changed,
      current_priority: old_priority,
      current_priority_label: old_label,
      new_priority: new_priority,
      new_priority_label: new_label
    }
  end
end