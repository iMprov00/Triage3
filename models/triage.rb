class Triage < ActiveRecord::Base
  belongs_to :patient
  
  validates :patient_id, presence: true
  
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
  
  # Сериализация данных этапов
  serialize :step1_data
  serialize :step2_data
  serialize :step3_data
  serialize :actions_data
  
  # Действия для красного приоритета (в порядке выполнения)
  RED_PRIORITY_ACTIONS = [
    { key: 'emergency_button', text: 'Нажата кнопка экстренного вызова' },
    { key: 'brigade_called', text: 'Вызвана бригада экстренной помощи', starts_timer: true, timer_minutes: 12 },
    { key: 'patient_prepared', text: 'Пациентка уложена на каталку, твердую поверхность и снята верхняя одежда' },
    { key: 'help_provided', text: 'Оказана помощь по алгоритму до прибытия бригады' },
    { key: 'delivered_to_or', text: 'Пациентка доставлена в операционную', final: true }
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

  # Судороги и/или активное кровотечение → красный независимо от суммы баллов
  def step1_red_from_seizures_or_bleeding?
    s1 = step1_data || {}
    truthy_step1_flag?(s1['seizures']) || truthy_step1_flag?(s1['active_bleeding'])
  end

  def check_step1_priority
    if step1_red_from_seizures_or_bleeding?
      self.priority = 'red'
      return true
    end
    # Баллы сознания <= 8 -> красный приоритет
    if total_consciousness_score <= 8
      self.priority = 'red'
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
    position = step2_data['position']
    urgency_criteria = step2_data['urgency_criteria'] || []
    infection_signs = step2_data['infection_signs'] || []
    
    # Если не активное положение ИЛИ есть критерии неотложности -> желтый
    if position != 'активное положение, свободное перемещение' ||
       any_urgency_criteria_selected?(urgency_criteria)
      self.priority = 'yellow'
      return true
    end
    
    # Если активное положение, нет критериев неотложности, но есть признаки инфекции -> фиолетовый
    if position == 'активное положение, свободное перемещение' &&
       !any_urgency_criteria_selected?(urgency_criteria) &&
       any_infection_signs_selected?(infection_signs)
      self.priority = 'purple'
      return true
    end
    
    false
  end
  
  def check_step3_priority
    vitals = step3_data || {}
    
    # Проверка витальных функций
    respiratory_rate = vitals['respiratory_rate'].to_i
    saturation = vitals['saturation'].to_i
    systolic_bp = vitals['systolic_bp'].to_i
    diastolic_bp = vitals['diastolic_bp'].to_i
    heart_rate = vitals['heart_rate'].to_i
    temperature = vitals['temperature'].to_f
    
    # Желтые условия
    yellow_conditions = []
    yellow_conditions << :respiratory_rate if respiratory_rate > 24 || respiratory_rate < 16
    yellow_conditions << :saturation if saturation < 93
    yellow_conditions << :systolic_bp if systolic_bp >= 140
    yellow_conditions << :diastolic_bp if diastolic_bp >= 90
    yellow_conditions << :heart_rate if heart_rate > 110 || heart_rate < 50
    
    # Фиолетовые условия
    purple_conditions = []
    purple_conditions << :temperature if temperature >= 37.5
    
    if yellow_conditions.any?
      self.priority = 'yellow'
    elsif purple_conditions.any?
      self.priority = 'purple'
    else
      self.priority = 'green'
    end
    
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
    update(
      actions_started_at: Time.now,
      actions_data: {}
    )
  end
  
  # Отметить действие как выполненное
  def mark_action!(action_key)
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
    final_action = priority_actions.find { |a| a[:final] }
    return false unless final_action
    return false unless can_complete_final_action? && action_completed?(final_action[:key])
    update(actions_completed_at: Time.now)
  end
  
  # Действия завершены?
  def actions_completed?
    actions_completed_at.present?
  end
  
  # Получить список действий для текущего приоритета
  def priority_actions
    case priority
    when 'red' then RED_PRIORITY_ACTIONS
    when 'yellow' then YELLOW_PRIORITY_ACTIONS
    when 'purple' then PURPLE_PRIORITY_ACTIONS
    when 'green' then GREEN_PRIORITY_ACTIONS
    else []
    end
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
        'breathing' => (p[:breathing] || p['breathing']) == 'true',
        'heartbeat' => (p[:heartbeat] || p['heartbeat']) == 'true',
        'seizures' => (p[:seizures] || p['seizures']) == 'true',
        'active_bleeding' => (p[:active_bleeding] || p['active_bleeding']) == 'true'
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