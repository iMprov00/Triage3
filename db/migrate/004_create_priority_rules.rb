# db/migrate/004_create_priority_rules.rb
class CreatePriorityRules < ActiveRecord::Migration[6.1]
  def change
    create_table :priority_rules do |t|
      t.string :name
      t.integer :step
      t.string :condition_type
      t.text :conditions
      t.text :actions
      t.string :priority
      t.text :description
      t.timestamps
    end
  end
end