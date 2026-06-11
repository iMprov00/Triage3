# frozen_string_literal: true

class AddStage2TriageWorkflowFields < ActiveRecord::Migration[8.1]
  def change
    change_table :stage2_triages, bulk: true do |t|
      t.json :actions_data, default: {}
      t.datetime :actions_started_at
      t.datetime :actions_completed_at
      t.string :suggested_priority, default: "pending", null: false
    end
  end
end
