# db/migrate/005_add_triage_fields.rb
class AddTriageFields < ActiveRecord::Migration[6.1]
  def change
    add_column :triages, :step, :integer, default: 1
    add_column :triages, :step1_data, :text
    add_column :triages, :step2_data, :text
    add_column :triages, :step3_data, :text
    add_column :triages, :priority, :string, default: 'pending'
    add_column :triages, :eye_opening_score, :integer
    add_column :triages, :verbal_response_score, :integer
    add_column :triages, :motor_response_score, :integer
    add_column :triages, :breathing, :boolean
    add_column :triages, :heartbeat, :boolean
    add_column :triages, :seizures, :boolean
    add_column :triages, :active_bleeding, :boolean
    add_column :triages, :position, :string
  end
end