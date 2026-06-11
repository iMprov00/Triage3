# frozen_string_literal: true

module BroadcastsStage2Realtime
  extend ActiveSupport::Concern

  included do
    after_commit :broadcast_stage2_updates, on: %i[create update destroy]
  end

  private

  def broadcast_stage2_updates
    payload = {
      type: "monitor_tick",
      patients: Stage2MonitorPatientsService.call,
      at: Time.now.to_f
    }
    ActionCable.server.broadcast("stage2_patients_list", { type: "refresh" })
    ActionCable.server.broadcast("stage2_patients_list", payload)
  rescue StandardError => e
    Rails.logger.warn("[BroadcastsStage2Realtime] #{e.class}: #{e.message}")
  end
end
