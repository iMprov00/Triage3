# frozen_string_literal: true

class Stage2EligiblePatientsService
  def self.call(params = {})
    new(params).call
  end

  def initialize(params)
    @params = params
  end

  def call
    rel = Patient.joins(:triage)
      .left_joins(:stage2_case)
      .where(stage2_cases: { id: nil })
      .where(
        "triages.actions_completed_at IS NOT NULL OR triages.stage2_handoff_at IS NOT NULL"
      )
      .where(triages: { priority: Triage::STAGE2_ELIGIBLE_PRIORITIES })

    if @params[:search].present?
      rel = rel.merge(Patient.search(@params[:search]))
    end

    if @params[:admission_date].present?
      rel = rel.where(admission_date: @params[:admission_date])
    end

    rel.order("triages.actions_completed_at DESC").limit(100)
  end
end
