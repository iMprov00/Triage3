# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class StatisticsController < ApplicationController
        def show
          render json: {
            stub: true,
            message: "Статистика этапа 2 будет доступна в следующей версии.",
            generated_at: Time.current.iso8601
          }
        end
      end
    end
  end
end
