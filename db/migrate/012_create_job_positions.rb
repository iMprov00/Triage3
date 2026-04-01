# frozen_string_literal: true

class CreateJobPositions < ActiveRecord::Migration[8.1]
  class MigrationJobPosition < ActiveRecord::Base
    self.table_name = 'job_positions'
  end

  class MigrationUser < ActiveRecord::Base
    self.table_name = 'users'
  end

  def up
    create_table :job_positions do |t|
      t.string :name, null: false
      t.string :kind, null: false
      t.timestamps
    end
    add_index :job_positions, :name, unique: true

    add_column :users, :job_position_id, :integer

    admin = MigrationJobPosition.create!(name: 'Администратор', kind: 'admin')
    doctor = MigrationJobPosition.create!(name: 'Врач', kind: 'doctor')
    other = MigrationJobPosition.create!(name: 'Другое', kind: 'other')

    MigrationUser.where(position: 'admin').update_all(job_position_id: admin.id)
    MigrationUser.where(position: 'doctor').update_all(job_position_id: doctor.id)
    MigrationUser.where(position: 'other').update_all(job_position_id: other.id)
    MigrationUser.where(position: nil).update_all(job_position_id: other.id)

    change_column_null :users, :job_position_id, false
    remove_column :users, :position
  end

  def down
    add_column :users, :position, :string

    MigrationJobPosition.reset_column_information
    MigrationUser.reset_column_information

    MigrationJobPosition.find_each do |jp|
      MigrationUser.where(job_position_id: jp.id).update_all(position: jp.kind)
    end

    remove_column :users, :job_position_id
    drop_table :job_positions
  end
end
