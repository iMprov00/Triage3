# frozen_string_literal: true

class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :login, null: false
      t.string :password_digest, null: false
      t.string :full_name, null: false
      t.string :position, null: false
      t.timestamps
    end
    add_index :users, :login, unique: true
  end
end
