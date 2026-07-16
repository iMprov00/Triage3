# frozen_string_literal: true

class Stage2CaseAcceptanceService
  class AcceptanceError < StandardError; end

  def self.accept!(patient:, user:)
    new(patient: patient, user: user).accept!
  end

  def initialize(patient:, user:)
    @patient = patient
    @user = user
    @case = patient.stage2_case
    @triage = patient.triage
  end

  def accept!
    raise AcceptanceError, "Пациент не на этапе 2" unless @case
    raise AcceptanceError, "Пациент уже принят" if @case.accepted_at.present?

    now = Time.current
    ActiveRecord::Base.transaction do
      @case.update!(accepted_at: now)
      @patient.update!(
        admission_date: now.to_date,
        admission_time: now
      )
      @case.update!(
        admission_date: now.to_date,
        admission_time: now
      )

      Stage2AuditEvent.log!(
        patient: @patient,
        stage2_case: @case,
        type: "case_accepted",
        payload: {
          accepted_at: now.iso8601,
          accepted_by_user_id: @user&.id,
          admission_date: now.to_date.to_s,
          admission_time: now.strftime("%H:%M")
        }
      )
    end

    @case.reload
    @patient.reload
    @case
  end
end
