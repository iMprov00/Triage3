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
            skin_colors: Stage2Rules::SKIN_COLOR_OPTIONS,
            skin_findings: Stage2Rules::SKIN_COLOR_OPTIONS,
            edema_locations: Stage2Rules::EDEMA_LOCATION_OPTIONS,
            vitals: Stage2Rules::VITAL_FIELDS.map { |key| { key: key, label: vital_field_label(key) } },
            pain_vas_min: 0,
            pain_vas_max: 10
          }
        end

        def doctor_examination_options
          render json: {
            investigations: Stage2Rules::INVESTIGATION_OPTIONS,
            lab_investigations: Stage2Rules::LAB_INVESTIGATION_OPTIONS,
            ctg_results: Stage2Rules::CTG_RESULT_OPTIONS,
            ultrasound_findings: Stage2Rules::ULTRASOUND_FINDING_OPTIONS
          }
        end

        def called_doctors
          doctor_ids = Stage2Triage
            .joins(:stage2_case)
            .where("json_extract(stage2_triages.phase_data, '$.pre_doctor.doctor_called') IN (1, 'true', '1')")
            .where("json_extract(stage2_triages.phase_data, '$.pre_doctor.called_doctor_user_id') IS NOT NULL")
            .pluck(Arel.sql("CAST(json_extract(stage2_triages.phase_data, '$.pre_doctor.called_doctor_user_id') AS INTEGER)"))
            .map(&:to_i)
            .select(&:positive?)
            .uniq

          doctors = User.where(id: doctor_ids).order(:full_name).map do |u|
            { id: u.id, full_name: u.full_name }
          end

          render json: { doctors: doctors }
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
