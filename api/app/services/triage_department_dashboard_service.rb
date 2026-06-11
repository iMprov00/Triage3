# frozen_string_literal: true

# Агрегаты «состояние триажного отделения» на дату поступления (как фильтр списка пациентов).
class TriageDepartmentDashboardService
  ACTIONS_LIMIT_SEC = Triage::ACTIONS_TIME_LIMIT
  # Для просрочки бригады в сводке используем типичный лимит 12 мин (как дефолт в Triage#brigade_time_limit без timer_action).
  BRIGADE_DEFAULT_SEC = 720

  def self.sqlite_adapter?
    ActiveRecord::Base.connection.adapter_name.match?(/sqlite/i)
  end

  # SQLite не поддерживает PostgreSQL-синтаксис `interval '1 second'`.
  def self.step_timer_expired_sql
    if sqlite_adapter?
      Arel.sql(
        "datetime(triages.start_time, '+' || (CASE triages.step WHEN 1 THEN 120 WHEN 2 THEN 300 WHEN 3 THEN 600 ELSE 120 END) || ' seconds') < datetime('now')"
      )
    else
      Arel.sql(
        "(triages.start_time + (CASE triages.step WHEN 1 THEN 120 WHEN 2 THEN 300 WHEN 3 THEN 600 ELSE 120 END) * interval '1 second') < CURRENT_TIMESTAMP"
      )
    end
  end

  def self.actions_timer_expired_sql
    n = ACTIONS_LIMIT_SEC.to_i
    if sqlite_adapter?
      Arel.sql("datetime(triages.actions_started_at, '+' || #{n} || ' seconds') < datetime('now')")
    else
      Arel.sql("(triages.actions_started_at + interval '#{n} seconds') < CURRENT_TIMESTAMP")
    end
  end

  def self.brigade_timer_expired_sql
    n = BRIGADE_DEFAULT_SEC.to_i
    if sqlite_adapter?
      Arel.sql("datetime(triages.brigade_called_at, '+' || #{n} || ' seconds') < datetime('now')")
    else
      Arel.sql("(triages.brigade_called_at + interval '#{n} seconds') < CURRENT_TIMESTAMP")
    end
  end

  def self.call(admission_date:)
    date = normalize_date(admission_date)
    base = Patient.where(admission_date: date)
    summary = summary_for_patients(base)

    {
      as_of: Time.current.iso8601(3),
      admission_date: date.to_s
    }.merge(summary)
  end

  # Ожидается scope Patient (уже с фильтрами по дате поступления и т.д.).
  def self.summary_for_patients(base)
    total = base.count
    no_triage = base.left_outer_joins(:triage).where(triages: { id: nil }).count

    with_triage = base.joins(:triage)
    triage_open = with_triage.where(triages: { completed_at: nil })

    step1 = triage_open.where(triages: { step: 1 }).count
    step2 = triage_open.where(triages: { step: 2 }).count
    step3 = triage_open.where(triages: { step: 3 }).count

    in_actions = with_triage.where.not(triages: { completed_at: nil }).where(triages: { actions_completed_at: nil })
    fully_done = with_triage.where.not(triages: { actions_completed_at: nil })

    priority_breakdown = fully_done.group("triages.priority").count.transform_keys(&:to_s)

    step_timer_expired = triage_open.where(triages: { timer_active: true }).where(step_timer_expired_sql).count

    actions_timer_expired = in_actions.where.not(triages: { actions_started_at: nil }).where(actions_timer_expired_sql).count

    brigade_timer_expired = in_actions.where.not(triages: { brigade_called_at: nil }).where(brigade_timer_expired_sql).count

    {
      counts: {
        total_patients: total,
        without_triage: no_triage,
        triage_in_progress: triage_open.count,
        step1: step1,
        step2: step2,
        step3: step3,
        in_actions_phase: in_actions.count,
        fully_completed: fully_done.count
      },
      priority_breakdown: priority_breakdown,
      alerts: {
        step_timer_expired: step_timer_expired,
        actions_timer_expired: actions_timer_expired,
        brigade_timer_expired: brigade_timer_expired
      }
    }
  end

  def self.normalize_date(value)
    return value if value.is_a?(Date)

    Date.parse(value.to_s)
  rescue ArgumentError, TypeError
    Date.today
  end
end
