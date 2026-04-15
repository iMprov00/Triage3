# Приёмка после миграции (Rails API + React)

Повторить чеклист из [README_AI_TRIAGE_ACTIONS.md](README_AI_TRIAGE_ACTIONS.md) (ручной прогон):

- Старт триажа, шаги 1–3, назначение приоритета, экран действий, red_arrest (через API или расширение SPA).
- Аудит: подписи действий и событий.
- Роли из [README.md](README.md): admin / doctor / other — создание пациента, выбор исполнителя, запрет удаления для `other`, редактирование сохранённых шагов.

Реалтайм:

- При сохранении триажа/пациента обновляются подписчики `MonitorChannel` и `PatientsListChannel` (и `triage:<patient_id>`).
- Таймер на клиенте считается от `timer_ends_at` / `actions_time_limit` + `actions_started_at`.

Запуск для проверки:

1. Терминал 1: `cd api && bundle exec rails s -p 3000`
2. Терминал 2: `cd client && npm run dev`
3. Открыть `http://localhost:5173`, войти `admin` / `admin123`.
