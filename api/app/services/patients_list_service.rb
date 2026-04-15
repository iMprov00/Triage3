# frozen_string_literal: true

# Логика списка пациентов (как build_merged_patients_list в Sinatra app.rb).
class PatientsListService
  def self.monitor_active_patients_scope(patients, params)
    rel = patients
    rel = rel.search(params[:search]) if params[:search].present?
    rel.joins(:triage).where(
      "triages.timer_active = :t OR (triages.completed_at IS NOT NULL AND triages.actions_completed_at IS NULL)",
      t: true
    )
  end

  def self.apply_admission_date_filter(patients, params)
    admission_date = params[:admission_date].presence || Date.today.to_s
    patients.where(patients: { admission_date: admission_date })
  end

  def self.apply_secondary_filters(patients, params)
    if params[:appeal_type].present? && params[:appeal_type] != "all"
      patients = patients.where(patients: { appeal_type: params[:appeal_type] })
    end

    if params[:pregnancy_condition].present?
      case params[:pregnancy_condition]
      when "unknown"
        patients = patients.where(patients: { pregnancy_unknown: true })
      when "less_12"
        patients = patients.where("patients.pregnancy_weeks < 12 AND patients.pregnancy_unknown = ?", false)
      when "12_28"
        patients = patients.where("patients.pregnancy_weeks >= 12 AND patients.pregnancy_weeks <= 28 AND patients.pregnancy_unknown = ?", false)
      when "more_28"
        patients = patients.where("patients.pregnancy_weeks > 28 AND patients.pregnancy_unknown = ?", false)
      end
    end

    if params[:performer_filter].present?
      patients = patients.where("patients.performer_name LIKE ?", "%#{params[:performer_filter]}%")
    end

    if params[:only_active] == "1"
      patients = patients.joins(:triage).where(triages: { completed_at: nil })
    end

    patients
  end

  def self.apply_filters(patients, params)
    patients = apply_admission_date_filter(patients, params)
    apply_secondary_filters(patients, params)
  end

  def self.merged_list(params)
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
end
