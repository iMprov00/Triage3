# frozen_string_literal: true

module Api
  module V1
    class TriagesController < ApplicationController
      before_action :set_patient
      before_action :enforce_other_patient_modify_permission!, only: :start

      def show
        triage = @patient.triage
        return render json: { error: "Триаж не начат" }, status: :not_found unless triage

        render json: TriageStatePresenter.call(@patient, triage)
      end

      def start
        if @patient.triage.present?
          return render json: { error: "Триаж для этого пациента уже начат." }, status: :unprocessable_entity
        end

        triage = @patient.start_triage!
        TriageAuditEvent.log!(
          patient: @patient,
          triage: triage,
          type: "triage_started",
          payload: { performer_name: @patient.performer_name }
        )
        render json: { ok: true, triage: TriageStatePresenter.call(@patient, triage.reload) }
      end

      def step1
        triage = @patient.triage
        unless triage
          return render json: { error: "Триаж не найден" }, status: :not_found
        end

        step_data = {
          "eye_opening" => params[:eye_opening],
          "verbal_response" => params[:verbal_response],
          "motor_response" => params[:motor_response],
          "breathing" => truthy?(params[:breathing]),
          "heartbeat" => truthy?(params[:heartbeat]),
          "seizures" => truthy?(params[:seizures]),
          "active_bleeding" => truthy?(params[:active_bleeding])
        }

        triage.update_step_data(1, step_data)
        step_uid = resolve_step_performer_user_id(@patient)
        triage.set_step_performer_user!(1, step_uid)
        triage.save!

        result = triage.advance_step
        triage.reload
        acting_name = acting_performer_name_for_user_id(step_uid)
        TriageAuditEvent.log_step_submit!(@patient, triage, 1, result,
          timer_expired: truthy?(params[:timer_expired]),
          acting_performer_name: acting_name)

        render json: { ok: true, result: result, triage: TriageStatePresenter.call(@patient, triage) }
      end

      def step2
        triage = @patient.triage
        unless triage
          return render json: { error: "Триаж не найден" }, status: :not_found
        end

        step_data = {
          "position" => params[:position],
          "urgency_criteria" => params[:urgency_criteria] || [],
          "infection_signs" => params[:infection_signs] || []
        }

        triage.update_step_data(2, step_data)
        step_uid = resolve_step_performer_user_id(@patient)
        triage.set_step_performer_user!(2, step_uid)
        triage.save!

        result = triage.advance_step
        triage.reload
        acting_name = acting_performer_name_for_user_id(step_uid)
        TriageAuditEvent.log_step_submit!(@patient, triage, 2, result,
          timer_expired: truthy?(params[:timer_expired]),
          acting_performer_name: acting_name)

        render json: { ok: true, result: result, triage: TriageStatePresenter.call(@patient, triage) }
      end

      def step3
        triage = @patient.triage
        unless triage
          return render json: { error: "Триаж не найден" }, status: :not_found
        end

        step_data = {
          "respiratory_rate" => params[:respiratory_rate],
          "saturation" => params[:saturation],
          "systolic_bp" => params[:systolic_bp],
          "diastolic_bp" => params[:diastolic_bp],
          "heart_rate" => params[:heart_rate],
          "temperature" => params[:temperature]
        }

        triage.update_step_data(3, step_data)
        step_uid = resolve_step_performer_user_id(@patient)
        triage.set_step_performer_user!(3, step_uid)
        triage.save!

        result = triage.advance_step
        triage.reload
        acting_name = acting_performer_name_for_user_id(step_uid)
        TriageAuditEvent.log_step_submit!(@patient, triage, 3, result,
          timer_expired: truthy?(params[:timer_expired]),
          acting_performer_name: acting_name)

        render json: { ok: true, result: result, triage: TriageStatePresenter.call(@patient, triage) }
      end

      def full_view
        triage = @patient.triage
        return render json: { error: "Триаж не найден" }, status: :not_found unless triage

        render json: { patient: PatientListPresenter.to_list_hash(@patient, current_user), triage: TriageStatePresenter.call(@patient, triage) }
      end

      private

      def set_patient
        @patient = Patient.find(params[:patient_id])
      end

      def truthy?(v)
        v == true || v.to_s == "true" || v == "1" || v == 1
      end

    end
  end
end
