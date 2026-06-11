# frozen_string_literal: true

class Stage2Case < ApplicationRecord
  include BroadcastsStage2Realtime

  TRANSFER_SOURCES = %w[auto manual].freeze

  belongs_to :patient
  belongs_to :stage1_triage, class_name: "Triage", optional: true
  belongs_to :created_by_user, class_name: "User", optional: true
  belongs_to :performer_user, class_name: "User", optional: true

  has_one :stage2_triage, dependent: :destroy
  has_many :stage2_audit_events, dependent: :delete_all

  validates :transfer_source, inclusion: { in: TRANSFER_SOURCES }
  validates :transferred_at, presence: true
  validates :patient_id, uniqueness: true

  before_validation :sync_performer_name_from_user

  def admission_time_formatted
    admission_time&.strftime("%H:%M")
  end

  private

  def sync_performer_name_from_user
    return unless performer_user_id.present?

    u = performer_user
    self.performer_name = u.full_name if u
  end
end
