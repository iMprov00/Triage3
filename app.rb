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

# Список пациентов
get '/patients' do
  # Начинаем с базового запроса
  @patients = Patient.includes(:triage)
  
  # Поиск
  if params[:search].present?
    @patients = @patients.search(params[:search])
  end
  
  # Применяем фильтры
  @patients = apply_filters(@patients, params)
  
  # Сортировка по дате поступления (новые сверху)
  @patients = @patients.order(admission_date: :desc, admission_time: :desc)
  
  # Получаем уникальных исполнителей для фильтра
  @performers = Patient.distinct.pluck(:performer_name).compact.sort
  
  erb :patients_index
end

# Вспомогательный метод для фильтрации
def apply_filters(patients, params)
  # Фильтр по дате поступления
  if params[:admission_date_from].present?
    patients = patients.where("admission_date >= ?", params[:admission_date_from])
  end
  
  if params[:admission_date_to].present?
    patients = patients.where("admission_date <= ?", params[:admission_date_to])
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
  
  erb :triage
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

# API для получения данных мониторинга
get '/api/active_patients' do
  content_type :json
  
  patients = Patient.joins(:triage)
                   .where(triages: { timer_active: true })
                   .includes(:triage)
                   .all
  
  patients.map do |patient|
    {
      id: patient.id,
      full_name: patient.full_name,
      time_remaining: patient.triage.time_remaining,
      eye_opening: patient.triage.eye_opening,
      verbal_response: patient.triage.verbal_response,
      consciousness_level: patient.triage.consciousness_level
    }
  end.to_json
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

# SSE поток для мониторинга
get '/monitor_events', provides: 'text/event-stream' do
  stream(:keep_open) do |out|
    MONITOR_CONNECTIONS << out
    
    # Отправляем обновления каждую секунду
    timer = EventMachine.add_periodic_timer(1) do
      patients_data = Patient.joins(:triage)
                           .where(triages: { timer_active: true })
                           .includes(:triage)
                           .map do |patient|
        {
          id: patient.id,
          full_name: patient.full_name,
          time_remaining: patient.triage.time_remaining,
          eye_opening: patient.triage.eye_opening,
          verbal_response: patient.triage.verbal_response
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
