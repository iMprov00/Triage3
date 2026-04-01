# frozen_string_literal: true

class User < ActiveRecord::Base
  has_secure_password

  belongs_to :job_position

  validates :login, presence: true, uniqueness: { case_sensitive: false }
  validates :full_name, presence: true
  validates :job_position_id, presence: true
  validates :password, length: { minimum: 6 }, if: -> { new_record? || password.present? }

  before_validation :normalize_login

  scope :doctor_or_admin, -> { joins(:job_position).where(job_positions: { kind: %w[doctor admin] }) }
  scope :ordered, -> { order(:full_name) }

  def admin?
    job_position&.kind == 'admin'
  end

  def doctor?
    job_position&.kind == 'doctor'
  end

  def doctor_or_admin?
    admin? || doctor?
  end

  def position_label
    job_position&.name || '—'
  end

  private

  def normalize_login
    self.login = login.to_s.strip.downcase.presence
  end
end
