class CreatePatients < ActiveRecord::Migration[6.1]
  def change
    create_table :patients do |t|
      t.string :full_name
      t.date :admission_date
      t.time :admission_time
      t.date :birth_date
      t.timestamps
    end
  end
end