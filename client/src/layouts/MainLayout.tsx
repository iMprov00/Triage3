import { Link, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { apiJson } from "../api";
import type { AuthOutletContext } from "../sessionTypes";

export default function MainLayout() {
  const nav = useNavigate();
  const { user } = useOutletContext<AuthOutletContext>();
  const userLabel = (user.full_name || user.login || "").trim();
  const userTitle = [userLabel, user.position_label].filter(Boolean).join(" · ");

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
              <img className="app-brand-logo" src="/icons/icon.svg" width={32} height={32} alt="" />
              <span className="app-brand-text">Триаж</span>
            </Link>
            {userLabel ? (
              <span className="app-user-badge text-truncate" title={userTitle}>
                <i className="bi bi-person-circle flex-shrink-0" aria-hidden />
                <span className="text-truncate">{userLabel}</span>
              </span>
            ) : null}
          </div>
          <nav className="app-nav d-flex flex-wrap align-items-center gap-2" aria-label="Основное меню">
            <Link to="/patients" className="btn btn-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1">
              <i className="bi bi-people-fill" aria-hidden />
              <span>Пациенты</span>
            </Link>
            <Link to="/monitor" className="btn btn-outline-light btn-sm app-nav-btn d-inline-flex align-items-center gap-1">
              <i className="bi bi-grid-1x2-fill" aria-hidden />
              <span>Монитор</span>
            </Link>
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
      <main className="app-main flex-grow-1 d-flex flex-column">
        <Outlet />
      </main>
    </div>
  );
}
