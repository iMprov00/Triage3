# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 12) do
  create_table "job_positions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "kind", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_job_positions_on_name", unique: true
  end

  create_table "patients", force: :cascade do |t|
    t.date "admission_date"
    t.time "admission_time"
    t.string "appeal_type"
    t.date "birth_date"
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.string "full_name"
    t.string "performer_name"
    t.integer "performer_user_id"
    t.boolean "pregnancy_unknown", default: false
    t.decimal "pregnancy_weeks", precision: 5, scale: 2
    t.datetime "updated_at", null: false
    t.index ["created_by_user_id"], name: "index_patients_on_created_by_user_id"
    t.index ["performer_user_id"], name: "index_patients_on_performer_user_id"
  end

  create_table "priority_rules", force: :cascade do |t|
    t.text "actions"
    t.string "condition_type"
    t.text "conditions"
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name"
    t.string "priority"
    t.integer "step"
    t.datetime "updated_at", null: false
  end

  create_table "triage_audit_events", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "event_type", null: false
    t.datetime "occurred_at", null: false
    t.integer "patient_id", null: false
    t.text "payload"
    t.integer "triage_id"
    t.datetime "updated_at", null: false
    t.index ["event_type"], name: "index_triage_audit_events_on_event_type"
    t.index ["patient_id", "occurred_at"], name: "index_triage_audit_events_on_patient_id_and_occurred_at"
    t.index ["patient_id"], name: "index_triage_audit_events_on_patient_id"
    t.index ["triage_id"], name: "index_triage_audit_events_on_triage_id"
  end

  create_table "triages", force: :cascade do |t|
    t.datetime "actions_completed_at", precision: nil
    t.text "actions_data"
    t.datetime "actions_started_at", precision: nil
    t.boolean "active_bleeding"
    t.boolean "breathing"
    t.datetime "brigade_called_at", precision: nil
    t.datetime "completed_at", precision: nil
    t.string "consciousness_level"
    t.datetime "created_at", null: false
    t.string "eye_opening"
    t.integer "eye_opening_score"
    t.boolean "heartbeat"
    t.integer "motor_response_score"
    t.integer "patient_id"
    t.string "position"
    t.string "priority", default: "pending"
    t.boolean "seizures"
    t.datetime "start_time", precision: nil
    t.integer "step", default: 1
    t.datetime "step1_completed_at", precision: nil
    t.text "step1_data"
    t.datetime "step2_completed_at", precision: nil
    t.text "step2_data"
    t.datetime "step3_completed_at", precision: nil
    t.text "step3_data"
    t.text "step_performers", default: "{}", null: false
    t.boolean "timer_active", default: true
    t.datetime "updated_at", null: false
    t.string "verbal_response"
    t.integer "verbal_response_score"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "full_name", null: false
    t.integer "job_position_id", null: false
    t.string "login", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["login"], name: "index_users_on_login", unique: true
  end

  add_foreign_key "triage_audit_events", "patients"
  add_foreign_key "triage_audit_events", "triages"
end
