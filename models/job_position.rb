# frozen_string_literal: true

class JobPosition < ActiveRecord::Base
  KINDS = %w[admin doctor other].freeze

  KIND_LABELS = {
    'admin' => 'Администратор — полный доступ к админ-панели и выбор исполнителя',
    'doctor' => 'Врач — выбор исполнителя на карте и этапах',
    'other' => 'Прочее — только своя учётная запись как исполнитель'
  }.freeze

  SHORT_KIND_LABELS = {
    'admin' => 'Администратор',
    'doctor' => 'Врач',
    'other' => 'Прочее'
  }.freeze

  has_many :users, dependent: :restrict_with_error

  validates :name, presence: true, uniqueness: true
  validates :kind, presence: true, inclusion: { in: KINDS }

  scope :ordered, -> { order(:name) }

  def kind_label
    KIND_LABELS[kind] || kind
  end

  def short_kind_label
    SHORT_KIND_LABELS[kind] || kind
  end
end
