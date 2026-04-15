# frozen_string_literal: true

module Api
  module V1
    module Admin
      class PositionsController < ApplicationController
        before_action :require_admin!

        def index
          render json: {
            positions: JobPosition.includes(:users).ordered.map { |p| position_row(p) }
          }
        end

        def create
          @position = JobPosition.new(position_params)
          if @position.save
            render json: { ok: true, position: position_row(@position) }, status: :created
          else
            render json: { ok: false, errors: @position.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          @position = JobPosition.find(params[:id])
          if @position.update(position_params)
            render json: { ok: true, position: position_row(@position) }
          else
            render json: { ok: false, errors: @position.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          jp = JobPosition.find(params[:id])
          if jp.users.exists?
            return render json: { error: "Нельзя удалить должность: есть пользователи с этой записью" },
              status: :unprocessable_entity
          end

          jp.destroy!
          head :no_content
        end

        private

        def position_params
          params.require(:position).permit(:name, :kind)
        end

        def position_row(p)
          { id: p.id, name: p.name, kind: p.kind, users_count: p.users.size }
        end
      end
    end
  end
end
