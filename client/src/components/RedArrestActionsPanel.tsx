import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson, formatTimer } from "../api";

type SchemaItem = { key: string; label: string };
type ActionsSchema = { team: SchemaItem[]; manips: SchemaItem[]; vitals: SchemaItem[] };
type FlowKind = "red_arrest" | "red_seizures" | "red_bleeding";

type FlowManip = Record<string, number | string | undefined>;
type FlowTeam = Record<string, number | string | undefined>;
type FlowVitalEntry = { values?: string[]; value?: string; at?: number };
type FlowVitals = Record<string, FlowVitalEntry | undefined>;

export type RedArrestTriageView = {
  patient_full_name?: string;
  priority_name?: string;
  actions_completed_at?: string | null;
  actions_started_at?: string | null;
  actions_time_limit?: number;
  actions_timer_ends_at?: number | null;
  brigade_timer_ends_at?: number | null;
  brigade_called_at?: string | null;
  brigade_time_limit?: number;
  brigade_timer_label?: string;
  actions_data?: Record<string, unknown>;
  can_complete_red_arrest?: boolean;
  can_complete_actions_flow?: boolean;
  actions_flow_kind?: FlowKind | null;
  actions_flow_schema?: ActionsSchema | null;
  red_arrest_schema?: ActionsSchema;
};

function flowBucket(data: Record<string, unknown> | undefined, flowKind: FlowKind | null): {
  team: FlowTeam;
  manip: FlowManip;
  vitals: FlowVitals;
} {
  if (!flowKind) return { team: {}, manip: {}, vitals: {} };
  const flow = data?.[flowKind];
  if (!flow || typeof flow !== "object") return { team: {}, manip: {}, vitals: {} };
  const h = flow as Record<string, unknown>;
  return {
    team: (h.team as FlowTeam) || {},
    manip: (h.manip as FlowManip) || {},
    vitals: (h.vitals as FlowVitals) || {},
  };
}

function fmtAt(ts: unknown): string | null {
  if (ts == null || ts === "") return null;
  const n = typeof ts === "string" ? parseInt(ts, 10) : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toLocaleString("ru-RU");
}

function vitalTriple(vitals: FlowVitals, base: string): [string, string, string] {
  const e = vitals[base];
  if (e && Array.isArray(e.values)) {
    const v = e.values.map((x) => (x == null ? "" : String(x)));
    return [v[0] || "", v[1] || "", v[2] || ""];
  }
  if (e && e.value != null && String(e.value).trim() !== "") {
    return [String(e.value), "", ""];
  }
  return ["", "", ""];
}

type Props = {
  patientId: string;
  triage: RedArrestTriageView;
  onRefresh: () => Promise<void>;
  onComplete: () => Promise<void>;
  setErr: (s: string) => void;
};

export default function RedArrestActionsPanel({ patientId, triage, onRefresh, onComplete, setErr }: Props) {
  const [, setTick] = useState(0);
  const actionsLimit = triage.actions_time_limit ?? 300;
  const brigadeLimit = triage.brigade_time_limit ?? 720;
  const flowKind = triage.actions_flow_kind ?? (triage.red_arrest_schema ? "red_arrest" : null);
  const schema = triage.actions_flow_schema ?? triage.red_arrest_schema ?? { team: [], manips: [], vitals: [] };
  const done = Boolean(triage.actions_completed_at);
  const brigadeOk = Boolean(triage.brigade_called_at);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requiresConfirm = flowKind === "red_seizures" || flowKind === "red_bleeding";

  const { team, manip, vitals } = useMemo(
    () => flowBucket(triage.actions_data, flowKind),
    [triage.actions_data, flowKind],
  );

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const actionsEnds = triage.actions_timer_ends_at ?? null;
  const actionsRem =
    actionsEnds != null ? Math.max(0, Math.floor(actionsEnds - Date.now() / 1000)) : 0;
  const actionsPct = actionsEnds != null ? Math.min(100, Math.round((actionsRem / actionsLimit) * 100)) : 0;
  const actionsTone = actionsRem <= 0 ? "danger" : actionsPct <= 25 ? "danger" : actionsPct <= 50 ? "warning" : "ok";

  const brigadeEnds = triage.brigade_timer_ends_at ?? null;
  const brigadeRem =
    brigadeEnds != null ? Math.max(0, Math.floor(brigadeEnds - Date.now() / 1000)) : 0;
  const brigadePct = brigadeEnds != null ? Math.min(100, Math.round((brigadeRem / brigadeLimit) * 100)) : 0;
  const brigadeTone = brigadeRem <= 0 ? "danger" : brigadePct <= 25 ? "danger" : brigadePct <= 50 ? "warning" : "ok";

  const post = useCallback(
    async (path: string, json: Record<string, unknown>) => {
      setErr("");
      try {
        await apiJson(`/api/v1/patients/${patientId}/triage/actions${path}`, { method: "POST", json });
        await onRefresh();
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "body" in e
            ? String((e as { body?: { error?: string } }).body?.error || "Ошибка")
            : "Ошибка";
        setErr(msg);
      }
    },
    [patientId, onRefresh, setErr],
  );

  async function brigadeClick() {
    await post("/red_arrest/brigade", {});
  }

  async function toggle(group: string, key: string, checked: boolean) {
    await post("/red_arrest/toggle", { group, key, checked });
  }

  async function vital(key: string, value: string) {
    await post("/red_arrest/vital", { key, value });
  }

  const csectionChecked = Boolean(manip.csection_done || manip.urgent_cesarean);
  const recoveryChecked = Boolean(manip.resusc_outcome_recovery || manip.slr_complete);
  const deathChecked = Boolean(manip.resusc_outcome_death);

  const fetalRaw = vitals.fetal_heartbeat?.value;
  const fetalVal = fetalRaw == null || String(fetalRaw).trim() === "" ? "yes" : String(fetalRaw).trim();
  const bleedRaw = vitals.active_bleeding?.value;
  const bleedVal = bleedRaw == null || String(bleedRaw).trim() === "" ? "no" : String(bleedRaw).trim();

  const canComplete = Boolean(
    flowKind === "red_arrest" ? triage.can_complete_red_arrest : triage.can_complete_actions_flow,
  );
  const title =
    flowKind === "red_seizures"
      ? "Срочные меры (судороги)"
      : flowKind === "red_bleeding"
        ? "Срочные меры (кровотечение)"
        : "Срочные меры (остановка сердца)";
  const subtitle =
    flowKind === "red_seizures"
      ? "Сценарий шага 1: судороги"
      : flowKind === "red_bleeding"
        ? "Сценарий шага 1: активное кровотечение"
        : "Нет дыхания и/или нет сердцебиения на шаге 1";

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1 text-danger">
            {title}
          </h1>
          <p className="text-muted mb-0">
            {triage.patient_full_name || `Пациент #${patientId}`} · Приоритет:{" "}
            <span className="badge bg-danger">{triage.priority_name || "красный"}</span>
            <span className="text-muted small ms-2">{subtitle}</span>
          </p>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-lg-6 mb-3">
          <div className={`card h-100 shadow-sm triage-timer-card triage-timer-card--${actionsTone} ${actionsRem <= 0 ? "triage-timer-card--expired" : ""}`}>
            <div className="card-header py-2">
              <span className="text-muted small text-uppercase">Время на действия</span>
            </div>
            <div className="card-body">
              <div className="text-center p-3 rounded bg-light-subtle">
                <div className="display-6 fw-bold">{formatTimer(actionsRem)}</div>
                <small className="text-muted">из {Math.round(actionsLimit / 60)} минут</small>
                <div className="progress mt-3 triage-timer-progress" style={{ height: 8 }}>
                  <div
                    className={`progress-bar triage-timer-bar triage-timer-bar--${actionsTone}`}
                    style={{ width: `${actionsPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        {brigadeOk && (
          <div className="col-lg-6 mb-3">
            <div className={`card h-100 shadow-sm triage-timer-card triage-timer-card--${brigadeTone} ${brigadeRem <= 0 ? "triage-timer-card--expired" : ""}`}>
              <div className="card-header py-2">
                <span className="small text-uppercase">{triage.brigade_timer_label || "Время прибытия бригады"}</span>
              </div>
              <div className="card-body">
                <div className="text-center p-3 rounded bg-light-subtle">
                  <div className="display-6 fw-bold">{formatTimer(brigadeRem)}</div>
                  <small className="text-muted">из {Math.round(brigadeLimit / 60)} минут</small>
                  <div className="progress mt-3 triage-timer-progress" style={{ height: 8 }}>
                    <div className={`progress-bar triage-timer-bar triage-timer-bar--${brigadeTone}`} style={{ width: `${brigadePct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-danger text-white py-2">
              <span className="small text-uppercase">Вызов бригады оказания помощи</span>
            </div>
            <div className="card-body">
              {!brigadeOk ? (
                <button
                  type="button"
                  className="btn btn-danger btn-lg w-100 mb-4"
                  disabled={done}
                  onClick={() => void brigadeClick()}
                >
                  Бригада вызвана
                </button>
              ) : (
                <div className="alert alert-success py-2 mb-4">
                  Бригада вызвана
                  {triage.brigade_called_at && (
                    <span className="ms-1">— {new Date(triage.brigade_called_at).toLocaleString("ru-RU")}</span>
                  )}
                </div>
              )}

              <div className={brigadeOk ? "" : "d-none"}>
                <p className="small text-muted mb-2">Специалисты (отметка и время фиксируются в журнале)</p>
                {schema.team.map((item) => {
                  const ts = team[item.key];
                  const checked = ts != null && String(ts).trim() !== "";
                  return (
                    <div
                      key={item.key}
                      className={`form-check mb-2 ${checked ? "bg-success-subtle border border-success rounded px-2 py-2" : ""}`}
                    >
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`ra_team_${item.key}`}
                        checked={checked}
                        disabled={done || !brigadeOk}
                        onChange={(e) => void toggle("team", item.key, e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor={`ra_team_${item.key}`}>
                        {item.label}
                      </label>
                      {checked && <div className="small text-muted ms-4">{fmtAt(ts)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-danger text-white py-2">
              <span className="small text-uppercase">Манипуляции</span>
            </div>
            <div className="card-body">
              {schema.manips.map((item) => {
                const k = item.key;
                const ts = manip[k];
                const checked = ts != null && String(ts).trim() !== "";
                return (
                  <div key={k}>
                    <div
                      className={`form-check mb-2 ${checked ? "bg-success-subtle border border-success rounded px-2 py-2" : ""}`}
                    >
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`ra_manip_${k}`}
                        checked={checked}
                        disabled={done}
                        onChange={(e) => void toggle("manip", k, e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor={`ra_manip_${k}`}>
                        {item.label}
                      </label>
                      {checked && <div className="small text-muted ms-4">{fmtAt(ts)}</div>}
                    </div>

                    {k === "oxygen_inhalation" && (
                      <>
                        <hr className="my-3" />
                        <p className="small text-muted text-uppercase mb-2">Показатели (3 последовательных замера)</p>
                        {schema.vitals.map((v) => {
                          const [v1, v2, v3] = vitalTriple(vitals, v.key);
                          const at = vitals[v.key]?.at;
                          return (
                            <div key={`${v.key}-${v1}-${v2}-${v3}`} className="mb-2">
                              <label className="form-label mb-1 small">{v.label}</label>
                              <div className="d-flex gap-1 flex-nowrap">
                                {([1, 2, 3] as const).map((idx) => {
                                  const vals = [v1, v2, v3];
                                  const prevFilled =
                                    idx === 1 || (idx === 2 ? vals[0].trim() !== "" : vals[1].trim() !== "");
                                  const fieldKey = `${v.key}_${idx}`;
                                  const val = vals[idx - 1] ?? "";
                                  return (
                                    <input
                                      key={fieldKey}
                                      type="text"
                                      className="form-control form-control-sm"
                                      disabled={done || !prevFilled}
                                      placeholder={String(idx)}
                                      defaultValue={val}
                                      data-last-sent={val}
                                      onBlur={(e) => {
                                        const el = e.target as HTMLInputElement;
                                        const raw = el.value.trim();
                                        const last = (el.dataset.lastSent ?? "").trim();
                                        if (raw === last) return;
                                        void (async () => {
                                          await vital(fieldKey, raw);
                                          el.dataset.lastSent = raw;
                                        })();
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              {at != null && <div className="small text-muted mt-1">Последний ввод: {fmtAt(at)}</div>}
                            </div>
                          );
                        })}
                        {flowKind === "red_arrest" && (
                          <>
                            <hr className="my-3" />
                            <div className="mb-2">
                              <div className="small fw-semibold mb-1">Сердцебиение плода выслушивается</div>
                              <div className="btn-group btn-group-sm" role="group">
                                <input
                                  type="radio"
                                  className="btn-check"
                                  name={`ra_fetal_${patientId}`}
                                  id="ra_fetal_yes"
                                  checked={fetalVal === "yes"}
                                  disabled={done}
                                  onChange={() => void vital("fetal_heartbeat", "yes")}
                                />
                                <label className="btn btn-outline-secondary" htmlFor="ra_fetal_yes">
                                  Да
                                </label>
                                <input
                                  type="radio"
                                  className="btn-check"
                                  name={`ra_fetal_${patientId}`}
                                  id="ra_fetal_no"
                                  checked={fetalVal === "no"}
                                  disabled={done}
                                  onChange={() => void vital("fetal_heartbeat", "no")}
                                />
                                <label className="btn btn-outline-secondary" htmlFor="ra_fetal_no">
                                  Нет
                                </label>
                              </div>
                            </div>
                            <div className="mb-3">
                              <div className="small fw-semibold mb-1">Наличие кровотечения</div>
                              <div className="btn-group btn-group-sm" role="group">
                                <input
                                  type="radio"
                                  className="btn-check"
                                  name={`ra_bleed_${patientId}`}
                                  id="ra_bleed_yes"
                                  checked={bleedVal === "yes"}
                                  disabled={done}
                                  onChange={() => void vital("active_bleeding", "yes")}
                                />
                                <label className="btn btn-outline-secondary" htmlFor="ra_bleed_yes">
                                  Да
                                </label>
                                <input
                                  type="radio"
                                  className="btn-check"
                                  name={`ra_bleed_${patientId}`}
                                  id="ra_bleed_no"
                                  checked={bleedVal === "no"}
                                  disabled={done}
                                  onChange={() => void vital("active_bleeding", "no")}
                                />
                                <label className="btn btn-outline-secondary" htmlFor="ra_bleed_no">
                                  Нет
                                </label>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {flowKind === "red_arrest" && k === "vein_catheter" && (
                      <div className="mb-3 mt-2">
                        <div className="small fw-semibold mb-2">Введение адреналина 0,1% - 1,0 мл в/в</div>
                        <div className="d-flex gap-2 flex-wrap">
                          {([1, 2, 3] as const).map((i) => {
                            const aKey = `adrenaline_${i}`;
                            const aDone = manip[aKey] != null && String(manip[aKey]).trim() !== "";
                            const prevOk = i === 1 || (manip[`adrenaline_${i - 1}`] != null && String(manip[`adrenaline_${i - 1}`]).trim() !== "");
                            return (
                              <div
                                key={aKey}
                                className={`form-check ${aDone ? "bg-success-subtle border border-success rounded px-2 py-1" : ""}`}
                              >
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`ra_${aKey}`}
                                  checked={aDone}
                                  disabled={done || !prevOk}
                                  onChange={(e) => void toggle("manip", aKey, e.target.checked)}
                                />
                                <label className="form-check-label small" htmlFor={`ra_${aKey}`}>
                                  {i}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {flowKind === "red_arrest" && (
                <>
                  <hr className="my-3" />
                  <div
                    className={`form-check mb-3 ${csectionChecked ? "bg-success-subtle border border-success rounded px-2 py-2" : ""}`}
                  >
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="ra_csection"
                      checked={csectionChecked}
                      disabled={done}
                      onChange={(e) => void toggle("manip", "csection_done", e.target.checked)}
                    />
                    <label className="form-check-label fw-semibold" htmlFor="ra_csection">
                      Выполнено кесарево сечение
                    </label>
                    {csectionChecked && (
                      <div className="small text-muted ms-4">
                        {fmtAt(manip.csection_done || manip.urgent_cesarean)}
                      </div>
                    )}
                  </div>

                  <div className="mb-2">
                    <div className="small fw-semibold mb-1">Исход СЛР (выбрать один)</div>
                    <div className="d-grid gap-2">
                      <div
                        className={`form-check ${recoveryChecked ? "bg-success-subtle border border-success rounded px-2 py-2" : ""}`}
                      >
                        <input
                          className="form-check-input"
                          type="radio"
                          name={`ra_resusc_${patientId}`}
                          id="ra_out_recovery"
                          checked={recoveryChecked}
                          disabled={done}
                          onChange={() => void toggle("manip", "resusc_outcome_recovery", true)}
                        />
                        <label className="form-check-label" htmlFor="ra_out_recovery">
                          Восстановление сердечной деятельности. Завершение СЛР
                        </label>
                      </div>
                      <div
                        className={`form-check ${deathChecked ? "bg-success-subtle border border-success rounded px-2 py-2" : ""}`}
                      >
                        <input
                          className="form-check-input"
                          type="radio"
                          name={`ra_resusc_${patientId}`}
                          id="ra_out_death"
                          checked={deathChecked}
                          disabled={done}
                          onChange={() => void toggle("manip", "resusc_outcome_death", true)}
                        />
                        <label className="form-check-label" htmlFor="ra_out_death">
                          Смерть
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-12 text-center">
          <button
            type="button"
            className="btn btn-success btn-lg me-2"
            disabled={done || !canComplete}
            onClick={() => {
              if (requiresConfirm) {
                setConfirmOpen(true);
                return;
              }
              void onComplete();
            }}
          >
            Завершить действия
          </button>
          {!canComplete && !done && (
            <p className="text-muted small mt-2 mb-0">
              {flowKind === "red_arrest"
                ? "Чтобы завершить: нажмите «Бригада вызвана», затем отметьте «Выполнено кесарево сечение» и/или один из исходов СЛР."
                : "Завершение доступно в любой момент после подтверждения."}
            </p>
          )}
        </div>
      </div>

      {confirmOpen && (
        <>
          <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Подтвердите завершение</h5>
                  <button type="button" className="btn-close" onClick={() => setConfirmOpen(false)} />
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    Завершить действия по сценарию{" "}
                    {flowKind === "red_seizures" ? "«Судороги»" : "«Кровотечение»"}?
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirmOpen(false)}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      setConfirmOpen(false);
                      void onComplete();
                    }}
                  >
                    Завершить
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}
    </div>
  );
}
