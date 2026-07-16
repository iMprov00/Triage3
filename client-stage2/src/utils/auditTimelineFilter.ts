type TimelineEvent = {
  id?: number;
  event_type: string;
  occurred_at: string;
  event_label?: string;
  payload?: Record<string, unknown>;
  action_text?: string | null;
};

export function filterAuditTimelineForReport(events: TimelineEvent[]): TimelineEvent[] {
  const active = new Set<string>();
  const lastMark = new Map<string, TimelineEvent>();
  const completed: TimelineEvent[] = [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );

  for (const ev of sorted) {
    const action = String(ev.payload?.action || "");

    if (ev.event_type === "priority_action_marked") {
      if (!action) continue;
      active.add(action);
      lastMark.set(action, ev);
    } else if (ev.event_type === "priority_action_unmarked") {
      if (!action) continue;
      active.delete(action);
      lastMark.delete(action);
    } else if (ev.event_type === "actions_completed") {
      completed.push(ev);
    }
  }

  const marks = [...active].map((key) => lastMark.get(key)).filter((ev): ev is TimelineEvent => Boolean(ev));
  return [...marks, ...completed].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
}

export function filterActionTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const actionEvents = events.filter((e) =>
    ["priority_action_marked", "priority_action_unmarked", "actions_completed"].includes(e.event_type),
  );
  return filterAuditTimelineForReport(actionEvents);
}
