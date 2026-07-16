import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { apiJson } from "../api";
import { AppShell } from "../components/AppShell";
import { STAGE2_APP_URL } from "../stageUrls";
import type { AuthOutletContext } from "../sessionTypes";

function navPillClass(active: boolean) {
  return `app-nav-pill${active ? " app-nav-pill--active" : ""}`;
}

export default function MainLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const auth = useOutletContext<AuthOutletContext>();
  const { user } = auth;
  const userLabel = (user.full_name || user.login || "").trim();
  const userTitle = [userLabel, user.position_label].filter(Boolean).join(" · ");
  const path = location.pathname;

  async function logout() {
    try {
      await apiJson("/api/v1/logout", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    nav("/login");
  }

  const patientsActive = path === "/patients" || path.startsWith("/patients/");
  const quickStatsActive = path === "/statistics/quick";
  const fullStatsActive = path === "/statistics/full";
  const adminActive = path === "/admin";

  return (
    <AppShell>
      <div className="app-layout d-flex flex-column flex-grow-1 w-100 min-vh-100">
        <header className="app-header">
          <div className="app-header-inner container-fluid">
            <div className="app-header-row">
              <Link to="/patients" className="app-brand text-decoration-none flex-shrink-0">
                <img className="app-brand-logo" src="/favicon.svg" width={28} height={28} alt="" />
                <span className="app-brand-text">Триаж</span>
                <span className="badge bg-light text-dark ms-1 d-none d-sm-inline">Этап 1</span>
              </Link>
              {userLabel ? (
                <span className="app-user-badge text-truncate flex-shrink-1" title={userTitle}>
                  <i className="bi bi-person-circle flex-shrink-0" aria-hidden />
                  <span className="text-truncate d-none d-md-inline">{userLabel}</span>
                </span>
              ) : null}
              <nav className="app-nav app-nav--pills d-flex align-items-center gap-1 gap-sm-2" aria-label="Основное меню">
                <Link to="/patients" className={navPillClass(patientsActive)}>
                  <i className="bi bi-people-fill" aria-hidden />
                  <span className="d-none d-sm-inline">Пациенты</span>
                </Link>
                <a href={STAGE2_APP_URL} className="app-nav-pill" title="Перейти к триажу этапа 2">
                  <i className="bi bi-2-circle-fill" aria-hidden />
                  <span className="d-none d-lg-inline">Этап 2</span>
                </a>
                <Link to="/monitor" className="app-nav-pill">
                  <i className="bi bi-grid-1x2-fill" aria-hidden />
                  <span className="d-none d-sm-inline">Монитор</span>
                </Link>
                <Link to="/statistics/quick" className={navPillClass(quickStatsActive)} title="Быстрая статистика">
                  <i className="bi bi-speedometer2" aria-hidden />
                  <span className="d-none d-lg-inline">Сводка</span>
                </Link>
                <Link to="/statistics/full" className={navPillClass(fullStatsActive)} title="Полная статистика">
                  <i className="bi bi-table" aria-hidden />
                  <span className="d-none d-lg-inline">Статистика</span>
                </Link>
                {user.role === "admin" ? (
                  <Link to="/admin" className={navPillClass(adminActive)}>
                    <i className="bi bi-gear-fill" aria-hidden />
                    <span className="d-none d-lg-inline">Админ</span>
                  </Link>
                ) : null}
                <button type="button" className="app-nav-pill" onClick={() => void logout()}>
                  <i className="bi bi-box-arrow-right" aria-hidden />
                  <span className="d-none d-sm-inline">Выход</span>
                </button>
              </nav>
            </div>
          </div>
        </header>
        <main className="app-main flex-grow-1 container-fluid py-3">
          <Outlet context={auth} />
        </main>
      </div>
    </AppShell>
  );
}
