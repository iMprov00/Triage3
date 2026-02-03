# db/migrate/007_add_priority_actions.rb
class AddPriorityActions < ActiveRecord::Migration[6.1]
  def change
    # Время начала действий по приоритету (для таймера 5 минут)
    add_column :triages, :actions_started_at, :datetime
    
    # Данные чекбоксов действий (JSON)
    add_column :triages, :actions_data, :text
    
    # Время вызова бригады (для таймера 12 минут)
    add_column :triages, :brigade_called_at, :datetime
    
    # Время завершения всех действий
    add_column :triages, :actions_completed_at, :datetime
  end
end
