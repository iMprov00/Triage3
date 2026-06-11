# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class TriageActionsController < ApplicationController
        before_action :set_patient_and_case
        before_action :set_stage2_triage

        def show
          if @st.priority == "pending"
            return render json: { error: "Приоритет не определён — завершите шаг принятия решения." },
              status: :unprocessable_entity
          end

          if !@st.actions_started_at && !@st.actions_completed?
            @st.update!(actions_started_at: Time.current)
            @st.reload
          end

          render json: {
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        end

        def mark
          action_key = params[:triage_action].presence || params[:priority_action].presence || params[:action_key]
          unless action_key.present? && @st.priority_actions.any? { |a| a[:key] == action_key }
            return render json: { error: "Неизвестное действие" }, status: :unprocessable_entity
          end

          @st.mark_action!(action_key)
          @st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "priority_action_marked",
            payload: { action: action_key }
          )

          final_action = @st.priority_actions.find { |a| a[:final] }
          can_complete = @st.can_complete_final_action? && final_action && @st.action_completed?(final_action[:key])

          render json: {
            success: true,
            action: action_key,
            can_complete_final: @st.can_complete_final_action?,
            can_complete: can_complete,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        end

        def unmark
          action_key = params[:triage_action].presence || params[:priority_action].presence || params[:action_key]
          final_action = @st.priority_actions.find { |a| a[:final] }
          if final_action && action_key == final_action[:key] && @st.actions_completed?
            return render json: { error: "Действия уже завершены" }, status: :unprocessable_entity
          end

          @st.unmark_action!(action_key)
          @st.reload

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "priority_action_unmarked",
            payload: { action: action_key }
          )

          render json: {
            success: true,
            action: action_key,
            can_complete_final: @st.can_complete_final_action?,
            can_complete: false,
            triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
          }
        end

        def complete
          if @st.complete_actions!
            @st.reload
            Stage2AuditEvent.log!(
              patient: @patient,
              stage2_case: @stage2_case,
              type: "actions_completed",
              payload: { priority: @st.priority }
            )
            render json: {
              success: true,
              triage: Stage2TriageStatePresenter.call(@patient, @stage2_case, viewer: current_user)
            }
          else
            render json: { error: "Не все действия выполнены" }, status: :unprocessable_entity
          end
        end

        private

        def set_patient_and_case
          @patient = Patient.find(params[:patient_id])
          @stage2_case = @patient.stage2_case
          return if @stage2_case

          render json: { error: "Пациент не на этапе 2" }, status: :not_found
        end

        def set_stage2_triage
          @st = @stage2_case&.stage2_triage
          return if @st

          render json: { error: "Триаж этапа 2 не найден" }, status: :not_found
        end
      end
    end
  end
end
