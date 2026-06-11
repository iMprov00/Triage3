# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class TriagesController < ApplicationController
        before_action :set_patient_and_case

        def show
          render json: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
        end

        def pre_doctor
          st = @stage2_case.stage2_triage
          unless st
            return render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
          end

          if st.pre_doctor_completed?
            return render json: { error: "Доврачебный этап уже завершён" }, status: :unprocessable_entity
          end

          attrs = pre_doctor_params
          priority = st.submit_pre_doctor!(attrs)
          st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "pre_doctor_submitted",
            payload: { pre_doctor: st.pre_doctor_data }
          )
          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "priority_assigned",
            payload: { priority: priority, source: "pre_doctor" }
          )

          render json: {
            ok: true,
            result: "priority_assigned",
            priority: priority,
            priority_name: st.priority_name,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        rescue ArgumentError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        def advance
          st = @stage2_case.stage2_triage
          unless st
            return render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
          end

          if st.completed?
            return render json: { error: "Этап 2 уже завершён" }, status: :unprocessable_entity
          end

          prev = st.current_phase
          unless st.advance_phase!
            return render json: { error: "Невозможно перейти дальше" }, status: :unprocessable_entity
          end

          st.reload
          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "phase_advanced",
            payload: { from: prev, to: st.current_phase }
          )

          render json: {
            success: true,
            stage2_triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        end

        private

        def set_patient_and_case
          @patient = Patient.find(params[:patient_id])
          @stage2_case = @patient.stage2_case
          return if @stage2_case

          render json: { error: "Пациент не на этапе 2" }, status: :not_found
        end

        def pre_doctor_params
          src = params[:pre_doctor].present? ? params.require(:pre_doctor) : params
          p = src.permit(
            :discharge,
            :fetal_heart_rate,
            :uterine_tone,
            :pain_vas,
            :skin_finding,
            :edema_location,
            :contraction_duration_sec,
            :contraction_interval_min,
            vitals: %i[systolic_bp diastolic_bp heart_rate respiratory_rate saturation]
          )
          {
            discharge: p[:discharge],
            fetal_heart_rate: p[:fetal_heart_rate],
            uterine_tone: p[:uterine_tone],
            pain_vas: p[:pain_vas],
            skin_finding: p[:skin_finding],
            edema_location: p[:edema_location],
            contraction_duration_sec: p[:contraction_duration_sec],
            contraction_interval_min: p[:contraction_interval_min],
            vitals: (p[:vitals] || {}).to_h
          }
        end
      end
    end
  end
end
