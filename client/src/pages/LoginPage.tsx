import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "../api";

export default function LoginPage() {
  const nav = useNavigate();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await apiJson<{ ok: boolean; error?: string }>("/api/v1/login", {
        method: "POST",
        json: { login, password },
      });
      if (r.ok) nav("/patients");
      else setErr(r.error || "Ошибка входа");
    } catch {
      setErr("Сервер недоступен или неверные данные");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <h1 className="h3 mb-4">Вход</h1>
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
  );
}
