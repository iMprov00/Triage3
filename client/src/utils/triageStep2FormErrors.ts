export function focusTriageStep2FormError(message: string): void {
  const m = message.split(";")[0].trim().toLowerCase();
  let sectionId: string | null = null;

  if (m.includes("положен")) {
    sectionId = "triage-step2-position";
  } else if (m.includes("неотлож") || m.includes("критер")) {
    sectionId = "triage-step2-urgency";
  } else if (m.includes("инфекц")) {
    sectionId = "triage-step2-infection";
  }

  window.requestAnimationFrame(() => {
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.classList.add("triage-form-section--highlight");
      window.setTimeout(() => section.classList.remove("triage-form-section--highlight"), 2600);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}
