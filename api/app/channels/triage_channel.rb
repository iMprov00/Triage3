# frozen_string_literal: true

class TriageChannel < ApplicationCable::Channel
  def subscribed
    pid = params["patient_id"] || params[:patient_id]
    if pid.present?
      stream_from "triage:#{pid}"
    else
      reject
    end
  end
end
