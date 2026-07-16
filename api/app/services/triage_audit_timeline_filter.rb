# frozen_string_literal: true

# Оставляет в итоговом журнале только действия, которые остались активными
# (снятые отметки и промежуточные переключения не показываются).
class TriageAuditTimelineFilter
  ACTION_EVENTS = %w[priority_action_marked priority_action_unmarked actions_completed].freeze

  def self.for_report(events)
    new(events).for_report
  end

  def initialize(events)
    @events = Array(events)
  end

  def for_report
    active = {}
    last_mark = {}
    completed = []

    sorted.each do |ev|
      type = event_type(ev)
      action = action_key(ev)

      case type
      when "priority_action_marked"
        next if action.blank?

        active[action] = true
        last_mark[action] = ev
      when "priority_action_unmarked"
        next if action.blank?

        active.delete(action)
        last_mark.delete(action)
      when "actions_completed"
        completed << ev
      end
    end

    marks = active.keys.filter_map { |key| last_mark[key] }
    (marks + completed).sort_by { |ev| occurred_at(ev) }
  end

  private

  def sorted
    @events.sort_by { |ev| occurred_at(ev) }
  end

  def event_type(ev)
    (ev.respond_to?(:event_type) ? ev.event_type : ev[:event_type]).to_s
  end

  def action_key(ev)
    payload = ev.respond_to?(:payload_hash) ? ev.payload_hash : (ev[:payload] || {})
    payload["action"].to_s.presence
  end

  def occurred_at(ev)
    t = ev.respond_to?(:occurred_at) ? ev.occurred_at : ev[:occurred_at]
    t.is_a?(String) ? Time.zone.parse(t) : t
  end
end
