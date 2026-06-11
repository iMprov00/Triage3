# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class StatisticsController < ApplicationController
        def show
          if params[:patient_id].present?
            patient = Patient.find_by(id: params[:patient_id])
            unless patient&.stage2_case
              return render json: { error: "Пациент не на этапе 2" }, status: :not_found
            end

            report = Stage2ActionsReportPresenter.call(patient, patient.stage2_case)
            if report[:error]
              return render json: report, status: :not_found
            end

            return render json: report
          end

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
