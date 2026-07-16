const FIELD_IDS: Record<string, string> = {
  respiratory_rate: "triage-step3-respiratory_rate",
  saturation: "triage-step3-saturation",
  systolic_bp: "triage-step3-systolic_bp",
  diastolic_bp: "triage-step3-diastolic_bp",
  heart_rate: "triage-step3-heart_rate",
  temperature: "triage-step3-temperature",
};

export function focusTriageStep3FormError(message: string): void {
  const m = message.split(";")[0].trim().toLowerCase();
  let fieldKey: string | undefined;

  if (m.includes("чдд") || m.includes("дыхатель")) fieldKey = "respiratory_rate";
  else if (m.includes("сатурац")) fieldKey = "saturation";
  else if (m.includes("систолическ")) fieldKey = "systolic_bp";
  else if (m.includes("диастолическ")) fieldKey = "diastolic_bp";
  else if (m.includes("чсс") || m.includes("пульс")) fieldKey = "heart_rate";
  else if (m.includes("температур")) fieldKey = "temperature";

  window.requestAnimationFrame(() => {
    const section = document.getElementById("triage-step3-vitals");
    section?.scrollIntoView({ behavior: "smooth", block: "center" });
    section?.classList.add("triage-form-section--highlight");
    window.setTimeout(() => section?.classList.remove("triage-form-section--highlight"), 2600);

    if (fieldKey) {
      const input = document.getElementById(FIELD_IDS[fieldKey]);
      if (input instanceof HTMLElement) {
        input.classList.add("triage-field--invalid");
        window.setTimeout(() => input.classList.remove("triage-field--invalid"), 2600);
        input.focus({ preventScroll: true });
      }
    }
  });
}
