import { useCallback, useEffect, useRef, useState } from "react";
import { createConsumer } from "@rails/actioncable";
import { apiJson } from "../api";

export type Stage2DraftPhase = "pre_doctor" | "doctor_examination" | "decision";

type DraftCableMessage = {
  type: string;
  phase?: string;
  phase_data?: Record<string, unknown>;
  draft_revision?: number;
  draft_updated_by_user_id?: number;
  draft_updated_by_name?: string;
};

export type Stage2DraftNotice = {
  message: string;
  byName: string;
  onApply: () => void;
  onDismiss: () => void;
};

type Options = {
  patientId: string | undefined;
  phase: Stage2DraftPhase;
  userId: number | undefined;
  enabled: boolean;
  buildPayload: () => Record<string, unknown>;
  applyRemote: (phaseData: Record<string, unknown>) => void;
  onRevision?: (revision: number) => void;
  debounceMs?: number;
};

export function useStage2DraftSync({
  patientId,
  phase,
  userId,
  enabled,
  buildPayload,
  applyRemote,
  onRevision,
  debounceMs = 1200,
}: Options) {
  const revisionRef = useRef(0);
  const hydratedRef = useRef(false);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const buildPayloadRef = useRef(buildPayload);
  const applyRemoteRef = useRef(applyRemote);
  const [notice, setNotice] = useState<Stage2DraftNotice | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  buildPayloadRef.current = buildPayload;
  applyRemoteRef.current = applyRemote;

  const setRevision = useCallback(
    (rev: number) => {
      revisionRef.current = rev;
      onRevision?.(rev);
    },
    [onRevision],
  );

  const markDirty = useCallback(() => {
    if (!hydratedRef.current) return;
    dirtyRef.current = true;
  }, []);

  const saveDraftNow = useCallback(async () => {
    if (!enabled || !patientId || savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const body: Record<string, unknown> = {
        phase,
        ...buildPayloadRef.current(),
      };
      if (revisionRef.current > 0) {
        body.expected_revision = revisionRef.current;
      }
      const res = await apiJson<{
        draft_revision?: number;
        phase_data?: Record<string, unknown>;
      }>(`/api/v1/stage2/patients/${patientId}/triage/draft`, {
        method: "PATCH",
        json: body,
      });
      if (typeof res.draft_revision === "number") {
        setRevision(res.draft_revision);
      }
      dirtyRef.current = false;
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch (ex: unknown) {
      const e = ex as {
        status?: number;
        body?: {
          error?: string;
          draft_revision?: number;
          draft_updated_by_name?: string;
          phase_data?: Record<string, unknown>;
        };
      };
      if (e.status === 409 && e.body?.phase_data) {
        const byName = e.body.draft_updated_by_name || "другой пользователь";
        if (typeof e.body.draft_revision === "number") {
          setRevision(e.body.draft_revision);
        }
        setNotice({
          message: e.body.error || `Данные изменены: ${byName}`,
          byName,
          onApply: () => {
            applyRemoteRef.current(e.body!.phase_data!);
            dirtyRef.current = false;
            setNotice(null);
          },
          onDismiss: () => setNotice(null),
        });
      }
      setSaveState("error");
    } finally {
      savingRef.current = false;
    }
  }, [enabled, patientId, phase, setRevision]);

  const scheduleSave = useCallback(() => {
    markDirty();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void saveDraftNow();
    }, debounceMs);
  }, [debounceMs, markDirty, saveDraftNow]);

  const finishHydration = useCallback(
    (initialRevision?: number) => {
      if (typeof initialRevision === "number") {
        setRevision(initialRevision);
      }
      hydratedRef.current = true;
      dirtyRef.current = false;
    },
    [setRevision],
  );

  useEffect(() => {
    if (!enabled || !patientId) return;

    const consumer = createConsumer("/cable");
    const sub = consumer.subscriptions.create(
      { channel: "Stage2TriageChannel", patient_id: patientId } as never,
      {
        received(raw: DraftCableMessage) {
          if (raw.type !== "draft_updated") return;
          const cablePhase =
            raw.phase === "doctor" ? "doctor_examination" : (raw.phase as Stage2DraftPhase | undefined);
          if (cablePhase !== phase || !raw.phase_data) return;
          if (raw.draft_updated_by_user_id && userId && raw.draft_updated_by_user_id === userId) {
            if (typeof raw.draft_revision === "number") setRevision(raw.draft_revision);
            return;
          }

          if (typeof raw.draft_revision === "number") {
            setRevision(raw.draft_revision);
          }

          if (!dirtyRef.current) {
            applyRemoteRef.current(raw.phase_data);
            return;
          }

          const byName = raw.draft_updated_by_name || "другой пользователь";
          setNotice({
            message: `${byName} обновил(а) данные пациента`,
            byName,
            onApply: () => {
              applyRemoteRef.current(raw.phase_data!);
              dirtyRef.current = false;
              setNotice(null);
            },
            onDismiss: () => setNotice(null),
          });
        },
      },
    );

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (dirtyRef.current) void saveDraftNow();
      sub.unsubscribe();
      consumer.disconnect();
      hydratedRef.current = false;
    };
  }, [enabled, patientId, phase, userId, saveDraftNow, setRevision]);

  return {
    notice,
    saveState,
    scheduleSave,
    saveDraftNow,
    finishHydration,
    setRevision,
  };
}
