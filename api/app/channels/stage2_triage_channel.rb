# frozen_string_literal: true

class Stage2TriageChannel < ApplicationCable::Channel
  def subscribed
    pid = params["patient_id"] || params[:patient_id]
    if pid.present?
      stream_from "stage2_triage:#{pid}"
    else
      reject
    end
  end
end
