# frozen_string_literal: true

class AddHandoffAcceptanceAndBirthUnknown < ActiveRecord::Migration[8.1]
  def change
    change_table :triages, bulk: true do |t|
      t.datetime :stage2_handoff_at
    end

    change_table :stage2_cases, bulk: true do |t|
      t.datetime :accepted_at
    end

    change_table :patients, bulk: true do |t|
      t.boolean :birth_date_unknown, default: false, null: false
    end

    reversible do |dir|
      dir.up do
        execute <<~SQL.squish
          UPDATE stage2_cases SET accepted_at = transferred_at WHERE accepted_at IS NULL
        SQL
      end
    end
  end
end
