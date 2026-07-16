import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { apiJson } from "../api";
import { AppShell } from "../components/AppShell";
import { unlockNotificationAudio } from "../notificationSound";
import { STAGE1_APP_URL } from "../stageUrls";
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

  useEffect(() => {
    const unlock = (e: Event) => {
      const target = e.target;
      if (target instanceof Element && target.closest("select, option")) return;
      unlockNotificationAudio();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  async function logout() {
    try {
      await apiJson("/api/v1/logout", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    nav("/login");
  }

  const patientsActive = path === "/patients" || path.startsWith("/patients/");
  const monitorActive = path === "/monitor";
  const statisticsActive = path === "/statistics";

  return (
    <AppShell>
      <div className="app-layout d-flex flex-column flex-grow-1 w-100 min-vh-100">
        <header className="app-header">
          <div className="app-header-inner container-fluid">
            <div className="app-header-row">
              <Link to="/patients" className="app-brand text-decoration-none flex-shrink-0">
                <img className="app-brand-logo" src="/icons/icon.png" width={28} height={28} alt="" />
                <span className="app-brand-text">Триаж</span>
                <span className="badge bg-light text-dark ms-1 d-none d-sm-inline">Этап 2</span>
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
                <Link to="/monitor" className={navPillClass(monitorActive)}>
                  <i className="bi bi-grid-1x2-fill" aria-hidden />
                  <span className="d-none d-sm-inline">Монитор</span>
                </Link>
                <Link to="/statistics" className={navPillClass(statisticsActive)}>
                  <i className="bi bi-bar-chart-fill" aria-hidden />
                  <span className="d-none d-sm-inline">Статистика</span>
                </Link>
                <a
                  href={STAGE1_APP_URL}
                  className="app-nav-pill"
                  title="Перейти к триажу этапа 1"
                >
                  <i className="bi bi-box-arrow-up-right" aria-hidden />
                  <span className="d-none d-lg-inline">Этап 1</span>
                </a>
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
