# frozen_string_literal: true

# Базовый администратор
# По запросу проекта фиксируем учетную запись:
# login: admin
# password: admin123
admin_jp = JobPosition.find_by(kind: 'admin') || JobPosition.order(:id).first
raise 'Нет записей в справочнике должностей. Выполните миграции.' unless admin_jp

pwd = 'admin123'
admin_user = User.find_or_initialize_by(login: 'admin')
admin_user.assign_attributes(
  full_name: 'Администратор',
  job_position_id: admin_jp.id,
  password: pwd,
  password_confirmation: pwd
)
admin_user.save!
puts 'Пользователь admin создан/обновлён (пароль: admin123).'
