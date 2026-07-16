# frozen_string_literal: true

module Api
  module V1
    class PatientsController < ApplicationController
      def merged_index
        prm = list_params
        prm[:admission_date] ||= Date.today.to_s
        list = PatientsListService.merged_list(prm)
        render json: list.map { |p| PatientListPresenter.to_list_hash(p, current_user) }
      end

      def show
        patient = Patient.find(params[:patient_id])
        render json: patient_full_json(patient)
      end

      def create
        p_uid = resolve_patient_performer_user_id
        patient = Patient.new(patient_attributes.merge(
          created_by_user_id: current_user.id,
          performer_user_id: p_uid
        ))
        if patient.save
          render json: { ok: true, patient: PatientListPresenter.to_list_hash(patient.reload, current_user) },
            status: :created
        else
          render json: { ok: false, errors: patient.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        patient = Patient.find(params[:patient_id])
        attrs = patient_attributes
        if current_user.doctor_or_admin? && params.key?(:performer_user_id)
          attrs[:performer_user_id] = resolve_patient_performer_user_id
        end
        if patient.update(attrs)
          TriageAuditEvent.log!(
            patient: patient,
            triage: patient.triage,
            type: "patient_edited",
            payload: { performer_name: patient.performer_name }
          )
          render json: { ok: true, patient: PatientListPresenter.to_list_hash(patient.reload, current_user) }
        else
          render json: { ok: false, errors: patient.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        if other_role_user?
          render json: { error: 'Недостаточно прав: роль "Прочее" не может удалять пациентов.' }, status: :forbidden
          return
        end

        patient = Patient.find(params[:patient_id])
        patient.destroy!
        head :no_content
      end

      private

      def list_params
        params.permit(:search, :admission_date, :pregnancy_condition, :performer_filter, :status_filter, :sort).to_h
      end

      def patient_attributes
        src = params[:patient].present? ? params.require(:patient) : params
        p = src.permit(
          :full_name, :full_name_unknown, :admission_date, :admission_time, :birth_date, :birth_date_unknown, :appeal_type,
          :pregnancy_unknown, :pregnancy_weeks, :performer_user_id
        )
        h = p.to_h
        h[:full_name_unknown] = ActiveModel::Type::Boolean.new.cast(h[:full_name_unknown])
        if h[:full_name_unknown].to_s == "true" || h[:full_name_unknown] == true
          h[:full_name] = "Неизвестно"
        end
        h[:birth_date_unknown] = ActiveModel::Type::Boolean.new.cast(h[:birth_date_unknown])
        if h[:birth_date_unknown].to_s == "true" || h[:birth_date_unknown] == true
          h[:birth_date] = nil
        end
        h[:pregnancy_unknown] = ActiveModel::Type::Boolean.new.cast(h[:pregnancy_unknown])
        if h[:pregnancy_unknown].to_s == "true" || h[:pregnancy_unknown] == true
          h[:pregnancy_weeks] = nil
        elsif h[:pregnancy_weeks].present?
          h[:pregnancy_weeks] = h[:pregnancy_weeks].to_f
        else
          h[:pregnancy_weeks] = nil
        end
        h[:admission_time] = parse_admission_time(h[:admission_time]) if h.key?(:admission_time)
        h.except(:performer_user_id, "performer_user_id")
      end

      def parse_admission_time(val)
        s = val.to_s.strip
        return nil if s.blank?

        Time.zone.parse("2000-01-01 #{s}")
      end

      def patient_full_json(patient)
        t = patient.triage
        {
          patient: PatientListPresenter.to_list_hash(patient, current_user).merge(
            full_name_unknown: patient.full_name_unknown?,
            pregnancy_weeks: patient.pregnancy_weeks,
            pregnancy_unknown: patient.pregnancy_unknown,
            created_by_user_id: patient.created_by_user_id,
            performer_user_id: patient.performer_user_id
          ),
          triage: t ? TriageStatePresenter.call(patient, t, viewer: current_user) : nil
        }
      end
    end
  end
end
