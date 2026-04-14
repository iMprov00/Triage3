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
  set :session_secret, ENV.fetch('SESSION_SECRET') { SecureRandom.hex(32) }
  set :server, :puma
  
  ActiveRecord::Base.logger = Logger.new(STDOUT) if development?

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

  def format_duration_sec(sec)
    return '—' if sec.nil?

    m = sec.to_i / 60
    s = sec.to_i % 60
    format('%d:%02d', m, s)
  end

  def audit_event_label(type)
    TriageAuditEvent::EVENT_LABELS[type] || type.to_s
  end

  def audit_payload_value(key, raw)
    k = key.to_s
    case k
    when 'within_limit'
      return '—' if raw.nil?

      raw ? 'да' : 'нет'
    when 'timer_expired'
      return '—' if raw.nil?

      raw ? 'да (автосохранение по таймеру)' : 'нет'
    when 'advance_result'
      TriageAuditEvent::ADVANCE_RESULT_LABELS[raw.to_s] || raw.to_s
    when 'priority'
      Triage.priority_label_ru(raw)
    when 'limit_seconds', 'seconds_used'
      return '—' if raw.nil?

      sec = raw.to_i
      "#{format_duration_sec(sec)} (#{sec} с)"
    when 'action'
      Triage.action_text_for_key(raw)
    when 'value'
      raw.nil? ? '—' : raw.to_s
    else
      raw.nil? ? '—' : raw.to_s
    end
  end

  def audit_event_payload_rows(ev)
    ph = ev.payload_hash
    return [] if ph.blank?

    ph = ph.transform_keys(&:to_s)
    order = TriageAuditEvent::PAYLOAD_DISPLAY_KEY_ORDER
    keys_ordered = order.select { |x| ph.key?(x) } + (ph.keys - order).sort

    keys_ordered.map do |field|
      label = TriageAuditEvent::PAYLOAD_KEY_LABELS[field] || "Параметр (#{field})"
      [label, audit_payload_value(field, ph[field])]
    end
  end

  STEP_FIELD_LABELS = {
    1 => {
      'eye_opening' => 'Открывание глаз',
      'verbal_response' => 'Речевые реакции',
      'motor_response' => 'Двигательные реакции',
      'breathing' => 'Дыхание',
      'heartbeat' => 'Сердцебиение',
      'seizures' => 'Судороги',
      'active_bleeding' => 'Активное кровотечение'
    },
    2 => {
      'position' => 'Положение пациента',
      'urgency_criteria' => 'Критерии неотложности',
      'infection_signs' => 'Признаки инфекционных заболеваний'
    },
    3 => {
      'respiratory_rate' => 'ЧДД',
      'saturation' => 'Сатурация',
      'systolic_bp' => 'Систолическое АД',
      'diastolic_bp' => 'Диастолическое АД',
      'heart_rate' => 'ЧСС',
      'temperature' => 'Температура'
    }
  }.freeze

  def step_field_label(step_num, key)
    STEP_FIELD_LABELS.dig(step_num.to_i, key.to_s) || key.to_s
  end

  def step_field_value_display(step_num, key, value)
    s = step_num.to_i
    k = key.to_s
    return '—' if value.nil?

    if %w[breathing heartbeat seizures active_bleeding].include?(k)
      return (value == true || value.to_s == 'true') ? 'Да' : 'Нет'
    end

    if s == 2 && %w[urgency_criteria infection_signs].include?(k)
      arr = Array(value).map(&:to_s).reject(&:empty?)
      return '—' if arr.empty?

      options = (k == 'urgency_criteria') ? Triage::URGENCY_CRITERIA : Triage::INFECTION_SIGNS
      labels = arr.filter_map do |v|
        if v =~ /^\d+$/
          idx = v.to_i
          options[idx]
        elsif v == 'true'
          nil
        else
          v
        end
      end
      return labels.join('; ') if labels.any?
      return arr.join('; ')
    end

    value.to_s
  end

  def step_values_rows_from_payload(payload_hash)
    ph = payload_hash.is_a?(Hash) ? payload_hash : {}
    step_num = ph['step'].to_i
    values = ph['step_values']
    return [] unless values.is_a?(Hash)

    values.map do |k, v|
      [step_field_label(step_num, k), step_field_value_display(step_num, k, v)]
    end
  end

  def step_changed_rows_from_payload(payload_hash)
    ph = payload_hash.is_a?(Hash) ? payload_hash : {}
    step_num = ph['step'].to_i
    arr = ph['changed_fields']
    return [] unless arr.is_a?(Array)

    arr.filter_map do |h|
      next unless h.is_a?(Hash)
      field = h['field'].to_s
      [
        step_field_label(step_num, field),
        step_field_value_display(step_num, field, h['before']),
        step_field_value_display(step_num, field, h['after'])
      ]
    end
  end

  def current_user
    @current_user ||= begin
      session[:user_id].present? ? User.find_by(id: session[:user_id]) : nil
    end
  end

  def require_user!
    return if current_user

    flash[:error] = 'Войдите в систему'
    q = request.fullpath && request.fullpath != '/' ? "?return_to=#{Rack::Utils.escape_path(request.fullpath)}" : ''
    redirect "/login#{q}"
  end

  def public_request?
    p = request.path_info
    return true if p == '/login'
    return true if p == '/monitor' || p == '/monitor_events'
    return true if p == '/manifest.json'
    return true if p == '/sw.js'
    return true if p.start_with?('/icons/')
    return true if p.start_with?('/css/', '/js/')
    return true if p.start_with?('/prototypes/')
    return true if p.start_with?('/assets/')
    return true if p =~ %r{\A/api/patient_timer/}
    false
  end

  def can_choose_patient_performer?
    current_user&.doctor_or_admin?
  end

  def can_choose_step_performer?
    current_user&.doctor_or_admin?
  end

  def performer_users_for_select
    u = User.doctor_or_admin.ordered.to_a
    return Array(current_user).compact if u.empty?

    u
  end

  # Исполнитель "по карте пациента" (матрица прав):
  # - admin: любой пользователь
  # - doctor: только себя + пользователей с ролью "other"
  # - other: только себя (и фактически не видит селектор)
  def patient_performer_users_for_select
    return [] unless current_user

    if current_user.admin?
      return User.includes(:job_position).ordered.to_a
    end

    if current_user.doctor?
      others = User.joins(:job_position).where(job_positions: { kind: 'other' }).ordered.to_a
      own = current_user
      return ([own] + others).uniq { |u| u.id }
    end

    [current_user]
  end

  def resolve_patient_performer_user_id(params)
    uid = params[:performer_user_id].to_i
    allowed_ids = patient_performer_users_for_select.map(&:id)
    return uid if uid.positive? && allowed_ids.include?(uid)

    current_user.id
  end

  def resolve_step_performer_user_id(params, patient)
    default = current_user.id
    allowed_ids = step_performer_users_for_select.map(&:id)
    return default if allowed_ids.empty?

    uid = params[:step_performer_user_id].to_i
    uid.positive? && allowed_ids.include?(uid) ? uid : default
  end

  # Исполнитель на шагах триажа и действиях приоритета:
  # - admin: любой пользователь
  # - doctor: только себя + пользователей с ролью "other"
  # - other: только себя (селектор скрыт)
  def step_performer_users_for_select
    return [] unless current_user

    if current_user.admin?
      return User.includes(:job_position).ordered.to_a
    end

    if current_user.doctor?
      others = User.joins(:job_position).where(job_positions: { kind: 'other' }).ordered.to_a
      return ([current_user] + others).uniq { |u| u.id }
    end

    [current_user]
  end

  def acting_performer_name_for_user_id(uid)
    User.find_by(id: uid)&.full_name
  end

  # Ограничения для роли "прочее":
  # изменять шаги/действия можно только по "своим" пациентам (где пользователь назначен исполнителем).
  def other_role_user?
    current_user&.job_position&.kind == 'other'
  end

  def current_user_is_patient_performer?(patient)
    return false unless current_user && patient

    uid_match = patient.respond_to?(:performer_user_id) &&
                patient.performer_user_id.present? &&
                patient.performer_user_id == current_user.id
    return true if uid_match

    # Fallback для legacy-данных без performer_user_id
    patient.performer_name.to_s.strip == current_user.full_name.to_s.strip
  end

  def restricted_other_can_modify_patient?(patient)
    return true unless other_role_user?

    current_user_is_patient_performer?(patient)
  end

  def enforce_other_patient_modify_permission!(patient, as_json: false)
    return if restricted_other_can_modify_patient?(patient)

    msg = 'Недостаточно прав: пользователь с ролью "Прочее" может изменять только своих пациентов.'
    if as_json
      halt 403, { error: msg }.to_json
    else
      flash[:error] = msg
      redirect '/patients'
    end
  end

  def performers_for_filters
    names = User.doctor_or_admin.pluck(:full_name)
    legacy = Patient.where.not(performer_name: [nil, '']).distinct.pluck(:performer_name)
    (names + legacy).compact.uniq.sort
  end

  # Есть ли сохранённые ответы по шагу (для ссылки «редактировать шаг»).
  def triage_step_has_saved_data?(triage, step_num)
    return false unless triage

    data = case step_num.to_i
           when 1 then triage.step1_data
           when 2 then triage.step2_data
           when 3 then triage.step3_data
           else nil
           end
    data.is_a?(Hash) && data.any? { |_k, v| v.present? }
  end

  # CSS-класс контура карточки в списке пациентов (вариант B): цвет + пульсация по статусу.
  def patient_list_card_state_class(patient)
    t = patient.triage
    return 'patient-b-card--notriage' if t.nil?
    return 'patient-b-card--done' if t.actions_completed?

    return 'patient-b-card--triage-active' if t.completed_at.blank?

    case t.priority.to_s
    when 'red' then 'patient-b-card--priority-red'
    when 'yellow' then 'patient-b-card--priority-yellow'
    when 'purple' then 'patient-b-card--priority-purple'
    when 'green' then 'patient-b-card--priority-green'
    else 'patient-b-card--triage-active'
    end
  end

  def patient_to_list_hash(p)
    t = p.triage
    max_time = t ? (case t.step when 1 then 120 when 2 then 300 when 3 then 600 else 120 end) : 120
    {
      id: p.id,
      full_name: p.full_name,
      admission_date: p.admission_date.to_s,
      admission_time: p.admission_time_formatted,
      performer_name: p.performer_name,
      birth_date: p.birth_date&.to_s,
      appeal_type: p.appeal_type,
      pregnancy_display: p.pregnancy_display,
      created_at: format_time_nsk(p.created_at, "%d.%m.%Y %H:%M"),
      can_delete: !other_role_user?,
      can_edit_saved_steps: !other_role_user? || current_user_is_patient_performer?(p),
      card_state_class: patient_list_card_state_class(p),
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
  end
end

before do
  @current_user = nil
  return if public_request?

  require_user!
end

before do
  next unless request.path_info.start_with?('/admin')

  unless current_user&.admin?
    flash[:error] = 'Нужны права администратора'
    redirect '/patients'
  end
end

# Хранилище для SSE соединений
TRIAGE_CONNECTIONS = []
MONITOR_CONNECTIONS = []

# Вход / выход
get '/login' do
  redirect '/patients' if current_user

  @return_to = params[:return_to].presence || '/patients'
  erb :login, layout: false
end

post '/login' do
  user = User.find_by(login: params[:login].to_s.strip.downcase)
  if user&.authenticate(params[:password])
    session[:user_id] = user.id
    rt = params[:return_to].to_s
    redirect((rt.start_with?('/') && !rt.start_with?('//')) ? rt : '/patients')
  else
    flash[:error] = 'Неверный логин или пароль'
    redirect '/login'
  end
end

post '/logout' do
  session.clear
  flash[:notice] = 'Вы вышли из системы'
  redirect '/login'
end

# Администрирование пользователей
get '/admin/users' do
  @users = User.order(:login)
  erb :admin_users_index
end

get '/admin/users/new' do
  @user = User.new
  @job_positions = JobPosition.ordered
  erb :admin_users_new
end

post '/admin/users' do
  @job_positions = JobPosition.ordered
  @user = User.new(
    login: params[:login],
    password: params[:password],
    password_confirmation: params[:password_confirmation],
    full_name: params[:full_name],
    job_position_id: params[:job_position_id]
  )
  if @user.save
    flash[:notice] = "Пользователь «#{@user.login}» создан"
    redirect '/admin/users'
  else
    flash[:error] = @user.errors.full_messages.join(', ')
    erb :admin_users_new
  end
end

get '/admin/users/:id/edit' do
  @user = User.find(params[:id])
  @job_positions = JobPosition.ordered
  erb :admin_users_edit
end

post '/admin/users/:id' do
  @user = User.find(params[:id])
  @job_positions = JobPosition.ordered

  attrs = {
    login: params[:login],
    full_name: params[:full_name],
    job_position_id: params[:job_position_id]
  }
  if params[:password].to_s.strip.present?
    attrs[:password] = params[:password]
    attrs[:password_confirmation] = params[:password_confirmation]
  end

  if @user.update(attrs)
    flash[:notice] = "Данные пользователя «#{@user.login}» сохранены"
    redirect '/admin/users'
  else
    flash[:error] = @user.errors.full_messages.join(', ')
    erb :admin_users_edit
  end
end

# Справочник должностей
get '/admin/positions' do
  @positions = JobPosition.includes(:users).ordered
  erb :admin_positions_index
end

get '/admin/positions/new' do
  @position = JobPosition.new
  erb :admin_positions_new
end

post '/admin/positions' do
  @position = JobPosition.new(name: params[:name].to_s.strip, kind: params[:kind])
  if @position.save
    flash[:notice] = "Должность «#{@position.name}» добавлена"
    redirect '/admin/positions'
  else
    flash[:error] = @position.errors.full_messages.join(', ')
    erb :admin_positions_new
  end
end

get '/admin/positions/:id/edit' do
  @position = JobPosition.find(params[:id])
  erb :admin_positions_edit
end

post '/admin/positions/:id' do
  @position = JobPosition.find(params[:id])
  if @position.update(name: params[:name].to_s.strip, kind: params[:kind])
    flash[:notice] = 'Должность обновлена'
    redirect '/admin/positions'
  else
    flash[:error] = @position.errors.full_messages.join(', ')
    erb :admin_positions_edit
  end
end

post '/admin/positions/:id/delete' do
  jp = JobPosition.find(params[:id])
  if jp.users.exists?
    flash[:error] = 'Нельзя удалить должность: есть пользователи с этой записью'
  else
    jp.destroy!
    flash[:notice] = 'Должность удалена'
  end
  redirect '/admin/positions'
end

# Главная страница
get '/' do
  redirect '/patients'
end

# API списка пациентов (JSON, для обновления в реальном времени)
get '/api/patients_list' do
  content_type :json
  build_merged_patients_list(params).map { |p| patient_to_list_hash(p) }.to_json
end

# Подробная статистика по пациенту (журнал событий и метрики времени)
get '/statistics' do
  params[:admission_date] ||= Date.today.to_s
  @patients = build_merged_patients_list(params)
  @performers = performers_for_filters

  @selected_patient = nil
  @triage = nil
  @audit_events = []

  if params[:patient_id].present?
    @selected_patient = Patient.find_by(id: params[:patient_id])
    if @selected_patient
      @triage = @selected_patient.triage
      @audit_events = @selected_patient.triage_audit_events.includes(:triage).order(:occurred_at)
    end
  end

  @patients_for_select =
    if @selected_patient && @patients.none? { |p| p.id == @selected_patient.id }
      [@selected_patient] + @patients
    else
      @patients
    end

  erb :statistics
end

# Список пациентов
get '/patients' do
    puts "=== ЗАПРОС СПИСКА ==="
  puts "params: #{params.inspect}"
  puts "admission_date: #{params[:admission_date]}"
  puts "search: #{params[:search]}"
  puts "only_active: #{params[:only_active]}"
  # Автоматически устанавливаем текущую дату, если не указана
  params[:admission_date] ||= Date.today.to_s

  @patients = build_merged_patients_list(params)
  @patients_list_js = true

  @performers = performers_for_filters
  erb :patients_index
end

# Как на мониторе: этап триажа с таймером или этап действий по приоритету (без фильтра по дате).
def monitor_active_patients_scope(patients, params)
  rel = patients
  rel = rel.search(params[:search]) if params[:search].present?
  rel.joins(:triage).where(
    "triages.timer_active = :t OR (triages.completed_at IS NOT NULL AND triages.actions_completed_at IS NULL)",
    t: true
  )
end

def apply_admission_date_filter(patients, params)
  admission_date = params[:admission_date].presence || Date.today.to_s
  patients.where(patients: { admission_date: admission_date })
end

def apply_secondary_filters(patients, params)
  if params[:appeal_type].present? && params[:appeal_type] != 'all'
    patients = patients.where(patients: { appeal_type: params[:appeal_type] })
  end

  if params[:pregnancy_condition].present?
    case params[:pregnancy_condition]
    when 'unknown'
      patients = patients.where(patients: { pregnancy_unknown: true })
    when 'less_12'
      patients = patients.where("patients.pregnancy_weeks < 12 AND patients.pregnancy_unknown = ?", false)
    when '12_28'
      patients = patients.where("patients.pregnancy_weeks >= 12 AND patients.pregnancy_weeks <= 28 AND patients.pregnancy_unknown = ?", false)
    when 'more_28'
      patients = patients.where("patients.pregnancy_weeks > 28 AND patients.pregnancy_unknown = ?", false)
    end
  end

  if params[:performer_filter].present?
    patients = patients.where("patients.performer_name LIKE ?", "%#{params[:performer_filter]}%")
  end

  if params[:only_active] == '1'
    patients = patients.joins(:triage).where(triages: { completed_at: nil })
  end

  patients
end

def apply_filters(patients, params)
  patients = apply_admission_date_filter(patients, params)
  apply_secondary_filters(patients, params)
end

def build_merged_patients_list(params)
  active_list = monitor_active_patients_scope(Patient.includes(:triage), params)
                  .order(admission_date: :desc, admission_time: :desc)
                  .to_a
  ids_active = active_list.map(&:id)

  rest_base = Patient.includes(:triage)
  rest_base = rest_base.search(params[:search]) if params[:search].present?
  rest_base = apply_filters(rest_base, params)
  rest_list = rest_base.where.not(id: ids_active)
                .order(admission_date: :desc, admission_time: :desc)
                .limit(100)
                .to_a

  active_list + rest_list
end

# Создание нового пациента
get '/patients/new' do
  erb :patients_new
end

post '/patients' do
    puts "=== СОЗДАНИЕ ПАЦИЕНТА ==="
  puts "params: #{params.inspect}"
  p_uid = resolve_patient_performer_user_id(params)
  patient_params = {
    full_name: params[:full_name],
    admission_date: params[:admission_date],
    admission_time: params[:admission_time],
    birth_date: params[:birth_date],
    appeal_type: params[:appeal_type],
    pregnancy_unknown: params[:pregnancy_unknown] == '1',
    created_by_user_id: current_user.id,
    performer_user_id: p_uid
  }
  
  # Обработка срока беременности
  if params[:pregnancy_unknown] != '1' && params[:pregnancy_weeks].present?
    patient_params[:pregnancy_weeks] = params[:pregnancy_weeks].to_f
  end
  
  patient = Patient.create(patient_params)
  
  if patient.persisted?
      puts "Пациент сохранён: id=#{patient.id}, admission_date=#{patient.admission_date}, full_name=#{patient.full_name}"
    flash[:notice] = 'Пациент добавлен в список. Триаж можно начать из списка, когда будете готовы.'
    redirect "/patients?admission_date=#{patient.admission_date}"
  else
    flash[:error] = "Ошибка при создании пациента: #{patient.errors.full_messages.join(', ')}"
    puts "Ошибка сохранения: #{patient.errors.full_messages}"
    redirect '/patients/new'
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
      if triage.red_arrest_actions_flow?
        prog = triage.red_arrest_actions_progress_for_monitor
        data[:actions_total] = prog[:total]
        data[:actions_completed] = prog[:completed]
      else
        actions = triage.priority_actions || []
        completed_actions = (triage.actions_data || {}).keys.length
        data[:actions_total] = actions.length
        data[:actions_completed] = completed_actions
      end
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

# Явное начало триажа из списка (после регистрации пациента триаж не создаётся автоматически).
post '/patients/:id/triage/start' do
  patient = Patient.find(params[:id])
  enforce_other_patient_modify_permission!(patient)

  if patient.triage.present?
    flash[:info] = 'Триаж для этого пациента уже начат.'
    redirect "/patients/#{patient.id}/triage"
  end

  triage = patient.start_triage!
  TriageAuditEvent.log!(
    patient: patient,
    triage: triage,
    type: 'triage_started',
    payload: { performer_name: patient.performer_name }
  )
  flash[:notice] = 'Триаж начат. Заполните шаг 1.'
  redirect "/patients/#{patient.id}/triage"
end

# Страница триажа (этап 1)
get '/patients/:id/triage' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil?
    flash[:error] = 'Триаж ещё не начат. Нажмите «Начать триаж» в списке пациентов.'
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
  unless triage
    flash[:error] = 'Триаж не найден. Начните триаж из списка пациентов.'
    redirect '/patients'
    halt
  end
  
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
  step_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!(1, step_uid)
  triage.save!

  # Проверяем приоритет и переходим на следующий этап
  result = triage.advance_step
  triage.reload
  acting_name = acting_performer_name_for_user_id(step_uid)
  TriageAuditEvent.log_step_submit!(patient, triage, 1, result,
                                    timer_expired: params[:timer_expired] == '1',
                                    acting_performer_name: acting_name)

  if result == 'priority_assigned'
    flash[:notice] = "Приоритет определен: #{triage.priority_name}"
    redirect "/patients/#{patient.id}/triage/actions"
  else
    flash[:notice] = "Переходим ко второму шагу"
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
  unless triage
    flash[:error] = 'Триаж не найден. Начните триаж из списка пациентов.'
    redirect '/patients'
    halt
  end
  
  step_data = {
    'position' => params[:position],
    'urgency_criteria' => params[:urgency_criteria] || [],
    'infection_signs' => params[:infection_signs] || []
  }
  
  triage.update_step_data(2, step_data)
  step_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!(2, step_uid)
  triage.save!

  # Проверяем приоритет и переходим на следующий этап
  result = triage.advance_step
  triage.reload
  acting_name = acting_performer_name_for_user_id(step_uid)
  TriageAuditEvent.log_step_submit!(patient, triage, 2, result,
                                    timer_expired: params[:timer_expired] == '1',
                                    acting_performer_name: acting_name)

  if result == 'priority_assigned'
    flash[:notice] = "Приоритет определен: #{triage.priority_name}"
    redirect "/patients/#{patient.id}/triage/actions"
  else
    flash[:notice] = "Переходим к третьему шагу"
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
  unless triage
    flash[:error] = 'Триаж не найден. Начните триаж из списка пациентов.'
    redirect '/patients'
    halt
  end
  
  step_data = {
    'respiratory_rate' => params[:respiratory_rate],
    'saturation' => params[:saturation],
    'systolic_bp' => params[:systolic_bp],
    'diastolic_bp' => params[:diastolic_bp],
    'heart_rate' => params[:heart_rate],
    'temperature' => params[:temperature]
  }
  
  triage.update_step_data(3, step_data)
  step_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!(3, step_uid)
  triage.save!

  # Проверяем приоритет
  result = triage.advance_step
  triage.reload
  acting_name = acting_performer_name_for_user_id(step_uid)
  TriageAuditEvent.log_step_submit!(patient, triage, 3, result,
                                    timer_expired: params[:timer_expired] == '1',
                                    acting_performer_name: acting_name)

  flash[:notice] = "Триаж завершен. Приоритет: #{triage.priority_name}"
  redirect "/patients/#{patient.id}/triage/actions"
end

# Страница действий по приоритету
get '/patients/:id/triage/actions' do
  @patient = Patient.find(params[:id])
  @triage = @patient.triage
  
  if @triage.nil?
    flash[:error] = 'Триаж не начат.'
    redirect '/patients'
  elsif @triage.priority == 'pending'
    flash[:error] = 'Приоритет не определён — завершите шаги триажа.'
    redirect "/patients/#{@patient.id}/triage"
  end
  
  # Автоматически начинаем действия для всех приоритетов с действиями (в т.ч. сценарий «остановка»)
  if (@triage.priority_actions.any? || @triage.red_arrest_actions_flow?) && !@triage.actions_started_at && !@triage.actions_completed?
    @triage.start_actions!
  end
  
  erb :triage_actions
end

# Красный приоритет (нет дыхания / нет сердцебиения): вызов бригады
post '/patients/:id/triage/actions/red_arrest/brigade' do
  content_type :json

  patient = Patient.find(params[:id])
  triage = patient.triage
  return { error: 'Триаж не найден' }.to_json if triage.nil?
  return { error: 'Недоступно' }.to_json unless triage.red_arrest_actions_flow?

  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  res = triage.mark_red_arrest_brigade!
  triage.reload
  pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name
  if res == :ok_new
    TriageAuditEvent.log!(patient: patient, triage: triage, type: 'priority_action_marked',
                          payload: { action: 'ra_brigade_called', performer_name: pname })
  end

  return { error: 'не удалось сохранить' }.to_json if res == :invalid

  {
    success: true,
    brigade_timer_ends_at: triage.brigade_timer_ends_at,
    can_complete: triage.can_complete_red_arrest?
  }.to_json
end

# Красный приоритет (остановка): чекбоксы бригады / манипуляций
post '/patients/:id/triage/actions/red_arrest/toggle' do
  content_type :json

  patient = Patient.find(params[:id])
  triage = patient.triage
  return { error: 'Триаж не найден' }.to_json if triage.nil?
  return { error: 'Недоступно' }.to_json unless triage.red_arrest_actions_flow?

  group = params[:group].to_s
  key = params[:key].to_s
  checked = params[:checked] == 'true' || params[:checked] == '1' || params[:checked] == true

  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  unless triage.toggle_red_arrest_item!(group, key, checked)
    return { error: 'не удалось сохранить' }.to_json
  end
  triage.reload
  pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name

  audit_key = if group == 'team'
                "ra_team_#{key}"
              else
                "ra_manip_#{key}"
              end
  ev = checked ? 'priority_action_marked' : 'priority_action_unmarked'
  TriageAuditEvent.log!(patient: patient, triage: triage, type: ev,
                        payload: { action: audit_key, performer_name: pname })

  {
    success: true,
    can_complete: triage.can_complete_red_arrest?
  }.to_json
end

# Красный приоритет (остановка): витальные замеры и бинарные признаки
post '/patients/:id/triage/actions/red_arrest/vital' do
  content_type :json

  patient = Patient.find(params[:id])
  triage = patient.triage
  return { error: 'Триаж не найден' }.to_json if triage.nil?
  return { error: 'Недоступно' }.to_json unless triage.red_arrest_actions_flow?

  vk = params[:key].to_s
  allowed_keys = %w[
    bp_1 bp_2 bp_3
    pulse_1 pulse_2 pulse_3
    saturation_1 saturation_2 saturation_3
    fetal_heartbeat active_bleeding
  ]
  return { error: 'ключ' }.to_json unless allowed_keys.include?(vk)

  val = params[:value].to_s
  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  triage.set_red_arrest_vital!(vk, val)
  triage.reload
  pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name

  audit_action = case vk
                 when 'bp_1' then 'ra_vital_bp_1'
                 when 'bp_2' then 'ra_vital_bp_2'
                 when 'bp_3' then 'ra_vital_bp_3'
                 when 'pulse_1' then 'ra_vital_pulse_1'
                 when 'pulse_2' then 'ra_vital_pulse_2'
                 when 'pulse_3' then 'ra_vital_pulse_3'
                 when 'saturation_1' then 'ra_vital_saturation_1'
                 when 'saturation_2' then 'ra_vital_saturation_2'
                 when 'saturation_3' then 'ra_vital_saturation_3'
                 when 'fetal_heartbeat'
                   val.strip == 'no' ? 'ra_vital_fetal_heartbeat_no' : 'ra_vital_fetal_heartbeat_yes'
                 when 'active_bleeding'
                   val.strip == 'yes' ? 'ra_vital_active_bleeding_yes' : 'ra_vital_active_bleeding_no'
                 end
  if val.strip.present?
    TriageAuditEvent.log!(patient: patient, triage: triage, type: 'priority_action_marked',
                          payload: { action: audit_action, value: val.strip, performer_name: pname })
  end

  {
    success: true,
    can_complete: triage.can_complete_red_arrest?
  }.to_json
end

# Отметить действие как выполненное
post '/patients/:id/triage/actions/mark' do
  content_type :json
  
  patient = Patient.find(params[:id])
  triage = patient.triage
  
  if triage.nil?
    return { error: 'Триаж не найден' }.to_json
  end

  if triage.red_arrest_actions_flow?
    return { error: 'Этот приоритет использует отдельный сценарий действий' }.to_json
  end
  
  action_key = params[:action]
  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  triage.mark_action!(action_key)
  triage.reload
  pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name
  TriageAuditEvent.log!(patient: patient, triage: triage, type: 'priority_action_marked',
                        payload: { action: action_key, performer_name: pname })

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

  if triage.red_arrest_actions_flow?
    return { error: 'Этот приоритет использует отдельный сценарий действий' }.to_json
  end
  
  action_key = params[:action]
  
  # Нельзя снять финальное действие если уже завершено
  final_action = triage.final_action
  if final_action && action_key == final_action[:key] && triage.actions_completed?
    return { error: 'Действия уже завершены' }.to_json
  end
  
  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  triage.unmark_action!(action_key)
  triage.reload
  pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name
  TriageAuditEvent.log!(patient: patient, triage: triage, type: 'priority_action_unmarked',
                        payload: { action: action_key, performer_name: pname })

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
  
  action_uid = resolve_step_performer_user_id(params, patient)
  triage.set_step_performer_user!('actions', action_uid)
  if triage.complete_actions!
    triage.reload
    pname = acting_performer_name_for_user_id(action_uid) || patient.performer_name
    TriageAuditEvent.log!(patient: patient, triage: triage, type: 'actions_completed',
                          payload: { performer_name: pname, priority: triage.priority })
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
  if other_role_user?
    flash[:error] = 'Недостаточно прав: роль "Прочее" не может удалять пациентов.'
    redirect '/patients'
  end
  
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
    appeal_type: params[:appeal_type],
    pregnancy_unknown: params[:pregnancy_unknown] == '1'
  }
  if current_user.doctor_or_admin?
    patient_params[:performer_user_id] = resolve_patient_performer_user_id(params)
  end
  
  if params[:pregnancy_unknown] != '1' && params[:pregnancy_weeks].present?
    patient_params[:pregnancy_weeks] = params[:pregnancy_weeks].to_f
  else
    patient_params[:pregnancy_weeks] = nil
  end
  
  if patient.update(patient_params)
    TriageAuditEvent.log!(patient: patient, triage: patient.triage, type: 'patient_edited',
                          payload: { performer_name: patient.performer_name })
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
  enforce_other_patient_modify_permission!(@patient)
  
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
    flash[:error] = "Неверный номер шага"
    redirect "/patients"
  end
  
  # Проверяем, что данные для этого этапа есть
  if @step > @triage.step && !@triage.completed_at
    flash[:error] = "Этот шаг еще не был пройден"
    redirect "/patients"
  end

  @triage_edit_with_save_guard = true
  
  case @step
  when 1
    erb :triage_edit_step1
  when 2
    erb :triage_edit_step2
  when 3
    erb :triage_edit_step3
  end
end

# Предпросмотр приоритета после сохранения правок (для модального окна)
post '/patients/:id/triage/preview_step_update/:step' do |id, step|
  content_type :json
  patient = Patient.find(id)
  triage = patient.triage
  step_num = step.to_i
  enforce_other_patient_modify_permission!(patient, as_json: true)

  if triage.nil?
    halt 404, { ok: false, error: 'Триаж не найден' }.to_json
  end

  if triage.actions_completed?
    halt 403, { ok: false, error: 'Действия по приоритету завершены. Редактирование недоступно.' }.to_json
  end

  if step_num < 1 || step_num > 3
    halt 400, { ok: false, error: 'Неверный шаг' }.to_json
  end

  triage.preview_step_update(step_num, params).merge(ok: true).to_json
rescue ActiveRecord::RecordNotFound
  halt 404, { ok: false, error: 'Не найдено' }.to_json
end

post '/patients/:id/triage/update_step/:step' do |id, step|
  patient = Patient.find(id)
  triage = patient.triage
  step_num = step.to_i
  enforce_other_patient_modify_permission!(patient)
  
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
  before_data = Marshal.load(Marshal.dump(triage.step_data(step_num) || {}))

  triage.apply_update_step!(step_num, params)

  if triage.save
    triage.reload
    after_data = triage.step_data(step_num) || {}
    changed_fields = (before_data.keys.map(&:to_s) | after_data.keys.map(&:to_s)).filter_map do |k|
      b = before_data[k] || before_data[k.to_sym]
      a = after_data[k] || after_data[k.to_sym]
      next if b == a

      { field: k, before: b, after: a }
    end
    TriageAuditEvent.log!(patient: patient, triage: triage, type: 'triage_edit_saved',
                          payload: {
                            step: step_num,
                            priority: triage.priority,
                            performer_name: current_user&.full_name || patient.performer_name,
                            changed_fields: changed_fields
                          })

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
      flash[:notice] = "Данные шага #{step_num} обновлены. Переход к шагу #{triage.step}."
      redirect "/patients/#{patient.id}/triage/step#{triage.step}"
    end
  else
    flash[:error] = "Ошибка при обновлении данных"
    redirect "/patients/#{patient.id}/triage/edit_step/#{step_num}"
  end
end



