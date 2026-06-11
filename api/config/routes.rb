# frozen_string_literal: true

Rails.application.routes.draw do
  mount ActionCable.server => "/cable"

  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      post "login", to: "sessions#create"
      delete "logout", to: "sessions#destroy"
      get "me", to: "sessions#show"

      get "patients_list", to: "patients#merged_index"
      get "patient_timer/:id", to: "monitor#patient_timer"
      get "active_patients", to: "monitor#active_patients"
      get "monitor/patients", to: "monitor#patients_payload"

      get "performers", to: "meta#performers"
      get "meta/performer_users", to: "meta#performer_users"
      get "meta/step_performer_users", to: "meta#step_performer_users"
      get "meta/job_positions", to: "meta#job_positions"
      get "meta/triage_options", to: "meta#triage_options"

      get "statistics", to: "statistics#show"
      get "statistics/dashboard", to: "statistics#dashboard"
      get "statistics/detailed", to: "statistics#detailed"

      resources :patients, param: :patient_id, only: %i[show create update destroy] do
        member do
          post "triage/start", to: "triages#start"
          get "triage", to: "triages#show"
          post "triage/step1", to: "triages#step1"
          post "triage/step2", to: "triages#step2"
          post "triage/step3", to: "triages#step3"
          get "triage/view", to: "triages#full_view"
          get "triage/actions", to: "triage_actions#show"
          post "triage/actions/mark", to: "triage_actions#mark"
          post "triage/actions/unmark", to: "triage_actions#unmark"
          post "triage/actions/complete", to: "triage_actions#complete"
          post "triage/actions/red_arrest/brigade", to: "triage_actions#red_arrest_brigade"
          post "triage/actions/red_arrest/toggle", to: "triage_actions#red_arrest_toggle"
          post "triage/actions/red_arrest/vital", to: "triage_actions#red_arrest_vital"
          post "triage/preview_step_update/:step", to: "triage_step_edits#preview"
          post "triage/update_step/:step", to: "triage_step_edits#update"
        end
      end

      namespace :stage2 do
        get "patients_list", to: "patients#index"
        get "eligible_from_stage1", to: "cases#eligible_from_stage1"
        post "cases", to: "cases#create"
        get "monitor/patients", to: "monitor#patients_payload"
        get "statistics", to: "statistics#show"
        get "meta/pre_doctor_options", to: "meta#pre_doctor_options"

        resources :patients, param: :patient_id, only: %i[show update destroy] do
          member do
            get "stage1_summary", to: "patients#stage1_summary"
            get "triage", to: "triages#show"
            post "triage/pre_doctor", to: "triages#pre_doctor"
            post "triage/advance", to: "triages#advance"
          end
        end
      end

      namespace :admin do
        resources :users, only: %i[index create update]
        resources :positions, only: %i[index create update destroy]
      end
    end
  end
end
