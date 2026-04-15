# models/patient.rb
class Patient < ApplicationRecord
  include BroadcastsRealtime

  belongs_to :created_by_user, class_name: 'User', optional: true
  belongs_to :performer_user, class_name: 'User', optional: true

  has_one :triage, dependent: :destroy
  has_many :triage_audit_events, dependent: :delete_all

  before_validation :sync_performer_name_from_user

  validates :full_name, presence: true
  validates :admission_date, presence: true
  validates :admission_time, presence: true
  validates :birth_date, presence: true
  validates :performer_name, presence: true
  validates :appeal_type, presence: true
  
  # Константы для видов обращения
  APPEAL_TYPES = [
    'Плановая госпитализация по направлению',
    'Самообращение',
    'СМП',
    'ДКЦ'
  ].freeze
  
  after_create :log_patient_registration_audit

  # Метод для поиска по всем полям
  def self.search(query)
    if query.present?
      where(
        "patients.full_name LIKE ? OR patients.performer_name LIKE ? OR CAST(patients.id AS TEXT) LIKE ?",
        "%#{query}%", "%#{query}%", "%#{query}%"
      )
    else
      all
    end
  end
  
  # Метод для фильтрации
  def self.filter(params)
    patients = all
    
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
  
  # Метод для получения строкового представления срока беременности
  def pregnancy_display
    if pregnancy_unknown
      "Неизвестно"
    elsif pregnancy_weeks.present?
      "#{pregnancy_weeks} недель"
    else
      "Не указано"
    end
  end
  
  # Форматированное время поступления (только HH:MM)
  def admission_time_formatted
    admission_time&.strftime("%H:%M")
  end

  # Исполнитель этапов по умолчанию: кто завёл карту, иначе ответственный по карте
  def default_step_performer_user_id
    created_by_user_id || performer_user_id
  end

  # Создаёт запись триажа при явном «Начать триаж» из списка (не при регистрации пациента).
  def start_triage!
    return triage if triage.present?

    Triage.create!(
      patient_id: id,
      start_time: Time.current,
      timer_active: true
    )
  end

  private

  def sync_performer_name_from_user
    return unless performer_user_id.present?

    u = performer_user
    self.performer_name = u.full_name if u
  end

  def log_patient_registration_audit
    TriageAuditEvent.log!(
      patient: self,
      triage: nil,
      type: 'patient_registered',
      payload: { full_name: full_name, performer_name: performer_name }
    )
  end
end