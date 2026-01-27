# models/priority_rule.rb
class PriorityRule < ActiveRecord::Base
  # Структура для хранения условий
  # Можно хранить в JSON или YAML, но для простоты сделаем таблицу
  
  validates :name, presence: true
  validates :step, presence: true
  validates :condition_type, presence: true
  
  # Типы условий
  CONDITION_TYPES = ['score_threshold', 'checkbox_group', 'radio_selection', 'vital_signs'].freeze
  
  # Приоритеты
  PRIORITIES = {
    'red' => 'красный',
    'yellow' => 'желтый', 
    'purple' => 'фиолетовый',
    'green' => 'зеленый'
  }.freeze
  
  # Сериализация условий
  serialize :conditions
  serialize :actions
  
  # Метод для проверки условий
  def matches?(triage_data)
    case condition_type
    when 'score_threshold'
      check_score_threshold(triage_data)
    when 'checkbox_group'
      check_checkbox_group(triage_data)
    when 'radio_selection'
      check_radio_selection(triage_data)
    when 'vital_signs'
      check_vital_signs(triage_data)
    else
      false
    end
  end
  
  private
  
  def check_score_threshold(data)
    total_score = data[:eye_score].to_i + data[:verbal_score].to_i + data[:motor_score].to_i
    threshold = conditions['threshold'].to_i
    operator = conditions['operator'] || '<='
    
    case operator
    when '<='
      total_score <= threshold
    when '<'
      total_score < threshold
    when '>='
      total_score >= threshold
    when '>'
      total_score > threshold
    when '=='
      total_score == threshold
    else
      total_score <= threshold
    end
  end
  
  def check_checkbox_group(data)
    field_name = conditions['field']
    required_count = conditions['required_count'].to_i
    checkboxes = data[field_name.to_sym] || []
    
    return false unless checkboxes.is_a?(Array)
    
    true_count = checkboxes.count { |item| item == 'true' || item == true }
    operator = conditions['operator'] || '>='
    
    case operator
    when '>='
      true_count >= required_count
    when '>'
      true_count > required_count
    when '=='
      true_count == required_count
    else
      true_count >= required_count
    end
  end
  
  def check_radio_selection(data)
    field_name = conditions['field']
    expected_value = conditions['expected_value']
    
    data[field_name.to_sym] == expected_value
  end
  
  def check_vital_signs(data)
    vital_field = conditions['field']
    value = data[vital_field.to_sym].to_f
    
    min = conditions['min']
    max = conditions['max']
    operator = conditions['operator']
    
    case operator
    when '>'
      value > conditions['threshold'].to_f
    when '>='
      value >= conditions['threshold'].to_f
    when '<'
      value < conditions['threshold'].to_f
    when '<='
      value <= conditions['threshold'].to_f
    when 'between'
      min && max && value >= min.to_f && value <= max.to_f
    when 'outside'
      min && max && (value < min.to_f || value > max.to_f)
    else
      false
    end
  end
end