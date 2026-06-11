# frozen_string_literal: true

# Агрегаты «за период» для полной статистики: аудит шагов, фактические длительности фаз, гистограмма завершённых шагов.
class TriageDepartmentPeriodAnalytics
  STEP_SUBMIT_TYPES = %w[step1_submitted step2_submitted step3_submitted].freeze

  def self.sqlite_adapter?
    ActiveRecord::Base.connection.adapter_name.match?(/sqlite/i)
  end

  # patient_id_scope: relation вида Patient.where(id: ...).select(:id)
  # occurred_from / occurred_to: TimeWithZone — фильтр событий аудита по occurred_at
  def self.call(patient_id_scope:, occurred_from:, occurred_to:)
    steps_sql = <<~SQL.squish
      (CASE WHEN triages.step1_completed_at IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN triages.step2_completed_at IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN triages.step3_completed_at IS NOT NULL THEN 1 ELSE 0 END)
    SQL

    raw_hist = Triage.where(patient_id: patient_id_scope).group(Arel.sql(steps_sql)).count
    steps_completed = (0..3).index_with { |i| raw_hist[i] || raw_hist[i.to_s] || 0 }

    step_timer_overdue_submits = step_overdue_audit_count(patient_id_scope, occurred_from, occurred_to)
    actions_phase_over_limit = actions_completed_over_limit_count(patient_id_scope)
    brigade_phase_over_limit = brigade_completed_over_limit_count(patient_id_scope)

    {
      steps_completed_histogram: steps_completed.transform_keys(&:to_s),
      step_timer_overdue_submits: step_timer_overdue_submits,
      actions_phase_completed_over_limit: actions_phase_over_limit,
      brigade_phase_completed_over_limit: brigade_phase_over_limit,
      audit_occurred_from: occurred_from.iso8601(3),
      audit_occurred_to: occurred_to.iso8601(3)
    }
  end

  def self.step_overdue_audit_count(patient_id_scope, occurred_from, occurred_to)
    TriageAuditEvent.where(patient_id: patient_id_scope)
      .where(occurred_at: occurred_from..occurred_to)
      .where(event_type: STEP_SUBMIT_TYPES)
      .where(audit_step_overdue_sql)
      .count
  end

  def self.audit_step_overdue_sql
    if sqlite_adapter?
      Arel.sql(
        "(json_extract(triage_audit_events.payload, '$.within_limit') = 0 OR " \
        "json_extract(triage_audit_events.payload, '$.within_limit') = 'false' OR " \
        "json_extract(triage_audit_events.payload, '$.timer_expired') = 1 OR " \
        "json_extract(triage_audit_events.payload, '$.timer_expired') = 'true')"
      )
    else
      Arel.sql(
        "((triage_audit_events.payload::jsonb ->> 'within_limit') IN ('false', 'f', '0') OR " \
        "(triage_audit_events.payload::jsonb ->> 'timer_expired') IN ('true', 't', '1'))"
      )
    end
  end

  def self.actions_completed_over_limit_count(patient_id_scope)
    lim = Triage::ACTIONS_TIME_LIMIT
    rel = Triage.where(patient_id: patient_id_scope).where.not(actions_started_at: nil, actions_completed_at: nil)
    if sqlite_adapter?
      rel.where(Arel.sql("(strftime('%s', actions_completed_at) - strftime('%s', actions_started_at)) > #{lim.to_i}")).count
    else
      rel.where(Arel.sql("EXTRACT(EPOCH FROM (actions_completed_at - actions_started_at)) > #{lim.to_i}")).count
    end
  end

  # Превышение лимита бригады по факту: от вызова бригады до завершения фазы действий (оценка, лимит как в сводке 12 мин).
  def self.brigade_completed_over_limit_count(patient_id_scope)
    lim = TriageDepartmentDashboardService::BRIGADE_DEFAULT_SEC
    rel = Triage.where(patient_id: patient_id_scope).where.not(brigade_called_at: nil, actions_completed_at: nil)
    if sqlite_adapter?
      rel.where(Arel.sql("(strftime('%s', actions_completed_at) - strftime('%s', brigade_called_at)) > #{lim.to_i}")).count
    else
      rel.where(Arel.sql("EXTRACT(EPOCH FROM (actions_completed_at - brigade_called_at)) > #{lim.to_i}")).count
    end
  end
end
