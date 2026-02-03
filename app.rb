require 'sinatra'
require 'sinatra/activerecord'
require 'sinatra/reloader' if development?
require 'sinatra/flash'
require 'json'
require 'sprockets'
require 'sprockets-helpers'
require 'bootstrap'
require 'securerandom'

# Часовой пояс Новосибирска (UTC+7)
NOVOSIBIRSK_OFFSET = 7 * 3600  # 7 часов в секундах

# Хелпер для получения текущего времени в Новосибирске
def novosibirsk_now
  Time.now.utc + NOVOSIBIRSK_OFFSET
end

# Хелпер для форматирования времени в Новосибирске
def format_time_nsk(time, format = "%d.%m.%Y %H:%M:%S")
  return nil unless time
  (time.utc + NOVOSIBIRSK_OFFSET).strftime(format)
end

# Конфигурация
configure do
  set :database, {adapter: 'sqlite3', database: 'hospital.db'}
  set :sessions, true
  set :server, :puma
  
  # Автоматическая загрузка моделей
  Dir[File.join(File.dirname(__FILE__), 'models', '*.rb')].each do |file|
    require file
  end
end

# Подключение ассетов
Sprockets::Helpers.configure do |config|
  config.environment = Sprockets::Environment.new
  config.environment.append_path 'assets/stylesheets'
  config.environment.append_path 'assets/javascripts'
  config.environment.append_path 'assets/images'
  config.digest = false
  config.prefix = '/assets'
end

register Sinatra::Flash
helpers Sprockets::Helpers

# Хелперы для представлений
helpers do
  def format_nsk(time, format = "%d.%m.%Y %H:%M:%S")
    return nil unless time
    (time.utc + NOVOSIBIRSK_OFFSET).strftime(format)
  end
end

# Хранилище для SSE соединений
TRIAGE_CONNECTIONS = []
MONITOR_CONNECTIONS = []

# Главная страница
get '/' do
  redirect '/patients'
end

# API списка пациентов (JSON, для обновления в реальном времени)
get '/api/patients_list' do
  content_type :json
  base = Patient.includes(:triage)
  base = base.search(params[:search]) if params[:search].present?
  base = apply_filters(base, params)
  active_in_triage = base.joins(:triage).where(triages: { timer_active: true })
                         .order(admission_date: :desc, admission_time: :desc)
  ids_active = active_in_triage.pluck(:id)
  rest = base.where.not(id: ids_active).order(admission_date: :desc, admission_time: :desc).limit(100)
  patients = active_in_triage.to_a + rest.to_a
  patients.map do |p|
    t = p.triage
    max_time = t ? (case t.step when 1 then 120 when 2 then 300 when 3 then 600 else 120 end) : 120
    {
      id: p.id,
      full_name: p.full_name,
      admission_date: p.admission_date.to_s,
      admission_time: p.admission_time_formatted,
      performer_name: p.performer_name,
      appeal_type: p.appeal_type,
      pregnancy_display: p.pregnancy_display,
      created_at: format_time_nsk(p.created_at, "%d.%m.%Y %H:%M"),
      triage: t ? {
        step: t.step,
        priority: t.priority,
        priority_name: t.priority_name,
        completed_at: t.completed_at,
        actions_completed_at: t.actions_completed_at,
        timer_active: t.timer_active,
        time_remaining: t.time_remaining,
        timer_ends_at: t.timer_ends_at,
        expired: t.expired?,
        max_time: max_time,
        step1_data: t.step1_data || {},
        step2_data: t.step2_data || {},
        step3_data: t.step3_data || {}
      } : nil
    }
  end.to_json
end

# Список пациентов
get '/patients' do
  base = Patient.includes(:triage)
  
  # Автоматически устанавливаем текущую дату, если не указана
  params[:admission_date] ||= Date.today.to_s
  
  base = base.search(params[:search]) if params[:search].present?
  base = apply_filters(base, params)

  # Активные в триаже (на мониторе) — всегда сверху, независимо от даты
  active_in_triage = base.joins(:triage).where(triages: { timer_active: true })
                         .order(admission_date: :desc, admission_time: :desc)
  ids_active = active_in_triage.pluck(:id)

  # Остальные по дате поступления (новые сверху), лимит для компактного списка
  rest = base.where.not(id: ids_active).order(admission_date: :desc, admission_time: :desc).limit(100)
  @patients = active_in_triage.to_a + rest.to_a

  @performers = Patient.distinct.pluck(:performer_name).compact.sort
  erb :patients_index
end

# Вспомогательный метод для фильтрации
def apply_filters(patients, params)
  # Фильтр по дате поступления (обязательный)
  admission_date = params[:admission_date].presence || Date.today.to_s
  patients = patients.where(admission_date: admission_date)
  
  # Фильтр по виду обращения
  if params[:appeal_type].present? && params[:appeal_type] != 'all'
    patients = patients.where(appeal_type: params[:appeal_type])
  end
  
  # Фильтр по сроку беременности
  if params[:pregnancy_condition].present?
    case params[:pregnancy_condition]
    when 'unknown'
      patients = patients.where(pregnancy_unknown: true)
    when 'less_12'
      patients = patients.where("pregnancy_weeks < 12 AND pregnancy_unknown = ?", false)
    when '12_28'
      patients = patients.where("pregnancy_weeks >= 12 AND pregnancy_weeks <= 28 AND pregnancy_unknown = ?", false)
    when 'more_28'
      patients = patients.where("pregnancy_weeks > 28 AND pregnancy_unknown = ?", false)
    end
  end
  
  # Фильтр по исполнителю
  if params[:performer_filter].present?
    patients = patients.where("performer_name LIKE ?", "%#{params[:performer_filter]}%")
  end
  
  # НОВЫЙ ФИЛЬТР: только незавершенные триажи
  if params[:only_active] == '1'
    patients = patients.joins(:triage).where(triages: { completed_at: nil })
  end
  
  patients
end

# Создание нового пациента
get '/patients/new' do
  erb :patients_new
end

post '/patients' do
  patient_params = {
    full_name: params[:full_name],
    admission_date: params[:admission_date],
    admission_time: params[:admission_time],
    birth_date: params[:birth_date],
    performer_name: params[:performer_name],
    appeal_type: params[:appeal_type],
    pregnancy_unknown: params[:pregnancy_unknown] == '1'
  }
  
  # Обработка срока беременности
  if params[:pregnancy_unknown] != '1' && params[:pregnancy_weeks].present?
    patient_params[:pregnancy_weeks] = params[:pregnancy_weeks].to_f
  end
  
  patient = Patient.create(patient_params)
  
  if patient.persisted?
    flash[:notice] = "Пациент создан. Переход к триажу."
    redirect "/patients/#{patient.id}/triage"
  else
    flash[:error] = "Ошибка при создании пациента: #{patient.errors.full_messages.join(', ')}"
    redirect '/patients/new'
  end
end

# Страница триажа
get '/patients/:id/triage' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil?
    flash[:error] = "Триаж не найден"
    redirect "/patients"
  end
  
  erb :triage_step1
end

# Обновление триажа
post '/patients/:id/triage' do
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage.update(
    eye_opening: params[:eye_opening],
    verbal_response: params[:verbal_response],
    consciousness_level: params[:consciousness_level]
  )
    triage.complete_triage
    flash[:notice] = "Триаж сохранен"
    redirect "/patients"
  else
    flash[:error] = "Ошибка при сохранении триажа"
    redirect "/patients/#{patient.id}/triage"
  end
end

# Страница мониторинга (для телевизора)
get '/monitor' do
  erb :monitor, layout: false
end

# API для получения таймера пациента
get '/api/patient_timer/:id' do
  content_type :json
  
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage
    {
      time_remaining: triage.time_remaining,
      expired: triage.expired?
    }.to_json
  else
    { time_remaining: 0, expired: true }.to_json
  end
end

# SSE поток для обновления триажа
# SSE поток для обновления триажа
get '/triage_events/:patient_id', provides: 'text/event-stream' do
  stream(:keep_open) do |out|
    TRIAGE_CONNECTIONS << out
    
    # Отправляем начальное состояние
    patient = Patient.find(params[:patient_id])
    triage = patient.triage
    out << "data: #{ { time_remaining: triage.time_remaining, expired: triage.expired? }.to_json }\n\n"
    
    # Периодическая отправка обновлений
    timer = EventMachine.add_periodic_timer(1) do
      break if triage.timer_active == false
      out << "data: #{ { time_remaining: triage.reload.time_remaining, expired: triage.expired? }.to_json }\n\n"
    end
    
    # Очистка при закрытии соединения
    out.callback { 
      TRIAGE_CONNECTIONS.delete(out) 
      EventMachine.cancel_timer(timer) if timer
    }
  end
end

# Хелпер для получения данных пациентов на мониторе
def get_monitor_patients_data
  # Пациенты на этапах триажа (timer_active = true)
  triage_patients = Patient.joins(:triage)
                           .where(triages: { timer_active: true })
                           .includes(:triage)
  
  # Пациенты на этапе действий (триаж завершён, действия НЕ завершены)
  action_patients = Patient.joins(:triage)
                           .where.not(triages: { completed_at: nil })
                           .where(triages: { actions_completed_at: nil })
                           .includes(:triage)
  
  # Объединяем (без дубликатов)
  all_patients = (triage_patients.to_a + action_patients.to_a).uniq(&:id)
  
  all_patients.map do |patient|
    triage = patient.triage
    
    # Определяем режим отображения
    is_in_actions = triage.completed_at.present? && triage.actions_completed_at.nil?
    
    data = {
      id: patient.id,
      full_name: patient.full_name,
      performer_name: patient.performer_name,
      appeal_type: patient.appeal_type,
      admission_time: patient.admission_time_formatted,
      step: triage.step,
      step_name: triage.step_name,
      priority: triage.priority,
      is_in_actions: is_in_actions
    }
    
    if is_in_actions
      # Данные для режима "Действия приоритета"
      now = Time.now
      
      # Таймер 5 минут на действия
      if triage.actions_started_at
        actions_elapsed = (now - triage.actions_started_at).to_i
        actions_remaining = [0, Triage::ACTIONS_TIME_LIMIT - actions_elapsed].max
        actions_ends_at = (triage.actions_started_at + Triage::ACTIONS_TIME_LIMIT).to_f
        data[:actions_time_remaining] = actions_remaining
        data[:actions_timer_ends_at] = actions_ends_at
        data[:actions_max_time] = Triage::ACTIONS_TIME_LIMIT
      end
      
      # Таймер бригады/медсестры (если активен)
      if triage.brigade_called_at && triage.brigade_time_limit
        brigade_elapsed = (now - triage.brigade_called_at).to_i
        brigade_remaining = [0, triage.brigade_time_limit - brigade_elapsed].max
        brigade_ends_at = (triage.brigade_called_at + triage.brigade_time_limit).to_f
        data[:brigade_time_remaining] = brigade_remaining
        data[:brigade_timer_ends_at] = brigade_ends_at
        data[:brigade_max_time] = triage.brigade_time_limit
        data[:brigade_timer_label] = triage.brigade_timer_label
      end
      
      # Прогресс действий
      actions = triage.priority_actions || []
      completed_actions = (triage.actions_data || {}).keys.length
      data[:actions_total] = actions.length
      data[:actions_completed] = completed_actions
    else
      # Данные для режима "Этапы триажа"
      data[:time_remaining] = triage.time_remaining
      data[:timer_ends_at] = triage.timer_ends_at
      max_times = { 1 => 120, 2 => 300, 3 => 600 }
      data[:max_time] = max_times[triage.step] || 120
    end
    
    data
  end
end

# SSE поток для мониторинга
get '/monitor_events', provides: 'text/event-stream' do
  stream(:keep_open) do |out|
    MONITOR_CONNECTIONS << out

    patients_data = get_monitor_patients_data
    out << "data: #{patients_data.to_json}\n\n"

    timer = EventMachine.add_periodic_timer(1) do
      patients_data = get_monitor_patients_data
      out << "data: #{patients_data.to_json}\n\n"
    end

    out.callback {
      MONITOR_CONNECTIONS.delete(out)
      EventMachine.cancel_timer(timer) if timer
    }
  end
end

# Страница триажа (этап 1)
get '/patients/:id/triage' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil?
    flash[:error] = "Триаж не найден"
    redirect "/patients"
  end
  
  # Если триаж уже завершен
  if @triage.completed_at
    flash[:info] = "Триаж уже завершен. Приоритет: #{@triage.priority_name}"
    redirect "/patients"
  end
  
  erb :triage_step1
end

# Сохранение этапа 1
post '/patients/:id/triage/step1' do
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  step_data = {
    'eye_opening' => params[:eye_opening],
    'verbal_response' => params[:verbal_response],
    'motor_response' => params[:motor_response],
    'breathing' => params[:breathing] == 'true',
    'heartbeat' => params[:heartbeat] == 'true',
    'seizures' => params[:seizures] == 'true',
    'active_bleeding' => params[:active_bleeding] == 'true'
  }
  
  triage.update_step_data(1, step_data)
  
  # Проверяем приоритет и переходим на следующий этап
  result = triage.advance_step
  
  if result == 'priority_assigned'
    flash[:notice] = "Приоритет определен: #{triage.priority_name}"
    redirect "/patients/#{patient.id}/triage/actions"
  else
    flash[:notice] = "Переходим ко второму этапу"
    redirect "/patients/#{patient.id}/triage/step2"
  end
end

# Страница этапа 2
get '/patients/:id/triage/step2' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil? || @triage.step != 2
    flash[:error] = "Доступ запрещен или триаж не найден"
    redirect "/patients"
  end
  
  erb :triage_step2
end

# Сохранение этапа 2
post '/patients/:id/triage/step2' do
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  step_data = {
    'position' => params[:position],
    'urgency_criteria' => params[:urgency_criteria] || [],
    'infection_signs' => params[:infection_signs] || []
  }
  
  triage.update_step_data(2, step_data)
  
  # Проверяем приоритет и переходим на следующий этап
  result = triage.advance_step
  
  if result == 'priority_assigned'
    flash[:notice] = "Приоритет определен: #{triage.priority_name}"
    redirect "/patients/#{patient.id}/triage/actions"
  else
    flash[:notice] = "Переходим к третьему этапу"
    redirect "/patients/#{patient.id}/triage/step3"
  end
end

# Страница этапа 3
get '/patients/:id/triage/step3' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil? || @triage.step != 3
    flash[:error] = "Доступ запрещен или триаж не найден"
    redirect "/patients"
  end
  
  erb :triage_step3
end

# Сохранение этапа 3
post '/patients/:id/triage/step3' do
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  step_data = {
    'respiratory_rate' => params[:respiratory_rate],
    'saturation' => params[:saturation],
    'systolic_bp' => params[:systolic_bp],
    'diastolic_bp' => params[:diastolic_bp],
    'heart_rate' => params[:heart_rate],
    'temperature' => params[:temperature]
  }
  
  triage.update_step_data(3, step_data)
  
  # Проверяем приоритет
  triage.advance_step
  
  flash[:notice] = "Триаж завершен. Приоритет: #{triage.priority_name}"
  redirect "/patients/#{patient.id}/triage/actions"
end

# Страница действий по приоритету
get '/patients/:id/triage/actions' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil? || @triage.priority == 'pending'
    flash[:error] = "Приоритет не определен"
    redirect "/patients/#{@patient.id}/triage"
  end
  
  # Автоматически начинаем действия для всех приоритетов с действиями
  if @triage.priority_actions.any? && !@triage.actions_started_at && !@triage.actions_completed?
    @triage.start_actions!
  end
  
  erb :triage_actions
end

# Отметить действие как выполненное
post '/patients/:id/triage/actions/mark' do
  content_type :json
  
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage.nil?
    return { error: 'Триаж не найден' }.to_json
  end
  
  action_key = params[:action]
  triage.mark_action!(action_key)
  
  final_action = triage.final_action
  can_complete = triage.can_complete_final_action? && final_action && triage.action_completed?(final_action[:key])
  
  {
    success: true,
    action: action_key,
    can_complete_final: triage.can_complete_final_action?,
    can_complete: can_complete,
    brigade_timer_ends_at: triage.brigade_timer_ends_at
  }.to_json
end

# Снять отметку с действия
post '/patients/:id/triage/actions/unmark' do
  content_type :json
  
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage.nil?
    return { error: 'Триаж не найден' }.to_json
  end
  
  action_key = params[:action]
  
  # Нельзя снять финальное действие если уже завершено
  final_action = triage.final_action
  if final_action && action_key == final_action[:key] && triage.actions_completed?
    return { error: 'Действия уже завершены' }.to_json
  end
  
  triage.unmark_action!(action_key)
  
  {
    success: true,
    action: action_key,
    can_complete_final: triage.can_complete_final_action?,
    can_complete: false
  }.to_json
end

# Завершить все действия
post '/patients/:id/triage/actions/complete' do
  content_type :json
  
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage.nil?
    return { error: 'Триаж не найден' }.to_json
  end
  
  if triage.complete_actions!
    { success: true }.to_json
  else
    { error: 'Не все действия выполнены' }.to_json
  end
end

# Просмотр всех данных триажа
get '/patients/:id/triage/view' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil?
    flash[:error] = "Триаж не найден"
    redirect "/patients"
  end
  
  erb :triage_view
end

# API для получения данных мониторинга
get '/api/active_patients' do
  content_type :json
  
  patients = Patient.joins(:triage)
                   .where(triages: { timer_active: true })
                   .includes(:triage)
                   .all
  
  patients.map do |patient|
    triage = patient.triage
    {
      id: patient.id,
      full_name: patient.full_name,
      performer_name: patient.performer_name,
      step: triage.step,
      step_name: triage.step_name,
      priority: triage.priority,
      time_remaining: triage.time_remaining,
      timer_ends_at: triage.timer_ends_at,
      eye_opening_score: triage.eye_score,
      verbal_score: triage.verbal_score,
      motor_score: triage.motor_score,
      consciousness_score: triage.total_consciousness_score
    }
  end.to_json
end

# app.rb - добавьте эти маршруты после существующих

# Удаление пациента
delete '/patients/:id' do
  patient = Patient.find(params[:id])
  
  if patient.destroy
    flash[:notice] = "Пациент удален"
  else
    flash[:error] = "Ошибка при удалении пациента"
  end
  
  redirect '/patients'
end

# Редактирование пациента
get '/patients/:id/edit' do
  @patient = Patient.find(params[:id])
  erb :patients_edit
end

post '/patients/:id/edit' do
  patient = Patient.find(params[:id])
  
  patient_params = {
    full_name: params[:full_name],
    admission_date: params[:admission_date],
    admission_time: params[:admission_time],
    birth_date: params[:birth_date],
    performer_name: params[:performer_name],
    appeal_type: params[:appeal_type],
    pregnancy_unknown: params[:pregnancy_unknown] == '1'
  }
  
  if params[:pregnancy_unknown] != '1' && params[:pregnancy_weeks].present?
    patient_params[:pregnancy_weeks] = params[:pregnancy_weeks].to_f
  else
    patient_params[:pregnancy_weeks] = nil
  end
  
  if patient.update(patient_params)
    flash[:notice] = "Данные пациента обновлены"
    redirect "/patients"
  else
    flash[:error] = "Ошибка при обновлении: #{patient.errors.full_messages.join(', ')}"
    redirect "/patients/#{patient.id}/edit"
  end
end

# Редактирование этапа триажа
get '/patients/:id/triage/edit_step/:step' do |id, step|
  @patient = Patient.find(id)
  @triage = @patient.triage
  @step = step.to_i
  
  if @triage.nil?
    flash[:error] = "Триаж не найден"
    redirect "/patients"
  end
  
  # Нельзя редактировать если действия уже завершены
  if @triage.actions_completed?
    flash[:error] = "Действия по приоритету завершены. Редактирование недоступно."
    redirect "/patients"
  end
  
  # Проверяем, что этап существует
  if @step < 1 || @step > 3
    flash[:error] = "Неверный номер этапа"
    redirect "/patients"
  end
  
  # Проверяем, что данные для этого этапа есть
  if @step > @triage.step && !@triage.completed_at
    flash[:error] = "Этот этап еще не был пройден"
    redirect "/patients"
  end
  
  case @step
  when 1
    erb :triage_edit_step1
  when 2
    erb :triage_edit_step2
  when 3
    erb :triage_edit_step3
  end
end

post '/patients/:id/triage/update_step/:step' do |id, step|
  patient = Patient.find(id)
  triage = patient.triage
  step_num = step.to_i
  
  if triage.nil?
    flash[:error] = "Триаж не найден"
    redirect "/patients"
  end
  
  # Нельзя редактировать если действия уже завершены
  if triage.actions_completed?
    flash[:error] = "Действия по приоритету завершены. Редактирование недоступно."
    redirect "/patients"
  end
  
  # Запоминаем был ли триаж уже завершён
  was_completed = triage.completed_at.present?
  
  case step_num
  when 1
    step_data = {
      'eye_opening' => params[:eye_opening],
      'verbal_response' => params[:verbal_response],
      'motor_response' => params[:motor_response],
      'breathing' => params[:breathing] == 'true',
      'heartbeat' => params[:heartbeat] == 'true',
      'seizures' => params[:seizures] == 'true',
      'active_bleeding' => params[:active_bleeding] == 'true'
    }
    
    triage.update_step_data(1, step_data)
    triage.step1_completed_at = Time.now
    
    # Проверяем приоритет после редактирования этапа 1
    if triage.check_step1_priority
      # Приоритет определён → завершаем триаж, очищаем последующие этапы
      triage.step2_data = {}
      triage.step3_data = {}
      triage.step2_completed_at = nil
      triage.step3_completed_at = nil
      triage.step = 1
      triage.completed_at = Time.now
      triage.timer_active = false
      triage.actions_started_at = Time.now  # Автостарт действий
    else
      # Приоритет НЕ определён → продолжаем к этапу 2
      triage.step = 2
      triage.priority = 'pending'
      triage.completed_at = nil
      triage.timer_active = true
      triage.start_time = Time.now
      # Сбрасываем данные действий
      triage.actions_started_at = nil
      triage.actions_data = nil
      triage.brigade_called_at = nil
      triage.actions_completed_at = nil
    end
    
  when 2
    step_data = {
      'position' => params[:position],
      'urgency_criteria' => params[:urgency_criteria] || [],
      'infection_signs' => params[:infection_signs] || []
    }
    
    triage.update_step_data(2, step_data)
    triage.step2_completed_at = Time.now
    
    # Проверяем приоритет после редактирования этапа 2
    if triage.check_step2_priority
      # Приоритет определён → завершаем триаж, очищаем этап 3
      triage.step3_data = {}
      triage.step3_completed_at = nil
      triage.step = 2
      triage.completed_at = Time.now
      triage.timer_active = false
      triage.actions_started_at = Time.now  # Автостарт действий
    else
      # Приоритет НЕ определён → продолжаем к этапу 3
      triage.step = 3
      triage.priority = 'pending'
      triage.completed_at = nil
      triage.timer_active = true
      triage.start_time = Time.now
      # Сбрасываем данные действий
      triage.actions_started_at = nil
      triage.actions_data = nil
      triage.brigade_called_at = nil
      triage.actions_completed_at = nil
    end
    
  when 3
    step_data = {
      'respiratory_rate' => params[:respiratory_rate],
      'saturation' => params[:saturation],
      'systolic_bp' => params[:systolic_bp],
      'diastolic_bp' => params[:diastolic_bp],
      'heart_rate' => params[:heart_rate],
      'temperature' => params[:temperature]
    }
    
    triage.update_step_data(3, step_data)
    triage.step3_completed_at = Time.now
    
    # Этап 3 всегда определяет финальный приоритет и завершает триаж
    triage.check_step3_priority
    triage.completed_at = Time.now
    triage.timer_active = false
    triage.actions_started_at = Time.now  # Автостарт действий
  end
  
  if triage.save
    # Определяем куда перенаправить и какое сообщение показать
    if triage.completed_at
      # Триаж завершён
      if was_completed
        flash[:notice] = "Приоритет изменён на: #{triage.priority_name}"
      else
        flash[:notice] = "Приоритет: #{triage.priority_name}. Триаж завершён."
      end
      redirect "/patients/#{patient.id}/triage/actions"
    else
      # Триаж продолжается
      flash[:notice] = "Данные этапа #{step_num} обновлены. Переход к этапу #{triage.step}."
      redirect "/patients/#{patient.id}/triage/step#{triage.step}"
    end
  else
    flash[:error] = "Ошибка при обновлении данных"
    redirect "/patients/#{patient.id}/triage/edit_step/#{step_num}"
  end
end