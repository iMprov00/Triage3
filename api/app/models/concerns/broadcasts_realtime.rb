# frozen_string_literal: true

# Рассылка обновлений монитора и конкретного триажа (Action Cable).
module BroadcastsRealtime
  extend ActiveSupport::Concern

  included do
    after_commit :broadcast_realtime_updates, on: %i[create update destroy]
  end

  private

  def broadcast_realtime_updates
    case self
    when Triage
      broadcast_triage_streams
    when Patient
      broadcast_patient_streams
    end
  rescue StandardError => e
    Rails.logger.warn("[BroadcastsRealtime] #{e.class}: #{e.message}")
  end

  def broadcast_triage_streams
    p = patient
    return unless p

    reload
    payload = { type: "triage_updated", triage: TriageStatePresenter.call(p, self) }
    ActionCable.server.broadcast("triage:#{p.id}", payload)
    ActionCable.server.broadcast("monitor", monitor_broadcast_envelope)
    ActionCable.server.broadcast("patients_list", { type: "refresh" })
  end

  def broadcast_patient_streams
    p = self
    tri = triage
    payload = {
      type: "patient_updated",
      patient_id: p.id,
      triage: tri ? TriageStatePresenter.call(p, tri) : nil
    }
    ActionCable.server.broadcast("triage:#{p.id}", payload)
    ActionCable.server.broadcast("monitor", monitor_broadcast_envelope)
    ActionCable.server.broadcast("patients_list", { type: "refresh" })
  end

  def monitor_broadcast_envelope
    { type: "monitor_tick", patients: MonitorPatientsService.call, at: Time.now.to_f }
  end
end
