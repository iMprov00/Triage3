# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class MonitorController < ApplicationController
        def patients_payload
          render json: Stage2MonitorPatientsService.call
        end
      end
    end
  end
end
