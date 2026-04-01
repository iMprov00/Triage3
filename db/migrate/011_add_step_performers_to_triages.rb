# frozen_string_literal: true

class AddStepPerformersToTriages < ActiveRecord::Migration[8.1]
  def change
    add_column :triages, :step_performers, :text, default: '{}', null: false
  end
end
