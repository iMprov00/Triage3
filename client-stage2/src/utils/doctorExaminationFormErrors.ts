export function focusDoctorExaminationFormError(message: string): void {
  const m = message.split(";")[0].trim().toLowerCase();
  let sectionId: string | null = null;
  let fieldId: string | undefined;

  if (m.includes("ктг")) {
    sectionId = "doctor-exam-ctg";
    if (m.includes("базальн")) fieldId = "ctg-basal-hr";
  } else if (m.includes("узи") || m.includes("нарушен")) {
    sectionId = "doctor-exam-ultrasound";
    if (m.includes("нарушен")) fieldId = "ultrasound-disorders-text";
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

    if (fieldId) {
      const input = document.getElementById(fieldId);
      if (input instanceof HTMLElement) {
        input.classList.add("triage-field--invalid");
        window.setTimeout(() => input.classList.remove("triage-field--invalid"), 2600);
        input.focus({ preventScroll: true });
      }
    }
  });
}
