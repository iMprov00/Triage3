# frozen_string_literal: true

class Stage2PatientsListChannel < ApplicationCable::Channel
  def subscribed
    stream_from "stage2_patients_list"
  end
end
