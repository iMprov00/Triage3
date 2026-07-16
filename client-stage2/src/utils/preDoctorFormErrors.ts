export type PreDoctorErrorFocus = {
  sectionId: string;
  fieldKeys?: string[];
  fieldId?: string;
  highlightCheckbox?: boolean;
};

export function resolvePreDoctorErrorFocus(message: string): PreDoctorErrorFocus | null {
  const m = message.split(";")[0].trim().toLowerCase();

  if (
    m.includes("диастолическ") ||
    m.includes("систолическ") ||
    m.includes("сатурац") ||
    m.includes("чсс") ||
    m.includes("чд") ||
    m.includes("витал")
  ) {
    const fieldKeys: string[] = [];
    if (m.includes("систолическ") || m.includes("диастолическ")) {
      fieldKeys.push("systolic_bp", "diastolic_bp");
    } else if (m.includes("сатурац")) {
      fieldKeys.push("saturation");
    } else if (m.includes("чсс")) {
      fieldKeys.push("heart_rate");
    } else if (m.includes("чд")) {
      fieldKeys.push("respiratory_rate");
    }
    return { sectionId: "pre-doctor-vitals", fieldKeys: fieldKeys.length ? fieldKeys : undefined };
  }
  if (m.includes("ваш") || m.includes("боль")) {
    return { sectionId: "pre-doctor-pain" };
  }
  if (m.includes("сып") || m.includes("опишите сыпь")) {
    return { sectionId: "pre-doctor-rash" };
  }
  if (m.includes("отёк") || m.includes("отек") || m.includes("локализац")) {
    return { sectionId: "pre-doctor-edema" };
  }
  if (m.includes("кожн")) {
    return { sectionId: "pre-doctor-skin", fieldId: "pre-doctor-skin-color" };
  }
  if (m.includes("схватк")) {
    return { sectionId: "pre-doctor-uterine" };
  }
  if (m.includes("выделен")) {
    return { sectionId: "pre-doctor-discharge" };
  }
  if (m.includes("сердцебиен") || m.includes("плод")) {
    return { sectionId: "pre-doctor-fhr" };
  }
  if (m.includes("тонус") || m.includes("матк")) {
    return { sectionId: "pre-doctor-uterine" };
  }

  if (m.includes("врач")) {
    return { sectionId: "pre-doctor-doctor-call", fieldId: "pre-doctor-doctor-called", highlightCheckbox: true };
  }

  return null;
}

function markInvalid(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.classList.add("triage-field--invalid");
  window.setTimeout(() => el.classList.remove("triage-field--invalid"), 2600);
}

export function focusPreDoctorFormError(message: string): void {
  const focus = resolvePreDoctorErrorFocus(message);
  const section = focus ? document.getElementById(focus.sectionId) : null;

  window.requestAnimationFrame(() => {
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.classList.add("triage-form-section--highlight");
      window.setTimeout(() => section.classList.remove("triage-form-section--highlight"), 2600);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (focus?.fieldKeys?.length) {
      for (const key of focus.fieldKeys) {
        markInvalid(document.getElementById(`pre-doctor-field-${key}`));
      }
      const first = document.getElementById(`pre-doctor-field-${focus.fieldKeys[0]}`);
      if (first instanceof HTMLElement) first.focus({ preventScroll: true });
    }

    if (focus?.fieldId) {
      const input = document.getElementById(focus.fieldId);
      markInvalid(input);
      if (focus.highlightCheckbox) {
        markInvalid(input?.closest(".triage-check-item") ?? null);
      }
      if (input instanceof HTMLElement) input.focus({ preventScroll: true });
    }
  });
}
