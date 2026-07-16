# frozen_string_literal: true

module Api
  module V1
    class StatisticsController < ApplicationController
      def dashboard
        date = params[:admission_date].presence || Date.today
        render json: TriageDepartmentDashboardService.call(admission_date: date)
      end

      def cohort
        prm = params.permit(
          :admission_date, :date_from, :date_to, :category, :priority, :page, :per_page
        )
        result = TriageDepartmentCohortService.call(params: prm.to_unsafe_h, viewer: current_user)
        if result[:error]
          render json: result, status: :unprocessable_entity
        else
          render json: result
        end
      end

      def detailed
        prm = params.permit(
          :date_from, :date_to, :search, :appeal_type, :pregnancy_condition,
          :performer_filter, :only_active, :priority, :page, :per_page
        )
        render json: TriageDepartmentDetailedService.call(params: prm.to_unsafe_h.symbolize_keys, viewer: current_user)
      end

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
              payload = ev.payload_hash
              action_key = payload["action"].to_s
              {
                id: ev.id,
                event_type: ev.event_type,
                event_label: TriageAuditEvent::EVENT_LABELS[ev.event_type.to_s] || ev.event_type.to_s,
                occurred_at: ev.occurred_at,
                payload: payload,
                action_text: action_key.present? ? Triage.action_display_text(action_key, payload) : nil
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
          triage: selected&.triage ? TriageStatePresenter.call(selected, selected.triage, viewer: current_user) : nil,
          audit_events: audit_events,
          step_timing: selected&.triage&.statistics_step_rows,
          actions_phase: selected&.triage&.statistics_actions_phase,
          total_seconds: selected&.triage&.statistics_total_triage_seconds
        }
      end
    end
  end
end
