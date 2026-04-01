# frozen_string_literal: true

class AddUserRefsToPatients < ActiveRecord::Migration[8.1]
  def change
    add_column :patients, :created_by_user_id, :integer
    add_column :patients, :performer_user_id, :integer
    add_index :patients, :created_by_user_id
    add_index :patients, :performer_user_id
  end
end
