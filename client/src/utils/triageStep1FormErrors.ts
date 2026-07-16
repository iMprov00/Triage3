export function focusTriageStep1FormError(message: string): void {
  const m = message.split(";")[0].trim().toLowerCase();
  let sectionId: string | null = null;

  if (m.includes("глаз") || m.includes("реч") || m.includes("двигат") || m.includes("gcs") || m.includes("сознан")) {
    sectionId = "triage-step1-gcs";
  } else if (m.includes("дыхан")) {
    sectionId = "triage-step1-breathing";
  } else if (m.includes("сердцебиен")) {
    sectionId = "triage-step1-heartbeat";
  } else if (m.includes("судорог")) {
    sectionId = "triage-step1-seizures";
  } else if (m.includes("кровотеч")) {
    sectionId = "triage-step1-bleeding";
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
