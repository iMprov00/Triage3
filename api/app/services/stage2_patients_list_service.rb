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

    if @params[:appeal_type].present? && @params[:appeal_type] != "all"
      rel = rel.where(appeal_type: @params[:appeal_type])
    end

    if @params[:only_active].present? && @params[:only_active].to_s == "1"
      rel = rel.joins(stage2_case: :stage2_triage)
        .where(stage2_triages: { completed_at: nil })
        .where.not(stage2_triages: { current_phase: "exit" })
    end

    rel.order("stage2_cases.transferred_at DESC")
  end
end
