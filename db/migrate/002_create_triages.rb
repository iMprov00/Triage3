class CreateTriages < ActiveRecord::Migration[6.1]
  def change
    create_table :triages do |t|
      t.integer :patient_id
      t.datetime :start_time
      t.boolean :timer_active, default: true
      t.datetime :completed_at
      t.string :eye_opening
      t.string :verbal_response
      t.string :consciousness_level
      t.timestamps
    end
  end
end