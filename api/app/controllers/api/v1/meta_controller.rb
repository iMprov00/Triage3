# frozen_string_literal: true

module Api
  module V1
    class MetaController < ApplicationController
      def performers
        names = User.doctor_or_admin.pluck(:full_name)
        legacy = Patient.where.not(performer_name: [nil, ""]).distinct.pluck(:performer_name)
        render json: { performers: (names + legacy).compact.uniq.sort }
      end

      def performer_users
        list = patient_performer_users_for_select
        render json: {
          users: list.map { |u| { id: u.id, full_name: u.full_name, kind: u.job_position&.kind } }
        }
      end

      def step_performer_users
        list = step_performer_users_for_select
        render json: {
          users: list.map { |u| { id: u.id, full_name: u.full_name, kind: u.job_position&.kind } }
        }
      end

      def job_positions
        render json: { job_positions: JobPosition.ordered.as_json(only: %i[id name kind]) }
      end

      def triage_options
        render json: {
          eye_opening: Triage::EYE_OPENING_SCORES.keys,
          verbal_response: Triage::VERBAL_SCORES.keys,
          motor_response: Triage::MOTOR_SCORES.keys,
          positions: Triage::POSITIONS,
          urgency_criteria: Triage::URGENCY_CRITERIA,
          infection_signs: Triage::INFECTION_SIGNS
        }
      end
    end
  end
end
