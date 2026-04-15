# frozen_string_literal: true

module Api
  module V1
    class ApplicationController < ActionController::API
      include ActionController::Cookies

      before_action :authenticate_user!

      private

      def authenticate_user!
        return if current_user

        render json: { error: "Войдите в систему" }, status: :unauthorized
      end

      def current_user
        @current_user ||= User.find_by(id: session[:user_id])
      end

      def other_role_user?
        current_user&.job_position&.kind == "other"
      end

      def current_user_is_patient_performer?(patient)
        return false unless current_user && patient

        if patient.performer_user_id.present? && patient.performer_user_id == current_user.id
          return true
        end

        patient.performer_name.to_s.strip == current_user.full_name.to_s.strip
      end

      def restricted_other_can_modify_patient?(patient)
        return true unless other_role_user?

        current_user_is_patient_performer?(patient)
      end

      def enforce_other_patient_modify_permission!(patient)
        return if restricted_other_can_modify_patient?(patient)

        render json: { error: 'Недостаточно прав: пользователь с ролью "Прочее" может изменять только своих пациентов.' },
          status: :forbidden
      end

      def patient_performer_users_for_select
        return [] unless current_user

        if current_user.admin?
          return User.includes(:job_position).ordered.to_a
        end

        if current_user.doctor?
          others = User.joins(:job_position).where(job_positions: { kind: "other" }).ordered.to_a
          return ([current_user] + others).uniq { |u| u.id }
        end

        [current_user]
      end

      def resolve_patient_performer_user_id
        uid = params[:performer_user_id].to_i
        allowed_ids = patient_performer_users_for_select.map(&:id)
        return uid if uid.positive? && allowed_ids.include?(uid)

        current_user.id
      end

      def step_performer_users_for_select
        return [] unless current_user

        if current_user.admin?
          return User.includes(:job_position).ordered.to_a
        end

        if current_user.doctor?
          others = User.joins(:job_position).where(job_positions: { kind: "other" }).ordered.to_a
          return ([current_user] + others).uniq { |u| u.id }
        end

        [current_user]
      end

      def resolve_step_performer_user_id(_patient)
        default = current_user.id
        allowed_ids = step_performer_users_for_select.map(&:id)
        return default if allowed_ids.empty?

        uid = params[:step_performer_user_id].to_i
        uid.positive? && allowed_ids.include?(uid) ? uid : default
      end

      def acting_performer_name_for_user_id(uid)
        User.find_by(id: uid)&.full_name
      end

      def require_admin!
        return if current_user&.admin?

        render json: { error: "Нужны права администратора" }, status: :forbidden
      end
    end
  end
end
