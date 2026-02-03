# db/migrate/006_add_step_completed_at.rb
class AddStepCompletedAt < ActiveRecord::Migration[6.1]
  def change
    add_column :triages, :step1_completed_at, :datetime
    add_column :triages, :step2_completed_at, :datetime
    add_column :triages, :step3_completed_at, :datetime
  end
end
