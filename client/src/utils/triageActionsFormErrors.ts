export function focusTriageActionsFormError(_message: string): void {
  window.requestAnimationFrame(() => {
    const section = document.getElementById("triage-actions-list");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.classList.add("triage-form-section--highlight");
      window.setTimeout(() => section.classList.remove("triage-form-section--highlight"), 2600);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}
