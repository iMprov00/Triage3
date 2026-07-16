type ActionEvent = {
  action_text?: string | null;
  payload?: Record<string, unknown>;
};

export function stripPriorityPrefix(text: string): string {
  return text.replace(/^(?:Красный|Желтый|Зел[её]ный|Фиолетовый|Оранжевый|Серый)\s*\([^)]+\):\s*/iu, "");
}

export function formatActionDisplay(ev: ActionEvent): string {
  let text = ev.action_text || String(ev.payload?.action || "—");
  text = stripPriorityPrefix(text);

  const value = ev.payload?.value;
  if (value != null && String(value).trim() !== "" && !text.includes(String(value))) {
    return `${text} — ${String(value)}`;
  }
  return text;
}
