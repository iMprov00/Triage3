# frozen_string_literal: true

module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        before_action :require_admin!

        def index
          render json: { users: User.order(:login).includes(:job_position).map { |u| user_row(u) } }
        end

        def create
          @user = User.new(user_params)
          if @user.save
            render json: { ok: true, user: user_row(@user) }, status: :created
          else
            render json: { ok: false, errors: @user.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          @user = User.find(params[:id])
          attrs = user_update_params
          if @user.update(attrs)
            render json: { ok: true, user: user_row(@user) }
          else
            render json: { ok: false, errors: @user.errors.full_messages }, status: :unprocessable_entity
          end
        end

        private

        def user_params
          params.require(:user).permit(:login, :password, :password_confirmation, :full_name, :job_position_id)
        end

        def user_update_params
          p = params.require(:user).permit(:login, :full_name, :job_position_id, :password, :password_confirmation)
          p.delete(:password) if p[:password].blank?
          p.delete(:password_confirmation) if p[:password_confirmation].blank?
          p
        end

        def user_row(u)
          {
            id: u.id,
            login: u.login,
            full_name: u.full_name,
            job_position_id: u.job_position_id,
            position_label: u.position_label,
            role: u.job_position&.kind
          }
        end
      end
    end
  end
end
