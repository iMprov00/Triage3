import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { apiJson } from "../api";
import type { AuthOutletContext } from "../sessionTypes";

const ROLE_KINDS = [
  { value: "admin", label: "Администратор" },
  { value: "doctor", label: "Врач" },
  { value: "other", label: "Прочее" },
] as const;

type Kind = (typeof ROLE_KINDS)[number]["value"];

type PositionRow = { id: number; name: string; kind: Kind; users_count: number };

type UserRow = {
  id: number;
  login: string;
  full_name: string;
  job_position_id: number;
  position_label: string;
  role: Kind | string | null;
};

function kindLabel(kind: string): string {
  return ROLE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export default function AdministrationPage() {
  const { user } = useOutletContext<AuthOutletContext>();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [posName, setPosName] = useState("");
  const [posKind, setPosKind] = useState<Kind>("doctor");

  const [userLogin, setUserLogin] = useState("");
  const [userFullName, setUserFullName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userPassword2, setUserPassword2] = useState("");
  const [userJobId, setUserJobId] = useState<number | "">("");

  const [editPos, setEditPos] = useState<PositionRow | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserPassword2, setEditUserPassword2] = useState("");

  const [pendingDeletePos, setPendingDeletePos] = useState<PositionRow | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, u] = await Promise.all([
        apiJson<{ positions: PositionRow[] }>("/api/v1/admin/positions"),
        apiJson<{ users: UserRow[] }>("/api/v1/admin/users"),
      ]);
      setPositions(p.positions);
      setUsers(u.users);
    } catch (e: unknown) {
      const ex = e as { status?: number; body?: { error?: string } };
      setErr(ex.body?.error || (ex.status === 403 ? "Нужны права администратора" : "Не удалось загрузить данные"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (positions.length > 0 && userJobId === "") setUserJobId(positions[0].id);
  }, [positions, userJobId]);

  if (user.role !== "admin") {
    return <Navigate to="/patients" replace />;
  }

  async function submitPosition(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await apiJson("/api/v1/admin/positions", {
        method: "POST",
        json: { position: { name: posName.trim(), kind: posKind } },
      });
      setPosName("");
      setPosKind("doctor");
      await load();
    } catch (e: unknown) {
      const ex = e as { body?: { errors?: string[] } };
      setErr(ex.body?.errors?.join(", ") || "Ошибка сохранения должности");
    }
  }

  async function saveEditPosition(e: React.FormEvent) {
    e.preventDefault();
    if (!editPos) return;
    setErr("");
    try {
      await apiJson(`/api/v1/admin/positions/${editPos.id}`, {
        method: "PATCH",
        json: { position: { name: editPos.name.trim(), kind: editPos.kind } },
      });
      setEditPos(null);
      await load();
    } catch (e: unknown) {
      const ex = e as { body?: { errors?: string[] } };
      setErr(ex.body?.errors?.join(", ") || "Ошибка сохранения");
    }
  }

  async function deletePosition() {
    if (!pendingDeletePos) return;
    setErr("");
    try {
      await apiJson(`/api/v1/admin/positions/${pendingDeletePos.id}`, { method: "DELETE" });
      setPendingDeletePos(null);
      await load();
    } catch (e: unknown) {
      const ex = e as { body?: { error?: string; errors?: string[] } };
      setErr(ex.body?.error || ex.body?.errors?.join(", ") || "Не удалось удалить");
      setPendingDeletePos(null);
    }
  }

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    if (userJobId === "") return;
    if (userPassword !== userPassword2) {
      setErr("Пароли не совпадают");
      return;
    }
    setErr("");
    try {
      await apiJson("/api/v1/admin/users", {
        method: "POST",
        json: {
          user: {
            login: userLogin.trim(),
            full_name: userFullName.trim(),
            password: userPassword,
            password_confirmation: userPassword2,
            job_position_id: userJobId,
          },
        },
      });
      setUserLogin("");
      setUserFullName("");
      setUserPassword("");
      setUserPassword2("");
      await load();
    } catch (e: unknown) {
      const ex = e as { body?: { errors?: string[] } };
      setErr(ex.body?.errors?.join(", ") || "Ошибка создания пользователя");
    }
  }

  async function saveEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    if (editUserPassword || editUserPassword2) {
      if (editUserPassword !== editUserPassword2) {
        setErr("Пароли не совпадают");
        return;
      }
      if (editUserPassword.length < 6) {
        setErr("Пароль не короче 6 символов");
        return;
      }
    }
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        login: editUser.login.trim(),
        full_name: editUser.full_name.trim(),
        job_position_id: editUser.job_position_id,
      };
      if (editUserPassword) {
        payload.password = editUserPassword;
        payload.password_confirmation = editUserPassword2;
      }
      await apiJson(`/api/v1/admin/users/${editUser.id}`, {
        method: "PATCH",
        json: { user: payload },
      });
      setEditUser(null);
      setEditUserPassword("");
      setEditUserPassword2("");
      await load();
    } catch (e: unknown) {
      const ex = e as { body?: { errors?: string[] } };
      setErr(ex.body?.errors?.join(", ") || "Ошибка сохранения");
    }
  }

  return (
    <div className="container-fluid triag-page-wide triag-admin-page px-0 px-sm-1">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 className="triag-admin-page-title mb-0">Администрирование</h1>
        <Link to="/patients" className="btn btn-outline-secondary btn-sm">
          ← К пациентам
        </Link>
      </div>

      <div className="alert alert-light border triag-admin-hint mb-3" role="note">
        <strong className="d-block mb-1">Роли (тип учётной записи)</strong>
        <ul className="mb-0 ps-3">
          <li>
            <strong>Администратор</strong> — полный доступ к этой странице, работа с пациентами, выбор любого исполнителя.
          </li>
          <li>
            <strong>Врач</strong> — пациенты и триаж; исполнитель — себя или сотрудников с ролью «Прочее».
          </li>
          <li>
            <strong>Прочее</strong> — пациент только на себя, без удаления пациентов; редактирование сохранённых шагов только своих
            пациентов.
          </li>
        </ul>
        <p className="text-muted mb-0 mt-2 small">
          Специальность — это название должности внутри выбранного типа (например, «Терапевт» с типом «Врач»). Подробнее — в README
          проекта.
        </p>
      </div>

      {err && (
        <div className="alert alert-danger py-2 small" role="alert">
          {err}
        </div>
      )}

      {loading ? (
        <div className="triag-admin-empty py-4">Загрузка…</div>
      ) : (
        <div className="row g-3 align-items-start">
          <div className="col-12 col-xl-6">
            <div className="card triage-form-card shadow-sm h-100">
              <div className="card-body">
                <h2 className="triag-admin-card-title">Специальности (должности)</h2>
                <p className="triag-admin-lead">
                  У каждой записи указан <strong>тип роли</strong> (admin / doctor / other). Название — произвольная специальность
                  в рамках этого типа.
                </p>

                <form onSubmit={(e) => void submitPosition(e)} className="triag-admin-form-panel triag-admin-form-panel--inline row g-2 align-items-end">
                  <div className="col-12 col-sm-5">
                    <label className="form-label" htmlFor="admin-pos-name">
                      Название
                    </label>
                    <input
                      id="admin-pos-name"
                      className="form-control"
                      value={posName}
                      onChange={(e) => setPosName(e.target.value)}
                      required
                      placeholder="Например, Терапевт"
                    />
                  </div>
                  <div className="col-12 col-sm-4">
                    <label className="form-label" htmlFor="admin-pos-kind">
                      Тип роли
                    </label>
                    <select id="admin-pos-kind" className="form-select" value={posKind} onChange={(e) => setPosKind(e.target.value as Kind)}>
                      {ROLE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-3">
                    <button type="submit" className="btn btn-primary btn-sm w-100 triag-admin-compact-btn">
                      Добавить
                    </button>
                  </div>
                </form>

                <div className="table-responsive triag-admin-table-wrap">
                  <table className="table table-hover triag-admin-table mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Название</th>
                        <th scope="col">Тип</th>
                        <th scope="col" className="text-end">
                          Польз.
                        </th>
                        <th scope="col" className="text-end triag-admin-col-actions">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>
                            <span className="badge rounded-pill text-bg-secondary">{kindLabel(p.kind)}</span>
                          </td>
                          <td className="text-end text-muted">{p.users_count}</td>
                          <td className="text-end triag-admin-col-actions">
                            <div className="triag-admin-actions">
                              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setEditPos({ ...p })}>
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                disabled={p.users_count > 0}
                                title={p.users_count > 0 ? "Сначала переназначьте пользователей" : undefined}
                                onClick={() => setPendingDeletePos(p)}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {positions.length === 0 && <p className="triag-admin-empty mb-0">Должностей пока нет.</p>}
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-6">
            <div className="card triage-form-card shadow-sm h-100">
              <div className="card-body">
                <h2 className="triag-admin-card-title">Пользователи</h2>
                <p className="triag-admin-lead mb-3">Новый пользователь получает выбранную должность; пароль не короче 6 символов.</p>

                <form onSubmit={(e) => void submitUser(e)} className="triag-admin-form-panel">
                  <div className="row g-2">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="admin-user-login">
                        Логин
                      </label>
                      <input
                        id="admin-user-login"
                        className="form-control"
                        value={userLogin}
                        onChange={(e) => setUserLogin(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="admin-user-fn">
                        ФИО
                      </label>
                      <input id="admin-user-fn" className="form-control" value={userFullName} onChange={(e) => setUserFullName(e.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="admin-user-pw">
                        Пароль (мин. 6 символов)
                      </label>
                      <input
                        id="admin-user-pw"
                        type="password"
                        className="form-control"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="admin-user-pw2">
                        Пароль ещё раз
                      </label>
                      <input
                        id="admin-user-pw2"
                        type="password"
                        className="form-control"
                        value={userPassword2}
                        onChange={(e) => setUserPassword2(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="admin-user-job">
                        Специальность (должность)
                      </label>
                      <select
                        id="admin-user-job"
                        className="form-select"
                        value={userJobId === "" ? "" : String(userJobId)}
                        onChange={(e) => setUserJobId(e.target.value ? Number(e.target.value) : "")}
                        required
                      >
                        {positions.length === 0 ? (
                          <option value="">Сначала добавьте должность</option>
                        ) : (
                          positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({kindLabel(p.kind)})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={positions.length === 0}>
                        Создать пользователя
                      </button>
                    </div>
                  </div>
                </form>

                <div className="table-responsive triag-admin-table-wrap">
                  <table className="table table-hover triag-admin-table mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Логин</th>
                        <th scope="col">ФИО</th>
                        <th scope="col">Должность</th>
                        <th scope="col" className="text-end triag-admin-col-actions">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <span className="font-monospace">{u.login}</span>
                          </td>
                          <td>{u.full_name}</td>
                          <td>
                            <span className="d-block">{u.position_label}</span>
                            <span className="text-muted" style={{ fontSize: "0.8125rem" }}>
                              {kindLabel(String(u.role))}
                            </span>
                          </td>
                          <td className="text-end triag-admin-col-actions">
                            <div className="triag-admin-actions">
                              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setEditUser({ ...u })}>
                                Изменить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {users.length === 0 && <p className="triag-admin-empty mb-0">Пользователей нет.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {editPos && (
        <>
          <div className="modal-backdrop fade show" onClick={() => setEditPos(null)} />
          <div className="modal fade show d-block triag-admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-pos-title">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title" id="edit-pos-title">
                    Изменить должность
                  </h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={() => setEditPos(null)} />
                </div>
                <form onSubmit={(e) => void saveEditPosition(e)}>
                  <div className="modal-body">
                    <div className="mb-2">
                      <label className="form-label">Название</label>
                      <input className="form-control" value={editPos.name} onChange={(e) => setEditPos({ ...editPos, name: e.target.value })} required />
                    </div>
                    <div className="mb-0">
                      <label className="form-label">Тип роли</label>
                      <select className="form-select" value={editPos.kind} onChange={(e) => setEditPos({ ...editPos, kind: e.target.value as Kind })}>
                        {ROLE_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setEditPos(null)}>
                      Отмена
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Сохранить
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {editUser && (
        <>
          <div className="modal-backdrop fade show" onClick={() => { setEditUser(null); setEditUserPassword(""); setEditUserPassword2(""); }} />
          <div className="modal fade show d-block triag-admin-modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title" id="edit-user-title">
                    Редактировать пользователя
                  </h2>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Закрыть"
                    onClick={() => {
                      setEditUser(null);
                      setEditUserPassword("");
                      setEditUserPassword2("");
                    }}
                  />
                </div>
                <form
                  onSubmit={(e) => {
                    void saveEditUser(e);
                  }}
                >
                  <div className="modal-body">
                    <div className="mb-2">
                      <label className="form-label">Логин</label>
                      <input className="form-control" value={editUser.login} onChange={(e) => setEditUser({ ...editUser, login: e.target.value })} required />
                    </div>
                    <div className="mb-2">
                      <label className="form-label">ФИО</label>
                      <input className="form-control" value={editUser.full_name} onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })} required />
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Специальность</label>
                      <select
                        className="form-select"
                        value={editUser.job_position_id}
                        onChange={(e) => setEditUser({ ...editUser, job_position_id: Number(e.target.value) })}
                      >
                        {positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({kindLabel(p.kind)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Новый пароль (оставьте пустым, чтобы не менять)</label>
                      <input type="password" className="form-control" value={editUserPassword} onChange={(e) => setEditUserPassword(e.target.value)} autoComplete="new-password" />
                    </div>
                    <div className="mb-0">
                      <label className="form-label">Повтор пароля</label>
                      <input type="password" className="form-control" value={editUserPassword2} onChange={(e) => setEditUserPassword2(e.target.value)} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setEditUser(null);
                        setEditUserPassword("");
                        setEditUserPassword2("");
                      }}
                    >
                      Отмена
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Сохранить
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {pendingDeletePos && (
        <>
          <div className="modal-backdrop fade show" onClick={() => setPendingDeletePos(null)} />
          <div className="modal fade show d-block triag-admin-modal" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title">Удалить должность?</h2>
                  <button type="button" className="btn-close" aria-label="Закрыть" onClick={() => setPendingDeletePos(null)} />
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    Удалить «<strong>{pendingDeletePos.name}</strong>»? Это можно сделать только если нет пользователей с этой должностью.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setPendingDeletePos(null)}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void deletePosition()}>
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
