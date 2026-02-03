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
    STEPS[step] ? STEPS[step][:name] : "Этап #{step}"
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
  
  def check_step1_priority
    # Правила для этапа 1
    if total_consciousness_score <= 8
      self.priority = 'red'
      self.completed_at = Time.now
      self.timer_active = false
      return true
    end
    false
  end
  
  def check_step2_priority
    position = step2_data['position']
    urgency_criteria = step2_data['urgency_criteria'] || []
    infection_signs = step2_data['infection_signs'] || []
    
    # Если не активное положение ИЛИ есть критерии неотложности -> желтый
    if position != 'активное положение, свободное перемещение' || 
       (urgency_criteria.is_a?(Array) && urgency_criteria.any? { |c| c == 'true' })
      self.priority = 'yellow'
      self.completed_at = Time.now
      self.timer_active = false
      return true
    end
    
    # Если активное положение, нет критериев неотложности, но есть признаки инфекции -> фиолетовый
    if position == 'активное положение, свободное перемещение' &&
       (!urgency_criteria.is_a?(Array) || urgency_criteria.all? { |c| c != 'true' }) &&
       infection_signs.is_a?(Array) && infection_signs.any? { |c| c == 'true' }
      self.priority = 'purple'
      self.completed_at = Time.now
      self.timer_active = false
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
    
    self.completed_at = Time.now
    self.timer_active = false
    true
  end
  
  def advance_step
    return false if completed_at
    
    case step
    when 1
      if check_step1_priority
        save
        return 'priority_assigned'
      else
        self.step = 2
        self.start_time = Time.now
        save
        return 'step_advanced'
      end
    when 2
      if check_step2_priority
        save
        return 'priority_assigned'
      else
        self.step = 3
        self.start_time = Time.now
        save
        return 'step_advanced'
      end
    when 3
      check_step3_priority
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
end