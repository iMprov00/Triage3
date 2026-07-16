# frozen_string_literal: true

# Список пациентов по категории сводки (счётчики / воронка / приоритет).
class TriageDepartmentCohortService
  MAX_PER_PAGE = 100
  DEFAULT_PER_PAGE = 25

  CATEGORIES = %w[
    total_patients
    without_triage
    triage_in_progress
    step1
    step2
    step3
    in_actions_phase
    fully_completed
    step_timer_expired
    actions_timer_expired
    brigade_timer_expired
    priority
  ].freeze

  CATEGORY_LABELS = {
    "total_patients" => "Всего поступило",
    "without_triage" => "Без начатого триажа",
    "triage_in_progress" => "Триаж в процессе (на шагах)",
    "step1" => "Шаг 1",
    "step2" => "Шаг 2",
    "step3" => "Шаг 3",
    "in_actions_phase" => "Фаза действий по приоритету",
    "fully_completed" => "Полностью завершено",
    "step_timer_expired" => "Просрочка шага",
    "actions_timer_expired" => "Просрочка фазы действий",
    "brigade_timer_expired" => "Просрочка бригады",
    "priority" => "Завершённые полностью — приоритет"
  }.freeze

  PRIORITY_LABELS = Triage::PRIORITIES.transform_values { |h| h[:name] }.freeze

  def self.call(params:, viewer:)
    new(params, viewer).call
  end

  def initialize(params, viewer)
    @params = params.symbolize_keys
    @viewer = viewer
  end

  def call
    category = @params[:category].to_s
    return invalid_category unless CATEGORIES.include?(category)

    priority = @params[:priority].to_s.presence
    if category == "priority"
      return invalid_priority unless priority.present? && Triage::PRIORITIES.key?(priority)
    end

    page = [@params[:page].to_i, 1].max
    per_page = [[@params[:per_page].to_i, DEFAULT_PER_PAGE].max, MAX_PER_PAGE].min
    per_page = DEFAULT_PER_PAGE if @params[:per_page].blank? || @params[:per_page].to_i <= 0

    base = admission_scope
    filtered = TriageDepartmentDashboardService.patient_scope_for_category(base, category, priority: priority)
    total_count = filtered.distinct.count(:id)
    rows = filtered.includes(:triage)
      .order(admission_date: :desc, admission_time: :desc)
      .offset((page - 1) * per_page)
      .limit(per_page)
      .map { |pat| PatientListPresenter.to_list_hash(pat, @viewer) }

    {
      category: category,
      category_label: category_label(category, priority),
      priority: priority,
      date_from: date_from.to_s,
      date_to: date_to.to_s,
      page: page,
      per_page: per_page,
      total_count: total_count,
      rows: rows
    }
  end

  private

  def admission_scope
    Patient.where(admission_date: date_from..date_to)
  end

  def date_from
    @date_from ||= begin
      if @params[:date_from].present?
        TriageDepartmentDashboardService.normalize_date(@params[:date_from])
      else
        TriageDepartmentDashboardService.normalize_date(@params[:admission_date].presence || Date.today)
      end
    end
  end

  def date_to
    @date_to ||= begin
      raw = @params[:date_to].presence || @params[:admission_date].presence || date_from
      d = TriageDepartmentDashboardService.normalize_date(raw)
      d < date_from ? date_from : d
    end
  end

  def category_label(category, priority)
    if category == "priority" && priority.present?
      name = PRIORITY_LABELS[priority] || priority
      "#{CATEGORY_LABELS[category]}: #{name}"
    else
      CATEGORY_LABELS[category] || category
    end
  end

  def invalid_category
    { error: "Неизвестная категория сводки", valid_categories: CATEGORIES }
  end

  def invalid_priority
    { error: "Укажите приоритет для категории priority", valid_priorities: Triage::PRIORITIES.keys }
  end
end
