# frozen_string_literal: true

module Api
  module V1
    module Stage2
      class PatientsController < ApplicationController
        before_action :set_patient_and_case, only: %i[show update destroy stage1_summary decision_summary]

        def index
          prm = list_params
          prm[:admission_date] ||= Date.today.to_s
          list = Stage2PatientsListService.list(prm)
          render json: list.map { |p| Stage2PatientListPresenter.to_list_hash(p, p.stage2_case, current_user) }
        end

        def show
          render json: patient_full_json(@patient, @stage2_case)
        end

        def stage1_summary
          summary = Stage2Stage1SummaryPresenter.call(@patient)
          if summary[:error]
            return render json: summary, status: :not_found
          end

          render json: summary
        end

        def decision_summary
          summary = Stage2DecisionSummaryPresenter.call(@patient, @stage2_case)
          if summary[:error]
            return render json: summary, status: :not_found
          end

          render json: summary
        end

        def update
          return if enforce_other_modify!

          attrs = patient_attributes
          case_attrs = case_attributes

          if current_user.doctor_or_admin? && params.key?(:performer_user_id)
            case_attrs = case_attrs.merge(performer_user_id: resolve_case_performer_user_id)
          end

          patient_ok = attrs.empty? || @patient.update(attrs)
          case_ok = case_attrs.empty? || @stage2_case.update(case_attrs)
          ok = patient_ok && case_ok

          if ok
            @patient.reload
            @stage2_case.reload
            Stage2AuditEvent.log!(
              patient: @patient,
              stage2_case: @stage2_case,
              type: "patient_edited",
              payload: { performer_name: @stage2_case.performer_name }
            )
            render json: { ok: true, patient: Stage2PatientListPresenter.to_list_hash(@patient, @stage2_case, current_user) }
          else
            errors = @patient.errors.full_messages + @stage2_case.errors.full_messages
            render json: { ok: false, errors: errors }, status: :unprocessable_entity
          end
        end

        def destroy
          if other_role_user?
            return render json: { error: 'Недостаточно прав: роль "Прочее" не может удалять пациентов.' },
              status: :forbidden
          end

          Stage2AuditEvent.log!(
            patient: @patient,
            stage2_case: @stage2_case,
            type: "case_removed",
            payload: { full_name: @patient.full_name }
          )
          @stage2_case.destroy!
          head :no_content
        end

        private

        def list_params
          params.permit(:search, :admission_date, :appeal_type, :only_active).to_h
        end

        def set_patient_and_case
          @patient = Patient.find(params[:patient_id])
          @stage2_case = @patient.stage2_case
          return if @stage2_case

          render json: { error: "Пациент не на этапе 2" }, status: :not_found
        end

        def enforce_other_modify!
          return false if restricted_other_can_modify_stage2?(@stage2_case, @patient)

          render json: { error: 'Недостаточно прав: пользователь с ролью "Прочее" может изменять только своих пациентов.' },
            status: :forbidden
          true
        end

        def restricted_other_can_modify_stage2?(stage2_case, patient)
          return true unless other_role_user?

          Stage2PatientListPresenter.case_performer?(stage2_case, patient, current_user)
        end

        def resolve_case_performer_user_id
          uid = params[:performer_user_id].to_i
          allowed_ids = patient_performer_users_for_select.map(&:id)
          return uid if uid.positive? && allowed_ids.include?(uid)

          current_user.id
        end

        def patient_attributes
          return {} unless params[:patient].present?

          src = params.require(:patient)
          p = src.permit(
            :full_name, :birth_date, :appeal_type,
            :pregnancy_unknown, :pregnancy_weeks
          )
          h = p.to_h
          h[:pregnancy_unknown] = ActiveModel::Type::Boolean.new.cast(h[:pregnancy_unknown])
          if h[:pregnancy_unknown].to_s == "true" || h[:pregnancy_unknown] == true
            h[:pregnancy_weeks] = nil
          elsif h[:pregnancy_weeks].present?
            h[:pregnancy_weeks] = h[:pregnancy_weeks].to_f
          end
          h
        end

        def case_attributes
          return {} unless params[:stage2_case].present? || params.key?(:admission_date) || params.key?(:admission_time)

          src = params[:stage2_case].present? ? params.require(:stage2_case) : params
          p = src.permit(:admission_date, :admission_time, :performer_user_id)
          h = p.to_h
          h[:admission_time] = parse_admission_time(h[:admission_time]) if h.key?(:admission_time)
          h.except(:performer_user_id, "performer_user_id")
        end

        def parse_admission_time(val)
          s = val.to_s.strip
          return nil if s.blank?

          Time.zone.parse("2000-01-01 #{s}")
        end

        def patient_full_json(patient, stage2_case)
          {
            patient: Stage2PatientListPresenter.to_list_hash(patient, stage2_case, current_user).merge(
              pregnancy_weeks: patient.pregnancy_weeks,
              pregnancy_unknown: patient.pregnancy_unknown,
              performer_user_id: stage2_case.performer_user_id
            ),
            stage2_triage: Stage2TriageStatePresenter.call(patient, stage2_case, viewer: current_user)
          }
        end
      end
    end
  end
end
