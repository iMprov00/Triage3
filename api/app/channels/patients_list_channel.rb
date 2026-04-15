# frozen_string_literal: true

class PatientsListChannel < ApplicationCable::Channel
  def subscribed
    stream_from "patients_list"
  end
end
