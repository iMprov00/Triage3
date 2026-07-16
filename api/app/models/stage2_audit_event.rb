# frozen_string_literal: true

class Stage2AuditEvent < ApplicationRecord
  belongs_to :patient
  belongs_to :stage2_case, optional: true

  EVENT_LABELS = {
    "transferred" => "Пациент принят на этап 2",
    "phase_advanced" => "Переход на следующую фазу",
    "case_removed" => "Пациент снят с этапа 2",
    "patient_edited" => "Карта пациента изменена",
    "pre_doctor_submitted" => "Доврачебный осмотр завершён",
    "doctor_examination_submitted" => "Врачебный осмотр завершён",
    "priority_assigned" => "Назначен приоритет этапа 2",
    "suggested_priority_computed" => "Рассчитана рекомендация приоритета",
    "decision_confirmed" => "Подтверждён приоритет этапа 2",
    "priority_action_marked" => "Отмечено действие по приоритету",
    "priority_action_unmarked" => "Снята отметка действия",
    "actions_completed" => "Действия этапа 2 завершены",
    "case_accepted" => "Пациент принят в отделении"
  }.freeze

  def payload_hash
    return {} if payload.blank?

    JSON.parse(payload)
  rescue JSON::ParserError
    {}
  end

  def self.log!(patient:, stage2_case: nil, type:, payload: {})
    create!(
      patient: patient,
      stage2_case: stage2_case,
      event_type: type.to_s,
      payload: payload.is_a?(Hash) ? payload.to_json : payload.to_s,
      occurred_at: Time.current
    )
  end
end
