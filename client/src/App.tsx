import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { apiJson } from "./api";
import LoginPage from "./pages/LoginPage";
import PatientsPage from "./pages/PatientsPage";
import PatientFormPage from "./pages/PatientFormPage";
import MonitorPage from "./pages/MonitorPage";
import TriageStep1Page from "./pages/TriageStep1Page";
import TriageStep2Page from "./pages/TriageStep2Page";
import TriageStep3Page from "./pages/TriageStep3Page";
import TriageActionsPage from "./pages/TriageActionsPage";
import AdministrationPage from "./pages/AdministrationPage";
import MainLayout from "./layouts/MainLayout";
import type { AuthOutletContext, SessionUser } from "./sessionTypes";

type MeResponse = { user: SessionUser | null };

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
          <Route path="/patients/new" element={<PatientFormPage mode="new" />} />
          <Route path="/patients/:patientId/edit" element={<PatientFormPage mode="edit" />} />
          <Route path="/patients/:patientId/triage" element={<TriageStep1Page />} />
          <Route path="/patients/:patientId/triage/step2" element={<TriageStep2Page />} />
          <Route path="/patients/:patientId/triage/step3" element={<TriageStep3Page />} />
          <Route path="/patients/:patientId/triage/actions" element={<TriageActionsPage />} />
          <Route path="/admin" element={<AdministrationPage />} />
          <Route path="/" element={<Navigate to="/patients" replace />} />
        </Route>
        <Route path="/monitor" element={<MonitorPage />} />
      </Route>
    </Routes>
  );
}
