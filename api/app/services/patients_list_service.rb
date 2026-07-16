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

  def self.apply_status_filter(patients, params)
    status = params[:status_filter].presence
    return patients if status.blank? || status == "all"

    case status
    when "not_started"
      patients.left_joins(:triage).where(triages: { id: nil })
    when "on_steps"
      patients.joins(:triage).where(triages: { completed_at: nil })
    when "in_actions"
      patients.joins(:triage)
        .where.not(triages: { completed_at: nil })
        .where(triages: { actions_completed_at: nil })
    when "completed"
      patients.joins(:triage).where.not(triages: { actions_completed_at: nil })
    else
      patients
    end
  end

  def self.apply_secondary_filters(patients, params)
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

    apply_status_filter(patients, params)
  end

  def self.apply_filters(patients, params)
    patients = apply_admission_date_filter(patients, params)
    apply_secondary_filters(patients, params)
  end

  def self.sort_list(list, params)
    sort = params[:sort].to_s
    case sort
    when "name_asc"
      list.sort_by { |p| p.full_name.to_s.downcase }
    when "name_desc"
      list.sort_by { |p| p.full_name.to_s.downcase }.reverse
    when "time_asc"
      list.sort_by { |p| sort_time_key(p) }
    when "time_desc"
      list.sort_by { |p| sort_time_key(p) }.reverse
    else
      list
    end
  end

  def self.sort_time_key(patient)
    date = patient.admission_date&.to_s || ""
    time = patient.admission_time.to_s
    [date, time]
  end

  def self.merged_list(params)
    status = params[:status_filter].presence
    use_active_pin = status.blank? || status == "all"
    sort = params[:sort].to_s

    if use_active_pin && sort.blank?
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

      return active_list + rest_list
    end

    rel = Patient.includes(:triage)
    rel = rel.search(params[:search]) if params[:search].present?
    rel = apply_filters(rel, params)
    list = rel.order(admission_date: :desc, admission_time: :desc).limit(100).to_a
    sort_list(list, params)
  end
end
