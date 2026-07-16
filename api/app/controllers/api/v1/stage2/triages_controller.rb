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
          suggested = st.submit_pre_doctor!(attrs, user: current_user)
          st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "pre_doctor_submitted",
            payload: {
              pre_doctor: st.pre_doctor_data,
              accepted_at: st.pre_doctor_data["accepted_at"],
              completed_at: st.pre_doctor_data["completed_at"],
              duration_seconds: st.pre_doctor_data["duration_seconds"]
            }
          )
          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "suggested_priority_computed",
            payload: { suggested_priority: suggested }
          )

          render json: {
            ok: true,
            result: "pre_doctor_completed",
            suggested_priority: suggested,
            suggested_priority_name: st.suggested_priority_name,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        rescue ArgumentError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        def doctor_examination
          st = @stage2_case.stage2_triage
          unless st
            return render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
          end

          unless st.pre_doctor_completed?
            return render json: { error: "Сначала завершите доврачебный осмотр" }, status: :unprocessable_entity
          end

          if st.doctor_examination_completed?
            return render json: { error: "Врачебный осмотр уже завершён" }, status: :unprocessable_entity
          end

          attrs = doctor_examination_params
          st.submit_doctor_examination!(attrs, user: current_user)
          st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "doctor_examination_submitted",
            payload: { doctor: st.doctor_data }
          )

          render json: {
            ok: true,
            result: "doctor_examination_completed",
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        rescue ArgumentError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        def decision
          st = @stage2_case.stage2_triage
          unless st
            return render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
          end

          unless st.pre_doctor_completed?
            return render json: { error: "Сначала завершите доврачебный осмотр" }, status: :unprocessable_entity
          end

          unless st.doctor_examination_completed?
            return render json: { error: "Сначала завершите врачебный осмотр" }, status: :unprocessable_entity
          end

          if st.decision_completed? && st.decision_data["completed_at"].present?
            return render json: { error: "Решение уже принято" }, status: :unprocessable_entity
          end

          priority = decision_params[:priority].to_s
          note = decision_params[:note]
          st.submit_decision!(priority: priority, note: note, user: current_user)
          st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "decision_confirmed",
            payload: {
              priority: priority,
              suggested_priority: st.suggested_priority,
              note: note
            }
          )

          render json: {
            ok: true,
            priority: priority,
            priority_name: st.priority_name,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        rescue ArgumentError => e
          render json: { error: e.message }, status: :unprocessable_entity
        end

        def draft
          st = @stage2_case.stage2_triage
          unless st
            return render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
          end

          phase = params[:phase].presence || params[:draft_phase].presence
          unless phase.present?
            return render json: { error: "Укажите phase" }, status: :unprocessable_entity
          end

          payload = draft_payload_for(phase)
          expected_revision = params[:expected_revision].presence
          merged = st.save_draft!(phase, payload, user: current_user, expected_revision: expected_revision)

          render json: {
            ok: true,
            phase: phase,
            draft_revision: merged["draft_revision"],
            draft_updated_at: merged["draft_updated_at"],
            draft_updated_by_name: merged["draft_updated_by_name"],
            phase_data: merged
          }
        rescue Stage2Triage::DraftConflictError => e
          render json: {
            error: e.message,
            draft_revision: e.draft_revision,
            draft_updated_by_name: e.updated_by_name,
            phase_data: e.phase_data
          }, status: :conflict
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

        def draft_payload_for(phase)
          case phase.to_s
          when "pre_doctor"
            pre_doctor_params
          when "doctor_examination", "doctor"
            doctor_examination_params
          when "decision"
            decision_params.to_h
          else
            {}
          end
        end
      end
    end
  end
end
