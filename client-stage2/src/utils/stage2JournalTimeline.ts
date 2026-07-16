import { formatActionDisplay } from "./actionDisplayText";
import { filterActionTimeline } from "./auditTimelineFilter";

export type JournalEvent = {
  id?: number;
  event_type: string;
  event_label?: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
  action_text?: string | null;
};

const WORKFLOW_EVENT_TYPES = new Set([
  "case_accepted",
  "pre_doctor_submitted",
  "doctor_examination_submitted",
  "decision_confirmed",
]);

function secToMin(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildStage2JournalTimeline(events: JournalEvent[]): JournalEvent[] {
  const workflow = events.filter((e) => WORKFLOW_EVENT_TYPES.has(e.event_type));
  const actions = filterActionTimeline(events);
  const seen = new Set<string>();
  const merged: JournalEvent[] = [];

  for (const ev of [...workflow, ...actions]) {
    const key = ev.id != null ? `id:${ev.id}` : `${ev.event_type}:${ev.occurred_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ev);
  }

  return merged.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

export function formatStage2JournalEventText(ev: JournalEvent): string {
  if (ev.event_type === "actions_completed") {
    return ev.event_label || "Действия этапа 2 завершены";
  }
  if (ev.event_type === "priority_action_marked") {
    return formatActionDisplay(ev);
  }
  if (ev.event_type === "pre_doctor_submitted" && ev.payload?.duration_seconds != null) {
    const label = ev.event_label || ev.event_type;
    return `${label} · ${secToMin(Number(ev.payload.duration_seconds))}`;
  }
  return ev.event_label || ev.event_type;
}

export function isStage2JournalActionEvent(eventType: string): boolean {
  return eventType === "priority_action_marked" || eventType === "actions_completed";
}
