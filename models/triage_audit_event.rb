# frozen_string_literal: true

class TriageAuditEvent < ActiveRecord::Base
  belongs_to :patient
  belongs_to :triage, optional: true

  validates :event_type, presence: true
  validates :occurred_at, presence: true

  EVENT_TYPES = %w[
    patient_registered
    triage_started
    step1_submitted
    step2_submitted
    step3_submitted
    step_advanced
    priority_assigned
    timer_expired_auto_submit
    triage_edit_saved
    priority_action_marked
    priority_action_unmarked
    actions_completed
    patient_edited
    patient_deleted
  ].freeze

  EVENT_LABELS = {
    'patient_registered' => 'Пациент зарегистрирован',
    'triage_started' => 'Начат триаж (шаг 1)',
    'step1_submitted' => 'Сохранён шаг 1',
    'step2_submitted' => 'Сохранён шаг 2',
    'step3_submitted' => 'Сохранён шаг 3',
    'step_advanced' => 'Переход на следующий шаг',
    'priority_assigned' => 'Назначен приоритет',
    'timer_expired_auto_submit' => 'Автосохранение по истечении времени шага',
    'triage_edit_saved' => 'Сохранено редактирование шага',
    'priority_action_marked' => 'Отмечено действие приоритета',
    'priority_action_unmarked' => 'Снята отметка действия',
    'actions_completed' => 'Действия по приоритету завершены',
    'patient_edited' => 'Изменены данные пациента',
    'patient_deleted' => 'Пациент удалён'
  }.freeze

  # Подписи полей payload для отображения пользователю (русский)
  PAYLOAD_KEY_LABELS = {
    'full_name' => 'ФИО',
    'performer_name' => 'Исполнитель',
    'step' => 'Шаг триажа',
    'from_step' => 'С шага',
    'to_step' => 'На шаг',
    'advance_result' => 'Результат',
    'priority' => 'Приоритет',
    'limit_seconds' => 'Лимит времени на шаг',
    'seconds_used' => 'Фактически затрачено',
    'within_limit' => 'Уложился в лимит',
    'timer_expired' => 'Истёк таймер шага',
    'action' => 'Действие'
  }.freeze

  ADVANCE_RESULT_LABELS = {
    'priority_assigned' => 'Назначен приоритет (триаж завершён на этом шаге)',
    'step_advanced' => 'Переход на следующий шаг'
  }.freeze

  PAYLOAD_DISPLAY_KEY_ORDER = %w[
    full_name performer_name step from_step to_step advance_result priority
    limit_seconds seconds_used within_limit timer_expired action
  ].freeze

  def payload_hash
    return {} if payload.blank?

    JSON.parse(payload)
  rescue JSON::ParserError
    {}
  end

  def self.log!(patient:, triage: nil, type:, payload: {}, occurred_at: Time.current)
    p = payload.is_a?(Hash) ? payload : {}
    create!(
      patient_id: patient.id,
      triage_id: triage&.id,
      event_type: type.to_s,
      occurred_at: occurred_at,
      payload: p.to_json
    )
  rescue StandardError => e
    warn "[TriageAuditEvent] log failed: #{e}"
  end

  def self.log_step_submit!(patient, triage, step_num, advance_result, extra = {})
    return if advance_result.blank?

    triage.reload
    timing = Triage.step_timing_for_step(triage, step_num)
    base = {
      step: step_num,
      advance_result: advance_result,
      priority: triage.priority,
      performer_name: patient.performer_name
    }.merge(timing).merge(extra)

    log!(patient: patient, triage: triage, type: "step#{step_num}_submitted", payload: base)

    case advance_result
    when 'priority_assigned'
      log!(patient: patient, triage: triage, type: 'priority_assigned',
           payload: { priority: triage.priority, step: step_num, performer_name: patient.performer_name })
    when 'step_advanced'
      log!(patient: patient, triage: triage, type: 'step_advanced',
           payload: { from_step: step_num, to_step: step_num + 1, performer_name: patient.performer_name })
    end
  end
end
