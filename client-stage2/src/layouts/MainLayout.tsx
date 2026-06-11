import { useEffect } from "react";
import { Link, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { apiJson, STAGE1_APP_URL } from "../api";
import type { AuthOutletContext } from "../sessionTypes";

const SOFT_THEME_CLASS = "triag-theme-soft";

export default function MainLayout() {
  const nav = useNavigate();
  const auth = useOutletContext<AuthOutletContext>();
  const { user } = auth;
  const userLabel = (user.full_name || user.login || "").trim();
  const userTitle = [userLabel, user.position_label].filter(Boolean).join(" · ");

  useEffect(() => {
    document.documentElement.classList.add(SOFT_THEME_CLASS);
    return () => document.documentElement.classList.remove(SOFT_THEME_CLASS);
  }, []);

  async function logout() {
    try {
      await apiJson("/api/v1/logout", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    nav("/login");
  }

  return (
    <div className="app-layout d-flex flex-column flex-grow-1 w-100 min-vh-100">
      <header className="app-header">
        <div className="app-header-inner container-fluid">
          <div className="d-flex align-items-center gap-2 flex-wrap flex-grow-1 min-w-0">
            <Link to="/patients" className="app-brand text-decoration-none">
              <img className="app-brand-logo" src="/icons/icon.png" width={32} height={32} alt="" />
              <span className="app-brand-text">Триаж</span>
              <span className="badge bg-light text-dark ms-1">Этап 2</span>
            </Link>
            {userLabel ? (
              <span className="app-user-badge text-truncate" title={userTitle}>
                <i className="bi bi-person-circle flex-shrink-0" aria-hidden />
                <span className="text-truncate">{userLabel}</span>
              </span>
            ) : null}
          </div>
          <nav className="app-nav d-flex flex-wrap align-items-center gap-2" aria-label="Основное меню">
            <Link to="/patients" className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1">
              <i className="bi bi-people-fill" aria-hidden />
              <span>Пациенты</span>
            </Link>
            <Link to="/monitor" className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1">
              <i className="bi bi-grid-1x2-fill" aria-hidden />
              <span>Монитор</span>
            </Link>
            <Link to="/statistics" className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1">
              <i className="bi bi-bar-chart-fill" aria-hidden />
              <span>Статистика</span>
            </Link>
            <a
              href={STAGE1_APP_URL}
              className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1"
              title="Перейти к триажу этапа 1"
            >
              <i className="bi bi-box-arrow-up-right" aria-hidden />
              <span className="d-none d-sm-inline">Этап 1</span>
            </a>
            <button
              type="button"
              className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1"
              onClick={() => void logout()}
            >
              <i className="bi bi-box-arrow-right" aria-hidden />
              <span>Выход</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="app-main flex-grow-1 container-fluid py-3">
        <Outlet />
      </main>
    </div>
  );
}
