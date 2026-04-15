# frozen_string_literal: true

module Api
  module V1
    class TriageActionsController < ApplicationController
      before_action :set_patient
      before_action :set_triage
      before_action :ensure_triage!

      def show
        if @triage.priority == "pending"
          return render json: { error: "Приоритет не определён — завершите шаги триажа." }, status: :unprocessable_entity
        end

        if (@triage.priority_actions.any? || @triage.red_arrest_actions_flow?) && !@triage.actions_started_at && !@triage.actions_completed?
          @triage.start_actions!
          @triage.reload
        end

        render json: { triage: TriageStatePresenter.call(@patient, @triage) }
      end

      def mark
        if @triage.red_arrest_actions_flow?
          return render json: { error: "Этот приоритет использует отдельный сценарий действий" }, status: :unprocessable_entity
        end

        action_key = params[:triage_action].presence || params[:priority_action].presence || params[:action_key]
        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        @triage.mark_action!(action_key)
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name
        TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_marked",
          payload: { action: action_key, performer_name: pname })

        final_action = @triage.final_action
        can_complete = @triage.can_complete_final_action? && final_action && @triage.action_completed?(final_action[:key])

        render json: {
          success: true,
          action: action_key,
          can_complete_final: @triage.can_complete_final_action?,
          can_complete: can_complete,
          brigade_timer_ends_at: @triage.brigade_timer_ends_at,
          triage: TriageStatePresenter.call(@patient, @triage)
        }
      end

      def unmark
        if @triage.red_arrest_actions_flow?
          return render json: { error: "Этот приоритет использует отдельный сценарий действий" }, status: :unprocessable_entity
        end

        action_key = params[:triage_action].presence || params[:priority_action].presence || params[:action_key]
        final_action = @triage.final_action
        if final_action && action_key == final_action[:key] && @triage.actions_completed?
          return render json: { error: "Действия уже завершены" }, status: :unprocessable_entity
        end

        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        @triage.unmark_action!(action_key)
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name
        TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_unmarked",
          payload: { action: action_key, performer_name: pname })

        render json: {
          success: true,
          action: action_key,
          can_complete_final: @triage.can_complete_final_action?,
          can_complete: false,
          triage: TriageStatePresenter.call(@patient, @triage)
        }
      end

      def complete
        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        if @triage.complete_actions!
          @triage.reload
          pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "actions_completed",
            payload: { performer_name: pname, priority: @triage.priority })
          render json: { success: true, triage: TriageStatePresenter.call(@patient, @triage) }
        else
          render json: { error: "Не все действия выполнены" }, status: :unprocessable_entity
        end
      end

      def red_arrest_brigade
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.red_arrest_actions_flow?

        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        res = @triage.mark_red_arrest_brigade!
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name
        if res == :ok_new
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_marked",
            payload: { action: "ra_brigade_called", performer_name: pname })
        end
        return render json: { error: "не удалось сохранить" }, status: :unprocessable_entity if res == :invalid

        render json: {
          success: true,
          brigade_timer_ends_at: @triage.brigade_timer_ends_at,
          can_complete: @triage.can_complete_red_arrest?,
          triage: TriageStatePresenter.call(@patient, @triage)
        }
      end

      def red_arrest_toggle
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.red_arrest_actions_flow?

        group = params[:group].to_s
        key = params[:key].to_s
        checked = truthy?(params[:checked])

        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        unless @triage.toggle_red_arrest_item!(group, key, checked)
          return render json: { error: "не удалось сохранить" }, status: :unprocessable_entity
        end
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name

        audit_key = group == "team" ? "ra_team_#{key}" : "ra_manip_#{key}"
        ev = checked ? "priority_action_marked" : "priority_action_unmarked"
        TriageAuditEvent.log!(patient: @patient, triage: @triage, type: ev,
          payload: { action: audit_key, performer_name: pname })

        render json: { success: true, can_complete: @triage.can_complete_red_arrest?, triage: TriageStatePresenter.call(@patient, @triage) }
      end

      def red_arrest_vital
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.red_arrest_actions_flow?

        vk = params[:key].to_s
        allowed_keys = %w[
          bp_1 bp_2 bp_3
          pulse_1 pulse_2 pulse_3
          saturation_1 saturation_2 saturation_3
          fetal_heartbeat active_bleeding
        ]
        return render json: { error: "ключ" }, status: :unprocessable_entity unless allowed_keys.include?(vk)

        val = params[:value].to_s
        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        @triage.set_red_arrest_vital!(vk, val)
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name

        audit_action = case vk
                       when "bp_1" then "ra_vital_bp_1"
                       when "bp_2" then "ra_vital_bp_2"
                       when "bp_3" then "ra_vital_bp_3"
                       when "pulse_1" then "ra_vital_pulse_1"
                       when "pulse_2" then "ra_vital_pulse_2"
                       when "pulse_3" then "ra_vital_pulse_3"
                       when "saturation_1" then "ra_vital_saturation_1"
                       when "saturation_2" then "ra_vital_saturation_2"
                       when "saturation_3" then "ra_vital_saturation_3"
                       when "fetal_heartbeat"
                         val.strip == "no" ? "ra_vital_fetal_heartbeat_no" : "ra_vital_fetal_heartbeat_yes"
                       when "active_bleeding"
                         val.strip == "yes" ? "ra_vital_active_bleeding_yes" : "ra_vital_active_bleeding_no"
                       end
        if val.strip.present?
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_marked",
            payload: { action: audit_action, value: val.strip, performer_name: pname })
        end

        render json: { success: true, can_complete: @triage.can_complete_red_arrest?, triage: TriageStatePresenter.call(@patient, @triage) }
      end

      private

      def set_patient
        @patient = Patient.find(params[:patient_id])
      end

      def set_triage
        @triage = @patient.triage
      end

      def ensure_triage!
        return if @triage

        render json: { error: "Триаж не найден" }, status: :not_found
      end

      def truthy?(v)
        v == true || v.to_s == "true" || v == "1" || v == 1
      end
    end
  end
end
