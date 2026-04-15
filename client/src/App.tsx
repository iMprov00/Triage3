import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import PatientsPage from "./pages/PatientsPage";
import PatientFormPage from "./pages/PatientFormPage";
import MonitorPage from "./pages/MonitorPage";
import TriageStep1Page from "./pages/TriageStep1Page";
import TriageStep2Page from "./pages/TriageStep2Page";
import TriageStep3Page from "./pages/TriageStep3Page";
import TriageActionsPage from "./pages/TriageActionsPage";

export default function App() {
  return (
    <div className="min-vh-100 bg-light">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/new" element={<PatientFormPage mode="new" />} />
        <Route path="/patients/:patientId/edit" element={<PatientFormPage mode="edit" />} />
        <Route path="/patients/:patientId/triage" element={<TriageStep1Page />} />
        <Route path="/patients/:patientId/triage/step2" element={<TriageStep2Page />} />
        <Route path="/patients/:patientId/triage/step3" element={<TriageStep3Page />} />
        <Route path="/patients/:patientId/triage/actions" element={<TriageActionsPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/" element={<Navigate to="/patients" replace />} />
      </Routes>
    </div>
  );
}
