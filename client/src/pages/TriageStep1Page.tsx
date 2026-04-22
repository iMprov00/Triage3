import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiJson, formatTimer } from "../api";
import TriageStepEditConfirmDialog from "../components/TriageStepEditConfirmDialog";
import {
  triageActiveStepPath,
  triageHasSavedStepData,
  triagePathIsEditMode,
  triageStepMaxSeconds,
  type TriageStepEditPreview,
  type TriageStepEditUpdateResponse,
} from "../triageUi";

type Options = {
  eye_opening: string[];
  verbal_response: string[];
  motor_response: string[];
};

const EYE_SCORES: Record<string, number> = {
  "произвольно открывает": 4,
  "глаза закрыты": 3,
  "открывает в ответ на голос": 3,
  "открывает в ответ на болезненную стимуляцию": 2,
  "глаза закрыты, нет реакции": 1,
};

const VERBAL_SCORES: Record<string, number> = {
  "четко и своевременно отвечает на вопросы": 4,
  "плохо ориентируется, речь невнятна": 3,
  "речь бессвязная, набор слов, общий смысл отсутствует": 2,
  "не отвечает": 1,
};

const MOTOR_SCORES: Record<string, number> = {
  "осуществляет действия по требованию": 6,
  "отталкивает конечности при болевом раздражении": 5,
  "конечность дергается при болевом раздражении": 4,
  "патологический сгибательный рефлекс": 3,
  "патологический разгибательный рефлекс": 2,
  "не двигается": 1,
};

type YesNoToggleProps = {
  name: string;
  label: string;
  value: boolean;
  /** «Да» — хороший вариант (зелёный), «Нет» — плохой (красный) */
  mode: "yes_good" | "no_good";
  onChange: (next: boolean) => void;
};

function YesNoToggle({ name, label, value, onChange, mode }: YesNoToggleProps) {
  const yesId = `${name}_yes`;
  const noId = `${name}_no`;
  const yesTone = mode === "yes_good" ? "triage-yn-slot-yes-good" : "triage-yn-slot-yes-bad";
  const noTone = mode === "yes_good" ? "triage-yn-slot-no-bad" : "triage-yn-slot-no-good";
  return (
    <div className="triage-yn-item">
      <div className="triage-yn-label">{label}</div>
      <div className="triage-yn-row" role="group" aria-label={label}>
        <input
          type="radio"
          className="btn-check"
          name={name}
          id={yesId}
          checked={value === true}
          onChange={() => onChange(true)}
        />
        <label className={`triage-yn-slot ${yesTone}`} htmlFor={yesId}>
          Да
        </label>
        <input
          type="radio"
          className="btn-check"
          name={name}
          id={noId}
          checked={value === false}
          onChange={() => onChange(false)}
        />
        <label className={`triage-yn-slot ${noTone}`} htmlFor={noId}>
          Нет
        </label>
      </div>
    </div>
  );
}

export default function TriageStep1Page() {
  const { patientId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const isEditMode = triagePathIsEditMode(location.pathname, 1);
  const [opts, setOpts] = useState<Options | null>(null);
  const [triage, setTriage] = useState<Record<string, unknown> | null>(null);
  const [eye, setEye] = useState("");
  const [verbal, setVerbal] = useState("");
  const [motor, setMotor] = useState("");
  const [breathing, setBreathing] = useState(true);
  const [heartbeat, setHeartbeat] = useState(true);
  const [seizures, setSeizures] = useState(false);
  const [bleeding, setBleeding] = useState(false);
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);
  const [editDialog, setEditDialog] = useState<{ title: string; body: ReactNode } | null>(null);
  const [pendingEditPayload, setPendingEditPayload] = useState<Record<string, unknown> | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [o, t] = await Promise.all([
          apiJson<Options>("/api/v1/meta/triage_options"),
          apiJson<Record<string, unknown>>(`/api/v1/patients/${patientId}/triage`),
        ]);
        setOpts(o);
        setTriage(t);
        const s1 = (t.step1_data as Record<string, unknown>) || {};
        if (typeof s1.eye_opening === "string") setEye(s1.eye_opening);
        if (typeof s1.verbal_response === "string") setVerbal(s1.verbal_response);
        if (typeof s1.motor_response === "string") setMotor(s1.motor_response);
        if (s1.breathing != null) setBreathing(s1.breathing === true || s1.breathing === "true");
        if (s1.heartbeat != null) setHeartbeat(s1.heartbeat === true || s1.heartbeat === "true");
        if (s1.seizures != null) setSeizures(s1.seizures === true || s1.seizures === "true");
        if (s1.active_bleeding != null) setBleeding(s1.active_bleeding === true || s1.active_bleeding === "true");
      } catch {
        setErr("Нет доступа или триаж не начат");
      }
    })();
  }, [patientId]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const rem =
    triage?.timer_active && triage.timer_ends_at
      ? Math.max(0, Math.floor((triage.timer_ends_at as number) - Date.now() / 1000))
      : 0;
  const maxTime = triageStepMaxSeconds(triage);
  const timerPct = Math.min(100, (rem / maxTime) * 100);
  const timerTone = rem <= 0 ? "danger" : timerPct <= 25 ? "danger" : timerPct <= 50 ? "warning" : "ok";
  const eyeScore = EYE_SCORES[eye] || 0;
  const verbalScore = VERBAL_SCORES[verbal] || 0;
  const motorScore = MOTOR_SCORES[motor] || 0;
  const totalScore = eyeScore + verbalScore + motorScore;

  function buildStep1Payload() {
    return {
      eye_opening: eye,
      verbal_response: verbal,
      motor_response: motor,
      breathing,
      heartbeat,
      seizures,
      active_bleeding: bleeding,
    };
  }

  async function runEditPreview() {
    setErr("");
    const payload = buildStep1Payload();
    try {
      const prev = await apiJson<TriageStepEditPreview>(`/api/v1/patients/${patientId}/triage/preview_step_update/1`, {
        method: "POST",
        json: payload,
      });
      if (!prev.ok) {
        setErr(prev.error || "Не удалось проверить изменения");
        return;
      }
      setPendingEditPayload(payload);
      setEditDialog({
        title: prev.priority_changed ? "Внимание — изменение приоритета" : "Подтверждение сохранения",
        body: prev.priority_changed ? (
          <p className="mb-0">
            <strong>ВНИМАНИЕ!</strong> Внесённые изменения расходятся с текущим приоритетом (сейчас:{" "}
            <strong>{prev.current_priority_label}</strong>). При сохранении последующие шаги и действия приоритета будут пересчитаны.
            Новый приоритет: <strong>{prev.new_priority_label}</strong>. Сохранить?
          </p>
        ) : (
          <p className="mb-0">Сохранить изменения шага 1?</p>
        ),
      });
    } catch (ex: unknown) {
      const er = ex as { body?: { error?: string } };
      setErr(er.body?.error || "Ошибка проверки изменений");
    }
  }

  async function confirmEditSave() {
    if (!patientId || !pendingEditPayload) return;
    setEditSaving(true);
    setErr("");
    try {
      const r = await apiJson<TriageStepEditUpdateResponse>(`/api/v1/patients/${patientId}/triage/update_step/1`, {
        method: "POST",
        json: pendingEditPayload,
      });
      if (!r.ok) {
        setErr((r as { error?: string }).error || "Ошибка сохранения");
        return;
      }
      setEditDialog(null);
      setPendingEditPayload(null);
      const tri = r.triage || {};
      if (tri.completed_at) nav(`/patients/${patientId}/triage/actions`);
      else nav(triageActiveStepPath(patientId, Number(tri.step) || 1));
    } catch (ex: unknown) {
      const er = ex as { body?: { error?: string } };
      setErr(er.body?.error || "Ошибка сохранения");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditMode) {
      await runEditPreview();
      return;
    }
    setErr("");
    try {
      const r = await apiJson<{ result?: string }>(`/api/v1/patients/${patientId}/triage/step1`, {
        method: "POST",
        json: buildStep1Payload(),
      });
      if (r.result === "priority_assigned") nav(`/patients/${patientId}/triage/actions`);
      else nav(`/patients/${patientId}/triage/step2`);
    } catch (ex: unknown) {
      const er = ex as { body?: { error?: string } };
      setErr(er.body?.error || "Ошибка");
    }
  }

  if (!opts || !triage) {
    return (
      <div className="container-fluid triag-page-wide">
        <div className="triage-page-shell py-2 py-sm-3">
        {err || "Загрузка…"}
        <div className="mt-2">
          <Link to="/patients" className="triage-back-link">← Назад</Link>
        </div>
        </div>
      </div>
    );
  }

  if (isEditMode) {
    if (triage.actions_completed_at) {
      return (
        <div className="container-fluid triag-page-wide">
          <div className="triage-page-shell py-2 py-sm-3">
            <p className="mb-2">Действия по приоритету уже завершены — редактирование шагов недоступно.</p>
            <Link to="/patients" className="triage-back-link">
              ← Пациенты
            </Link>
          </div>
        </div>
      );
    }
    if (triage.can_edit_saved_steps !== true) {
      return (
        <div className="container-fluid triag-page-wide">
          <div className="triage-page-shell py-2 py-sm-3">
            <p className="mb-2">Недостаточно прав для редактирования сохранённых шагов этого пациента.</p>
            <Link to="/patients" className="triage-back-link">
              ← Пациенты
            </Link>
          </div>
        </div>
      );
    }
    if (!triageHasSavedStepData(triage, 1)) {
      return (
        <div className="container-fluid triag-page-wide">
          <div className="triage-page-shell py-2 py-sm-3">
            <p className="mb-2">Для шага 1 нет сохранённых данных.</p>
            <Link to="/patients" className="triage-back-link">
              ← Пациенты
            </Link>
          </div>
        </div>
      );
    }
  }

  if (!isEditMode && (triage.step as number) !== 1) {
    return (
      <div className="container-fluid triag-page-wide">
        <div className="triage-page-shell py-2 py-sm-3">
        <p>Откройте текущий шаг из списка.</p>
        <Link to="/patients" className="triage-back-link">← Назад</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid triag-page-wide">
      <div className="triage-page-shell py-2 py-sm-3">
      <div className="triage-page-head">
        <Link to="/patients" className="triage-back-link">← Пациенты</Link>
        <h1 className="h4 triage-page-title">{isEditMode ? "Редактирование шага 1" : "Шаг 1"}</h1>
      </div>
      {!isEditMode && (
      <div className={`triage-timer-card triage-timer-card--${timerTone} ${rem <= 0 ? "triage-timer-card--expired" : ""}`}>
        <div className="triage-timer-row">
          <span className="small text-muted">Осталось времени</span>
          <span className="triage-timer-value">{formatTimer(rem)}</span>
        </div>
        <div className="progress triage-timer-progress">
          <div className={`progress-bar triage-timer-bar triage-timer-bar--${timerTone}`} style={{ width: `${timerPct}%` }} />
        </div>
      </div>
      )}
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <form onSubmit={(e) => void handleSubmit(e)} className="card triage-form-card">
        <div className="card-body row g-3">
          <div className="col-md-4">
            <label className="form-label">Открывание глаз</label>
            <select className="form-select" required value={eye} onChange={(e) => setEye(e.target.value)}>
              <option value="">—</option>
              {opts.eye_opening.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Речь</label>
            <select className="form-select" required value={verbal} onChange={(e) => setVerbal(e.target.value)}>
              <option value="">—</option>
              {opts.verbal_response.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Двигательные</label>
            <select className="form-select" required value={motor} onChange={(e) => setMotor(e.target.value)}>
              <option value="">—</option>
              {opts.motor_response.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <div className="triage-yn-grid">
              <YesNoToggle name="breathing" label="Дыхание" mode="yes_good" value={breathing} onChange={setBreathing} />
              <YesNoToggle name="heartbeat" label="Сердцебиение" mode="yes_good" value={heartbeat} onChange={setHeartbeat} />
              <YesNoToggle name="seizures" label="Судороги" mode="no_good" value={seizures} onChange={setSeizures} />
              <YesNoToggle name="bleeding" label="Кровотечение" mode="no_good" value={bleeding} onChange={setBleeding} />
            </div>
          </div>
          <div className="col-12">
            <div className={`triage-score-box ${totalScore > 0 && totalScore <= 8 ? "triage-score-box--alert" : ""}`}>
              <div className="small text-muted">Сумма баллов (уровень сознания)</div>
              <div className="triage-score-total">{totalScore}</div>
              <div className="small text-muted">
                Глаза: {eyeScore} · Речь: {verbalScore} · Двигательные: {motorScore}
              </div>
            </div>
          </div>
          <div className="col-12">
            <button type="submit" className="btn btn-primary">
              {isEditMode ? "Сохранить изменения" : "Сохранить шаг"}
            </button>
          </div>
        </div>
      </form>
      <TriageStepEditConfirmDialog
        open={editDialog != null}
        title={editDialog?.title || ""}
        busy={editSaving}
        onCancel={() => {
          if (editSaving) return;
          setEditDialog(null);
          setPendingEditPayload(null);
        }}
        onConfirm={() => void confirmEditSave()}
      >
        {editDialog?.body}
      </TriageStepEditConfirmDialog>
      </div>
    </div>
  );
}
