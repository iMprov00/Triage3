import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { apiJson } from "./api";
import LoginPage from "./pages/LoginPage";
import PatientsPage from "./pages/PatientsPage";
import PatientFormPage from "./pages/PatientFormPage";
import Stage2WorkflowRouter from "./pages/Stage2WorkflowRouter";
import DecisionStepPage from "./pages/DecisionStepPage";
import Stage2ActionsPage from "./pages/Stage2ActionsPage";
import Stage2ActionsReportPage from "./pages/Stage2ActionsReportPage";
import MonitorPage from "./pages/MonitorPage";
import StatisticsStubPage from "./pages/StatisticsStubPage";
import MainLayout from "./layouts/MainLayout";
import type { AuthOutletContext, SessionUser } from "./sessionTypes";

type MeResponse = { user: SessionUser | null };

function LegacyActionsRedirect() {
  const { patientId } = useParams();
  return <Navigate to={`/patients/${patientId}/actions`} replace />;
}

function RequireAuthLayout() {
  const loc = useLocation();
  const [state, setState] = useState<"loading" | { in: true; user: SessionUser } | { in: false }>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiJson<MeResponse>("/api/v1/me");
        if (!cancelled) {
          if (r.user) setState({ in: true, user: r.user });
          else setState({ in: false });
        }
      } catch {
        if (!cancelled) setState({ in: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="app-auth-loading" role="status">
        Проверка сессии…
      </div>
    );
  }
  if (!state.in) {
    return <Navigate to="/login" replace state={{ from: `${loc.pathname}${loc.search}` }} />;
  }
  const ctx: AuthOutletContext = { user: state.user };
  return <Outlet context={ctx} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuthLayout />}>
        <Route element={<MainLayout />}>
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:patientId/edit" element={<PatientFormPage />} />
          <Route path="/patients/:patientId/workflow" element={<Stage2WorkflowRouter />} />
          <Route path="/patients/:patientId/decision" element={<DecisionStepPage />} />
          <Route path="/patients/:patientId/actions" element={<Stage2ActionsPage />} />
          <Route path="/patients/:patientId/actions/report" element={<Stage2ActionsReportPage />} />
          <Route path="/patients/:patientId/priority-actions" element={<LegacyActionsRedirect />} />
          <Route path="/statistics" element={<StatisticsStubPage />} />
          <Route path="/" element={<Navigate to="/patients" replace />} />
        </Route>
        <Route path="/monitor" element={<MonitorPage />} />
      </Route>
    </Routes>
  );
}
