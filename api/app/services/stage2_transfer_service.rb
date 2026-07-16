# frozen_string_literal: true

class Stage2TransferService
  class TransferError < StandardError; end

  def self.transfer!(patient:, source:, user:)
    new(patient: patient, source: source, user: user).transfer!
  end

  def initialize(patient:, source:, user:)
    @patient = patient
    @source = source.to_s
    @user = user
  end

  def transfer!
    return @patient.stage2_case if @patient.stage2_case.present?

    triage = @patient.triage
    unless triage&.stage2_handoff_at || triage&.actions_completed_at
      raise TransferError, "Действия этапа 1 не завершены"
    end

    unless triage.stage2_eligible?
      raise TransferError, "Пациенты с красным и фиолетовым приоритетом не передаются на этап 2"
    end

    now = Time.current
    case_record = nil
    ActiveRecord::Base.transaction do
      case_record = Stage2Case.create!(
        patient: @patient,
        stage1_triage: triage,
        transferred_at: now,
        transfer_source: @source.in?(Stage2Case::TRANSFER_SOURCES) ? @source : "manual",
        admission_date: @patient.admission_date,
        admission_time: @patient.admission_time,
        performer_user_id: @patient.performer_user_id,
        performer_name: @patient.performer_name,
        created_by_user_id: @user&.id,
        accepted_at: nil
      )

      Stage2Triage.create!(
        stage2_case: case_record,
        current_phase: "pre_doctor",
        priority: "pending",
        phase_data: {},
        started_at: now,
        timer_active: false,
        start_time: now
      )

      Stage2AuditEvent.log!(
        patient: @patient,
        stage2_case: case_record,
        type: "transferred",
        payload: {
          transfer_source: case_record.transfer_source,
          stage1_priority: triage.priority,
          performer_name: case_record.performer_name
        }
      )
    end

    case_record.reload
  end
end
