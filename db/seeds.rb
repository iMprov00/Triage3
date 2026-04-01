# frozen_string_literal: true

# Первый администратор (только если пользователей ещё нет)
unless User.exists?
  admin_jp = JobPosition.find_by(kind: 'admin') || JobPosition.order(:id).first
  raise 'Нет записей в справочнике должностей. Выполните миграции.' unless admin_jp

  pwd = ENV.fetch('INITIAL_ADMIN_PASSWORD', 'change-me-now')
  User.create!(
    login: 'admin',
    password: pwd,
    password_confirmation: pwd,
    full_name: 'Администратор',
    job_position_id: admin_jp.id
  )
  puts "Создан пользователь admin (пароль из INITIAL_ADMIN_PASSWORD или «change-me-now» — смените после входа)."
end
