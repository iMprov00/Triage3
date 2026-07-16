# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class CasesController < ApplicationController
        def eligible_from_stage1
          list = Stage2EligiblePatientsService.call(eligible_params)
          render json: list.map { |p| eligible_hash(p) }
        end

        def create
          patient = Patient.find(params[:patient_id])
          case_record = Stage2TransferService.transfer!(
            patient: patient,
            source: :manual,
            user: current_user
          )
          render json: {
            ok: true,
            patient: Stage2PatientListPresenter.to_list_hash(patient.reload, case_record, current_user)
          }, status: :created
        rescue Stage2TransferService::TransferError => e
          render json: { error: e.message }, status: :unprocessable_entity
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Пациент не найден" }, status: :not_found
        end

        private

        def eligible_params
          params.permit(:search, :admission_date).to_h
        end

        def eligible_hash(patient)
          t = patient.triage
          {
            id: patient.id,
            full_name: patient.full_name,
            admission_date: patient.admission_date.to_s,
            admission_time: patient.admission_time_formatted,
            performer_name: patient.performer_name,
            appeal_type: patient.appeal_type,
            stage1_priority: t&.priority,
            stage1_priority_name: t&.priority_name,
            actions_completed_at: PatientListPresenter.format_time_nsk(t&.actions_completed_at, "%d.%m.%Y %H:%M")
          }
        end
      end
    end
  end
end
