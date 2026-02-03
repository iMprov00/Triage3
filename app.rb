require 'sinatra'
require 'sinatra/activerecord'
require 'sinatra/reloader' if development?
require 'sinatra/flash'
require 'json'
require 'sprockets'
require 'sprockets-helpers'
require 'bootstrap'
require 'securerandom'

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
      admission_time: p.admission_time.to_s,
      performer_name: p.performer_name,
      appeal_type: p.appeal_type,
      pregnancy_display: p.pregnancy_display,
      created_at: p.created_at.strftime("%d.%m.%Y %H:%M"),
      triage: t ? {
        step: t.step,
        priority: t.priority,
        priority_name: t.priority_name,
        completed_at: t.completed_at,
        timer_active: t.timer_active,
        time_remaining: t.time_remaining,
        timer_ends_at: t.timer_ends_at,
        expired: t.expired?,
        max_time: max_time
      } : nil
    }
  end.to_json
end

# Список пациентов
get '/patients' do
  base = Patient.includes(:triage)
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
  # Фильтр по дате поступления (одна дата вместо диапазона)
  if params[:admission_date].present?
    patients = patients.where(admission_date: params[:admission_date])
  end
  
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
  erb :monitor
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

# SSE поток для мониторинга (тот же формат, что и /api/active_patients)
get '/monitor_events', provides: 'text/event-stream' do
  stream(:keep_open) do |out|
    MONITOR_CONNECTIONS << out

    patients_data = Patient.joins(:triage)
                         .where(triages: { timer_active: true })
                         .includes(:triage)
                         .map do |patient|
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
    end
    out << "data: #{patients_data.to_json}\n\n"

    timer = EventMachine.add_periodic_timer(1) do
      patients_data = Patient.joins(:triage)
                           .where(triages: { timer_active: true })
                           .includes(:triage)
                           .map do |patient|
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
      end
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

# Заглушка для действий по приоритету
get '/patients/:id/triage/actions' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil? || @triage.priority == 'pending'
    flash[:error] = "Приоритет не определен"
    redirect "/patients/#{@patient.id}/triage"
  end
  
  erb :triage_actions
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