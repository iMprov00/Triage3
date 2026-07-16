# frozen_string_literal: true

# Полная статистика: период по admission_date, фильтры как у списка пациентов, пагинация.
class TriageDepartmentDetailedService
  MAX_PER_PAGE = 100
  DEFAULT_PER_PAGE = 25

  def self.call(params:, viewer:)
    p = params.symbolize_keys
    date_from = TriageDepartmentDashboardService.normalize_date(p[:date_from].presence || Date.today)
    date_to = TriageDepartmentDashboardService.normalize_date(p[:date_to].presence || date_from)
    date_to = date_from if date_to < date_from

    page = [p[:page].to_i, 1].max
    per_page = [[p[:per_page].to_i, DEFAULT_PER_PAGE].max, MAX_PER_PAGE].min
    per_page = DEFAULT_PER_PAGE if p[:per_page].blank? || p[:per_page].to_i <= 0

    rel = Patient.includes(:triage).where(admission_date: date_from..date_to)
    rel = rel.search(p[:search]) if p[:search].present?

    filter_params = p.except(:date_from, :date_to, :page, :per_page, :priority, :only_active, :controller, :action)
    rel = PatientsListService.apply_secondary_filters(rel, filter_params)

    triage_where = {}
    triage_where[:completed_at] = nil if p[:only_active].to_s == "1"
    if p[:priority].present? && Triage::PRIORITIES.key?(p[:priority].to_s)
      triage_where[:priority] = p[:priority].to_s
    end
    rel = rel.joins(:triage).where(triages: triage_where) if triage_where.any?

    id_scope = rel.except(:includes).unscope(:order).distinct.select(:id)
    total_count = Patient.where(id: id_scope).count
    summary = TriageDepartmentDashboardService.summary_for_patients(Patient.where(id: id_scope))
    rows = rel.order(admission_date: :desc, admission_time: :desc)
      .offset((page - 1) * per_page)
      .limit(per_page)
      .map { |pat| PatientListPresenter.to_list_hash(pat, viewer) }

    from_t = date_from.beginning_of_day.in_time_zone
    to_t = date_to.end_of_day.in_time_zone
    patient_id_scope = Patient.where(id: id_scope).select(:id)
    period_analytics = TriageDepartmentPeriodAnalytics.call(
      patient_id_scope: patient_id_scope,
      occurred_from: from_t,
      occurred_to: to_t
    )

    {
      date_from: date_from.to_s,
      date_to: date_to.to_s,
      page: page,
      per_page: per_page,
      total_count: total_count
    }.merge(summary).merge(period_analytics: period_analytics, rows: rows)
  end
end
