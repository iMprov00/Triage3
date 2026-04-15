# frozen_string_literal: true

%w[admin doctor other].each do |kind|
  name = case kind
         when "admin" then "Администратор"
         when "doctor" then "Врач"
         else "Другое"
         end
  JobPosition.find_or_create_by!(name: name) { |jp| jp.kind = kind }
end

admin_jp = JobPosition.find_by!(kind: "admin")
pwd = "admin123"
admin_user = User.find_or_initialize_by(login: "admin")
admin_user.assign_attributes(
  full_name: "Администратор",
  job_position_id: admin_jp.id,
  password: pwd,
  password_confirmation: pwd
)
admin_user.save!
puts "Пользователь admin создан/обновлён (пароль: admin123)."
