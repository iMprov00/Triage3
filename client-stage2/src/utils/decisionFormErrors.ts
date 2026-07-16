export function focusDecisionFormError(message: string): void {
  const m = message.toLowerCase();

  window.requestAnimationFrame(() => {
    if (m.includes("комментар") || m.includes("приоритет")) {
      const note = document.getElementById("decision-priority-note");
      const section = document.getElementById("decision-priority-note-section");
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      section?.classList.add("triage-form-section--highlight");
      window.setTimeout(() => section?.classList.remove("triage-form-section--highlight"), 2600);
      if (note instanceof HTMLElement) {
        note.classList.add("triage-field--invalid");
        window.setTimeout(() => note.classList.remove("triage-field--invalid"), 2600);
        note.focus({ preventScroll: true });
      }
      return;
    }

    const grid = document.getElementById("decision-priority-grid");
    grid?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
