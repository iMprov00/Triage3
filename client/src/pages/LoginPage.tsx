import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiJson } from "../api";

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const redirectTo = (loc.state as { from?: string } | null)?.from;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await apiJson<{ ok: boolean; error?: string }>("/api/v1/login", {
        method: "POST",
        json: { login, password },
      });
      if (r.ok) {
        const dest = redirectTo && redirectTo !== "/login" ? redirectTo : "/patients";
        nav(dest, { replace: true });
      }
      else setErr(r.error || "Ошибка входа");
    } catch {
      setErr("Сервер недоступен или неверные данные");
    }
  }

  return (
    <div className="app-login-shell">
      <div className="triag-login-wrap w-100">
        <h1 className="h3 mb-3 text-center">Вход</h1>
        <p className="text-triag-muted text-center small mb-4">Триаж</p>
        <form onSubmit={submit} className="card shadow-sm">
          <div className="card-body">
            {err && <div className="alert alert-danger py-2">{err}</div>}
            <div className="mb-3">
              <label className="form-label">Логин</label>
              <input className="form-control" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
            </div>
            <div className="mb-3">
              <label className="form-label">Пароль</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn-primary w-100">
              Войти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
