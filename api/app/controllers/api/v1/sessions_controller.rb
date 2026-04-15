# frozen_string_literal: true

module Api
  module V1
    class SessionsController < ApplicationController
      skip_before_action :authenticate_user!, only: :create

      def create
        user = User.find_by(login: params[:login].to_s.strip.downcase)
        if user&.authenticate(params[:password].to_s)
          session[:user_id] = user.id
          render json: { ok: true, user: user_json(user) }
        else
          render json: { ok: false, error: "Неверный логин или пароль" }, status: :unauthorized
        end
      end

      def show
        render json: { user: user_json(current_user) }
      end

      def destroy
        session.clear
        head :no_content
      end

      private

      def user_json(user)
        return nil unless user

        {
          id: user.id,
          login: user.login,
          full_name: user.full_name,
          role: user.job_position&.kind,
          position_label: user.position_label
        }
      end
    end
  end
end
