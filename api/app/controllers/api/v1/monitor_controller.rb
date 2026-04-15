# frozen_string_literal: true

module Api
  module V1
    class MonitorController < ApplicationController
      skip_before_action :authenticate_user!, only: :patient_timer

      def patient_timer
        patient = Patient.find(params[:id])
        triage = patient.triage
        if triage
          render json: { time_remaining: triage.time_remaining, expired: triage.expired? }
        else
          render json: { time_remaining: 0, expired: true }
        end
      end

      def active_patients
        patients = Patient.joins(:triage)
          .where(triages: { timer_active: true })
          .includes(:triage)
        rows = patients.map do |patient|
          triage = patient.triage
          {
            id: patient.id,
            full_name: patient.full_name,
            performer_name: patient.performer_name,
            step: triage.step,
            step_name: triage.step_name,
            priority: triage.priority,
            time_remaining: triage.time_remaining,
            timer_ends_at: triage.timer_ends_at,
            eye_opening_score: triage.eye_score,
            verbal_score: triage.verbal_score,
            motor_score: triage.motor_score,
            consciousness_score: triage.total_consciousness_score
          }
        end
        render json: rows
      end

      def patients_payload
        render json: MonitorPatientsService.call
      end
    end
  end
end
