# frozen_string_literal: true

require "test_helper"

class ApiSmokeTest < ActionDispatch::IntegrationTest
  setup do
    Rails.application.load_seed if User.none?
  end

  test "login and patients_list" do
    post "/api/v1/login",
      params: { login: "admin", password: "admin123" }.to_json,
      headers: { "CONTENT_TYPE" => "application/json" }
    assert_response :success
    body = JSON.parse(response.body)
    assert body["ok"]
    assert_equal "admin", body["user"]["login"]

    get "/api/v1/patients_list", params: { admission_date: Date.today.to_s }
    assert_response :success
    assert_kind_of Array, JSON.parse(response.body)
  end
end
