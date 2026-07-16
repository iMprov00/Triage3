# frozen_string_literal: true

class AddFullNameUnknownToPatients < ActiveRecord::Migration[8.1]
  def change
    add_column :patients, :full_name_unknown, :boolean, default: false, null: false
  end
end
