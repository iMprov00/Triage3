# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class MetaController < ApplicationController
        def pre_doctor_options
          render json: {
            discharge: Stage2Rules::DISCHARGE_OPTIONS,
            fetal_heart_rate: Stage2Rules::FETAL_HEART_RATE_OPTIONS,
            uterine_tone: Stage2Rules::UTERINE_TONE_OPTIONS,
            skin_findings: Stage2Rules::SKIN_FINDING_OPTIONS,
            edema_locations: Stage2Rules::EDEMA_LOCATION_OPTIONS,
            vitals: Stage2Rules::VITAL_FIELDS.map { |key| { key: key, label: vital_field_label(key) } },
            pain_vas_min: 0,
            pain_vas_max: 10
          }
        end

        private

        def vital_field_label(key)
          {
            "systolic_bp" => "АД систолическое",
            "diastolic_bp" => "АД диастолическое",
            "heart_rate" => "ЧСС",
            "respiratory_rate" => "ЧД",
            "saturation" => "Сатурация"
          }[key] || key
        end
      end
    end
  end
end
