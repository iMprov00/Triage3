# frozen_string_literal: true

module Api
  module V1
    class StatisticsController < ApplicationController
      def show
        prm = params.permit(:search, :admission_date, :appeal_type, :pregnancy_condition, :performer_filter, :only_active, :patient_id).to_h
        prm[:admission_date] ||= Date.today.to_s
        merged = PatientsListService.merged_list(prm.symbolize_keys)

        selected = nil
        audit_events = []
        if prm[:patient_id].present?
          selected = Patient.find_by(id: prm[:patient_id])
          if selected
            audit_events = selected.triage_audit_events.includes(:triage).order(:occurred_at).map do |ev|
              {
                id: ev.id,
                event_type: ev.event_type,
                occurred_at: ev.occurred_at,
                payload: ev.payload_hash
              }
            end
          end
        end

        for_select =
          if selected && merged.none? { |p| p.id == selected.id }
            [selected] + merged
          else
            merged
          end

        render json: {
          patients: for_select.map { |p| PatientListPresenter.to_list_hash(p, current_user) },
          selected_patient_id: selected&.id,
          triage: selected&.triage ? TriageStatePresenter.call(selected, selected.triage) : nil,
          audit_events: audit_events,
          step_timing: selected&.triage&.statistics_step_rows,
          actions_phase: selected&.triage&.statistics_actions_phase,
          total_seconds: selected&.triage&.statistics_total_triage_seconds
        }
      end
    end
  end
end
