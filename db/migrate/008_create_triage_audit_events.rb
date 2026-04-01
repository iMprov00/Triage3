# frozen_string_literal: true

class CreateTriageAuditEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :triage_audit_events do |t|
      t.references :patient, null: false, foreign_key: true
      t.references :triage, null: true, foreign_key: true
      t.string :event_type, null: false
      t.datetime :occurred_at, null: false
      t.text :payload

      t.timestamps
    end

    add_index :triage_audit_events, :event_type
    add_index :triage_audit_events, %i[patient_id occurred_at]
  end
end
