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
