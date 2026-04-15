# frozen_string_literal: true

module Api
  module V1
    class TriageStepEditsController < ApplicationController
      before_action :set_patient
      before_action :enforce_other_patient_modify_permission!, only: %i[preview update]
      before_action :set_triage
      before_action :validate_step_access!, only: %i[preview update]

      def preview
        step_num = params[:step].to_i
        return render json: { ok: false, error: "Триаж не найден" }, status: :not_found unless @triage

        if @triage.actions_completed?
          return render json: { ok: false, error: "Действия по приоритету завершены. Редактирование недоступно." },
            status: :forbidden
        end

        if step_num < 1 || step_num > 3
          return render json: { ok: false, error: "Неверный шаг" }, status: :bad_request
        end

        render json: @triage.preview_step_update(step_num, params.to_unsafe_h).merge(ok: true)
      end

      def update
        step_num = params[:step].to_i
        return render json: { error: "Триаж не найден" }, status: :not_found unless @triage

        if @triage.actions_completed?
          return render json: { error: "Действия по приоритету завершены. Редактирование недоступно." }, status: :forbidden
        end

        if step_num < 1 || step_num > 3
          return render json: { error: "Неверный шаг" }, status: :bad_request
        end

        was_completed = @triage.completed_at.present?
        before_data = Marshal.load(Marshal.dump(@triage.step_data(step_num) || {}))

        @triage.apply_update_step!(step_num, params)

        if @triage.save
          @triage.reload
          after_data = @triage.step_data(step_num) || {}
          changed_fields = (before_data.keys.map(&:to_s) | after_data.keys.map(&:to_s)).filter_map do |k|
            b = before_data[k] || before_data[k.to_sym]
            a = after_data[k] || after_data[k.to_sym]
            next if b == a

            { field: k, before: b, after: a }
          end
          TriageAuditEvent.log!(patient: @patient, triage: @triage, type: "triage_edit_saved",
            payload: {
              step: step_num,
              priority: @triage.priority,
              performer_name: current_user&.full_name || @patient.performer_name,
              changed_fields: changed_fields
            })

          hint =
            if @triage.completed_at
              was_completed ? "priority_changed" : "triage_completed"
            else
              "continue_step"
            end

          render json: {
            ok: true,
            triage: TriageStatePresenter.call(@patient, @triage),
            notice_hint: hint,
            next_step: @triage.completed_at ? nil : @triage.step
          }
        else
          render json: { ok: false, errors: @triage.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_patient
        @patient = Patient.find(params[:patient_id])
      end

      def set_triage
        @triage = @patient.triage
      end

      def validate_step_access!
        return unless @triage

        step_num = params[:step].to_i
        return if step_num < 1 || step_num > 3
        return unless step_num > @triage.step && !@triage.completed_at

        render json: { ok: false, error: "Этот шаг еще не был пройден" }, status: :forbidden
      end
    end
  end
end
