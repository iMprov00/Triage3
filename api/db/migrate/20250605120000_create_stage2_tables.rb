# frozen_string_literal: true

class CreateStage2Tables < ActiveRecord::Migration[8.1]
  def change
    create_table :stage2_cases do |t|
      t.references :patient, null: false, foreign_key: true, index: { unique: true }
      t.references :stage1_triage, foreign_key: { to_table: :triages }, index: true
      t.datetime :transferred_at, null: false
      t.string :transfer_source, null: false, default: "auto"
      t.date :admission_date
      t.time :admission_time
      t.integer :created_by_user_id
      t.integer :performer_user_id
      t.string :performer_name
      t.timestamps
    end

    create_table :stage2_triages do |t|
      t.references :stage2_case, null: false, foreign_key: true, index: { unique: true }
      t.string :current_phase, null: false, default: "pre_doctor"
      t.string :priority, null: false, default: "pending"
      t.json :phase_data, default: {}
      t.datetime :started_at
      t.datetime :completed_at
      t.boolean :timer_active, default: false
      t.datetime :start_time
      t.timestamps
    end

    create_table :stage2_audit_events do |t|
      t.references :patient, null: false, foreign_key: true
      t.references :stage2_case, foreign_key: true
      t.string :event_type, null: false
      t.text :payload
      t.datetime :occurred_at, null: false
      t.timestamps
      t.index %i[patient_id occurred_at]
      t.index :event_type
    end
  end
end
