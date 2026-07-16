# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class PhaseEditsController < ApplicationController
        before_action :set_patient_and_case
        before_action -> { enforce_other_modify! }, only: %i[preview update]
        before_action :set_triage
        before_action :validate_phase_access!, only: %i[preview update]

        def preview
          return render json: { ok: false, error: "Триаж этапа 2 не найден" }, status: :not_found unless @triage

          result = @triage.preview_phase_update(params[:phase], phase_params)
          render json: result.merge(ok: true)
        rescue ArgumentError => e
          render json: { ok: false, error: e.message }, status: :unprocessable_entity
        end

        def update
          return render json: { ok: false, error: "Триаж этапа 2 не найден" }, status: :not_found unless @triage

          before_priority = @triage.priority
          @triage.apply_update_phase!(params[:phase], phase_params)

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "stage2_phase_edit_saved",
            payload: {
              phase: params[:phase],
              priority: @triage.priority,
              before_priority: before_priority,
              performer_name: current_user&.full_name || @stage2_case.performer_name
            }
          )

          render json: {
            ok: true,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        rescue ArgumentError => e
          render json: { ok: false, error: e.message }, status: :unprocessable_entity
        end

        private

        def set_patient_and_case
          @patient = Patient.find(params[:patient_id])
          @stage2_case = @patient.stage2_case
          return if @stage2_case

          render json: { error: "Пациент не на этапе 2" }, status: :not_found
        end

        def set_triage
          @triage = @stage2_case&.stage2_triage
        end

        def enforce_other_modify!
          return if Stage2PatientListPresenter.case_performer?(@stage2_case, @patient, current_user)
          return unless other_role_user?

          render json: { error: 'Недостаточно прав: пользователь с ролью "Прочее" может изменять только своих пациентов.' },
            status: :forbidden
        end

        def other_role_user?
          current_user&.job_position&.kind == "other"
        end

        def validate_phase_access!
          return unless @triage

          phase_key = @triage.send(:normalize_phase_edit_key, params[:phase])
          case phase_key
          when "pre_doctor"
            return if @triage.pre_doctor_completed?

            render json: { ok: false, error: "Доврачебный этап ещё не пройден" }, status: :forbidden
          when "doctor_examination"
            return if @triage.doctor_examination_completed?

            render json: { ok: false, error: "Врачебный осмотр ещё не пройден" }, status: :forbidden
          when "decision"
            return if @triage.decision_data["completed_at"].present?

            render json: { ok: false, error: "Решение ещё не принято" }, status: :forbidden
          else
            render json: { ok: false, error: "Неверная фаза" }, status: :bad_request
          end
        end

        def phase_params
          phase_key = @triage.send(:normalize_phase_edit_key, params[:phase])
          case phase_key
          when "pre_doctor"
            pre_doctor_params
          when "doctor_examination"
            doctor_examination_params
          when "decision"
            decision_params.to_h
          else
            {}
          end
        end

        def pre_doctor_params
          src = params[:pre_doctor].present? ? params.require(:pre_doctor) : params
          p = src.permit(
            :discharge,
            :fetal_heart_rate,
            :uterine_tone,
            :pain_vas,
            :skin_color,
            :skin_finding,
            :has_rash,
            :has_edema,
            :rash_description,
            :edema_location,
            :contraction_duration_sec,
            :contraction_interval_min,
            :doctor_called,
            :ctg_ordered,
            :ultrasound_ordered,
            vitals: %i[systolic_bp diastolic_bp heart_rate respiratory_rate saturation]
          )
          {
            discharge: p[:discharge],
            fetal_heart_rate: p[:fetal_heart_rate],
            uterine_tone: p[:uterine_tone],
            pain_vas: p[:pain_vas],
            skin_color: p[:skin_color],
            skin_finding: p[:skin_finding],
            has_rash: p[:has_rash],
            has_edema: p[:has_edema],
            rash_description: p[:rash_description],
            edema_location: p[:edema_location],
            contraction_duration_sec: p[:contraction_duration_sec],
            contraction_interval_min: p[:contraction_interval_min],
            doctor_called: p[:doctor_called],
            ctg_ordered: p[:ctg_ordered],
            ultrasound_ordered: p[:ultrasound_ordered],
            vitals: (p[:vitals] || {}).to_h
          }
        end

        def doctor_examination_params
          src = params[:doctor_examination].present? ? params.require(:doctor_examination) : params
          p = src.permit(
            :medical_conclusion,
            investigations: %i[
              ctg_done ultrasound_done
              labs_blood labs_urine labs_biochemistry labs_hiv labs_syphilis labs_hemostasis labs_blood_group
              labs_blood_done labs_urine_done
            ],
            ctg: %i[result_type basal_hr custom_text],
            ultrasound: %i[finding disorders_text]
          )
          {
            medical_conclusion: p[:medical_conclusion],
            investigations: (p[:investigations] || {}).to_h,
            ctg: (p[:ctg] || {}).to_h,
            ultrasound: (p[:ultrasound] || {}).to_h
          }
        end

        def decision_params
          src = params[:decision].present? ? params.require(:decision) : params
          src.permit(:priority, :note)
        end
      end
    end
  end
end
