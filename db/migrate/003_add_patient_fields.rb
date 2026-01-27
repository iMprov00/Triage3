# db/migrate/003_add_patient_fields.rb
class AddPatientFields < ActiveRecord::Migration[6.1]
  def change
    add_column :patients, :performer_name, :string
    add_column :patients, :appeal_type, :string
    add_column :patients, :pregnancy_weeks, :decimal, precision: 5, scale: 2
    add_column :patients, :pregnancy_unknown, :boolean, default: false
  end
end