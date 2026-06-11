import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiJson } from "../api";
import PreDoctorStepPage from "./PreDoctorStepPage";
import WorkflowStubPage from "./WorkflowStubPage";

type TriageState = {
  workflow_route: string;
};

export default function Stage2WorkflowRouter() {
  const { patientId } = useParams();
  const [route, setRoute] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      try {
        const t = await apiJson<TriageState>(`/api/v1/stage2/patients/${patientId}/triage`);
        setRoute(t.workflow_route);
        setErr("");
      } catch {
        setErr("Не удалось определить этап");
        setRoute("error");
      }
    })();
  }, [patientId]);

  if (!route) {
    return (
      <div className="text-muted py-4 text-center" role="status">
        Загрузка…
      </div>
    );
  }

  if (route === "error") {
    return <div className="alert alert-warning">{err}</div>;
  }

  if (route === "priority_actions") {
    return <Navigate to={`/patients/${patientId}/priority-actions`} replace />;
  }

  if (route === "pre_doctor") {
    return <PreDoctorStepPage />;
  }

  return <WorkflowStubPage />;
}
