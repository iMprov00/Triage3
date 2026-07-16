# frozen_string_literal: true

class Stage2PatientsListService
  def self.list(params)
    new(params).list
  end

  def initialize(params)
    @params = params
  end

  def list
    rel = Patient.joins(:stage2_case).includes(stage2_case: :stage2_triage)
    rel = rel.merge(Stage2Case.all)

    if @params[:admission_date].present?
      rel = rel.where(stage2_cases: { admission_date: @params[:admission_date] })
    end

    if @params[:search].present?
      rel = rel.merge(Patient.search(@params[:search]))
    end

    rel = apply_status_filter(rel)
    rel = apply_step_filter(rel)

    rel.order("stage2_cases.transferred_at DESC")
  end

  private

  PRE_DOCTOR_DONE = "json_extract(stage2_triages.phase_data, '$.pre_doctor.completed_at') IS NOT NULL"
  PRE_DOCTOR_NOT_DONE = "json_extract(stage2_triages.phase_data, '$.pre_doctor.completed_at') IS NULL"
  DOCTOR_DONE = <<~SQL.squish
    (
      json_extract(stage2_triages.phase_data, '$.doctor.completed_at') IS NOT NULL
      OR json_extract(stage2_triages.phase_data, '$.decision.completed_at') IS NOT NULL
      OR (
        stage2_triages.priority NOT IN ('pending', '')
        AND stage2_triages.priority IS NOT NULL
        AND json_extract(stage2_triages.phase_data, '$.decision') IS NOT NULL
        AND json_extract(stage2_triages.phase_data, '$.decision') != '{}'
      )
    )
  SQL
  DECISION_DONE = <<~SQL.squish
    (
      json_extract(stage2_triages.phase_data, '$.decision.completed_at') IS NOT NULL
      OR (
        #{PRE_DOCTOR_DONE}
        AND stage2_triages.priority NOT IN ('pending', '')
        AND stage2_triages.priority IS NOT NULL
        AND (
          json_extract(stage2_triages.phase_data, '$.decision') IS NULL
          OR json_extract(stage2_triages.phase_data, '$.decision') = '{}'
        )
      )
    )
  SQL

  def with_triage(rel)
    return rel if triage_joined?(rel)

    rel.joins(stage2_case: :stage2_triage)
  end

  def triage_joined?(rel)
    rel.joins_values.any? do |join|
      join.is_a?(Hash) && (join[:stage2_case] == :stage2_triage || join["stage2_case"] == :stage2_triage)
    end
  end

  def apply_step_filter(rel)
    case @params[:step].to_s
    when "not_accepted"
      rel.where(stage2_cases: { accepted_at: nil })
    when "step1"
      with_triage(rel)
        .where.not(stage2_cases: { accepted_at: nil })
        .where(PRE_DOCTOR_NOT_DONE)
        .where(stage2_triages: { actions_completed_at: nil })
    when "step2"
      with_triage(rel)
        .where(PRE_DOCTOR_DONE)
        .where("NOT (#{DOCTOR_DONE})")
        .where(stage2_triages: { actions_completed_at: nil })
    when "step3"
      with_triage(rel)
        .where(DOCTOR_DONE)
        .where("NOT (#{DECISION_DONE})")
        .where(stage2_triages: { actions_completed_at: nil })
    when "actions"
      with_triage(rel)
        .where(DECISION_DONE)
        .where.not(stage2_triages: { priority: "pending" })
        .where(stage2_triages: { actions_completed_at: nil })
    when "completed"
      with_triage(rel).where.not(stage2_triages: { actions_completed_at: nil })
    else
      rel
    end
  end

  def apply_status_filter(rel)
    case @params[:status].to_s
    when "except_completed"
      rel.joins(stage2_case: :stage2_triage).where(stage2_triages: { actions_completed_at: nil })
    when "not_accepted"
      rel.where(stage2_cases: { accepted_at: nil })
    when "active"
      rel.joins(stage2_case: :stage2_triage)
        .where.not(stage2_cases: { accepted_at: nil })
        .where(stage2_triages: { actions_completed_at: nil })
    else
      rel
    end
  end
end
