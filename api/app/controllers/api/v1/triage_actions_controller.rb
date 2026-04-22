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

        render json: { triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user) }
      end

      def mark
        if @triage.actions_flow_kind.present?
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
          triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user)
        }
      end

      def unmark
        if @triage.actions_flow_kind.present?
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
          triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user)
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
          render json: { success: true, triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user) }
        else
          render json: { error: "Не все действия выполнены" }, status: :unprocessable_entity
        end
      end

      def red_arrest_brigade
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.actions_flow_kind.present?

        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        res = @triage.mark_red_arrest_brigade!
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name
        if res == :ok_new
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_marked",
            payload: { action: "#{@triage.actions_flow_kind}_brigade_called", performer_name: pname })
        end
        return render json: { error: "не удалось сохранить" }, status: :unprocessable_entity if res == :invalid

        render json: {
          success: true,
          brigade_timer_ends_at: @triage.brigade_timer_ends_at,
          can_complete: @triage.can_complete_actions_flow?,
          triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user)
        }
      end

      def red_arrest_toggle
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.actions_flow_kind.present?

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

        prefix = @triage.actions_flow_kind
        audit_key = group == "team" ? "#{prefix}_team_#{key}" : "#{prefix}_manip_#{key}"
        ev = checked ? "priority_action_marked" : "priority_action_unmarked"
        TriageAuditEvent.log!(patient: @patient, triage: @triage, type: ev,
          payload: { action: audit_key, performer_name: pname })

        render json: { success: true, can_complete: @triage.can_complete_actions_flow?, triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user) }
      end

      def red_arrest_vital
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage
        return render json: { error: "Недоступно" }, status: :unprocessable_entity unless @triage.actions_flow_kind.present?

        vk = params[:key].to_s
        schema = @triage.actions_flow_schema || {}
        base_keys = (schema[:vitals] || []).map { |v| v[:key].to_s }
        allowed_keys = base_keys + base_keys.flat_map { |base| ["#{base}_1", "#{base}_2", "#{base}_3"] }
        if @triage.actions_flow_kind == "red_arrest"
          allowed_keys += %w[fetal_heartbeat active_bleeding]
        end
        return render json: { error: "ключ" }, status: :unprocessable_entity unless allowed_keys.include?(vk)

        val = params[:value].to_s
        action_uid = resolve_step_performer_user_id(@patient)
        @triage.set_step_performer_user!("actions", action_uid)
        @triage.set_red_arrest_vital!(vk, val)
        @triage.reload
        pname = acting_performer_name_for_user_id(action_uid) || @patient.performer_name

        prefix = @triage.actions_flow_kind
        audit_action = if vk == "fetal_heartbeat"
                         val.strip == "no" ? "#{prefix}_vital_fetal_heartbeat_no" : "#{prefix}_vital_fetal_heartbeat_yes"
                       elsif vk == "active_bleeding"
                         val.strip == "yes" ? "#{prefix}_vital_active_bleeding_yes" : "#{prefix}_vital_active_bleeding_no"
                       else
                         "#{prefix}_vital_#{vk}"
                       end
        if val.strip.present?
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "priority_action_marked",
            payload: { action: audit_action, value: val.strip, performer_name: pname })
        end

        render json: { success: true, can_complete: @triage.can_complete_actions_flow?, triage: TriageStatePresenter.call(@patient, @triage, viewer: current_user) }
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
