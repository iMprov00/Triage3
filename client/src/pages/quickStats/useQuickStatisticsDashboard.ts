import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../api";

export type DashboardCounts = {
  total_patients: number;
  without_triage: number;
  triage_in_progress: number;
  step1: number;
  step2: number;
  step3: number;
  in_actions_phase: number;
  fully_completed: number;
};

export type DashboardAlerts = {
  step_timer_expired: number;
  actions_timer_expired: number;
  brigade_timer_expired: number;
};

export type DashboardResponse = {
  as_of: string;
  admission_date: string;
  counts: DashboardCounts;
  priority_breakdown: Record<string, number>;
  alerts: DashboardAlerts;
};

export function useQuickStatisticsDashboard() {
  const [admissionDate, setAdmissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiJson<DashboardResponse>(
        `/api/v1/statistics/dashboard?admission_date=${encodeURIComponent(admissionDate)}`,
      );
      setData(r);
      setErr("");
    } catch {
      setErr("Не удалось загрузить сводку");
      setData(null);
    }
  }, [admissionDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return { admissionDate, setAdmissionDate, data, err, load };
}
