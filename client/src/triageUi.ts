/** Лимит таймера шага (сек.) — из API или по номеру шага (как в Triage::STEPS). */
export function triageStepMaxSeconds(triage: Record<string, unknown> | null | undefined): number {
  if (!triage) return 120;
  const m = triage.max_time;
  if (typeof m === "number" && m > 0) return m;
  const step = Number(triage.step);
  if (step === 2) return 300;
  if (step === 3) return 600;
  return 120;
}

/** Маршрут `/patients/:id/triage/edit/:step` — редактирование уже сохранённого шага. */
export function triagePathIsEditMode(pathname: string, step: 1 | 2 | 3): boolean {
  return pathname.includes(`/triage/edit/${step}`);
}

/** Активный маршрут шага триажа (не режим правки). */
export function triageActiveStepPath(patientId: string, step: number): string {
  if (step === 1) return `/patients/${patientId}/triage`;
  if (step === 2) return `/patients/${patientId}/triage/step2`;
  return `/patients/${patientId}/triage/step3`;
}

/** Есть ли данные по шагу (как на списке пациентов для кнопки «Редактировать шаг»). */
export function triageHasSavedStepData(triage: Record<string, unknown>, step: 1 | 2 | 3): boolean {
  const st = Number(triage.step);
  if (step === 1) {
    const d = (triage.step1_data as Record<string, unknown>) || {};
    return Object.keys(d).length > 0 || st >= 1;
  }
  if (step === 2) {
    const d = (triage.step2_data as Record<string, unknown>) || {};
    return Object.keys(d).length > 0 || st >= 2;
  }
  const d = (triage.step3_data as Record<string, unknown>) || {};
  return Object.keys(d).length > 0 || st >= 3;
}

export type TriageStepEditPreview = {
  ok: boolean;
  error?: string;
  priority_changed?: boolean;
  current_priority_label?: string;
  new_priority_label?: string;
};

export type TriageStepEditUpdateResponse = {
  ok: boolean;
  error?: string;
  triage?: Record<string, unknown>;
  notice_hint?: string;
  next_step?: number | null;
};
