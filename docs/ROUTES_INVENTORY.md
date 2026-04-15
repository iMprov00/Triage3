# Инвентаризация маршрутов TriagV3 (Sinatra → Rails API)

Источник: `app.rb`. Публичные запросы без сессии: см. `public_request?` (логин, монитор, статика, `/api/patient_timer/:id`).

## Аутентификация

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/login` | Форма входа |
| POST | `/login` | Сессия |
| POST | `/logout` | Выход |

## Админка (только `current_user.admin?`)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/admin/users` | Список пользователей |
| GET/POST | `/admin/users/new`, `/admin/users` | Создание |
| GET/POST | `/admin/users/:id/edit`, `/admin/users/:id` | Редактирование |
| GET/POST | `/admin/positions` | Должности |
| GET/POST | `/admin/positions/:id/edit`, `/admin/positions/:id` | Редактирование |
| POST | `/admin/positions/:id/delete` | Удаление должности |

## Пациенты и список

| Метод | Путь | JSON/HTML |
|-------|------|-----------|
| GET | `/` | Редирект `/patients` |
| GET | `/patients` | HTML список |
| GET | `/api/patients_list` | JSON (merged list + triage hash) |
| GET | `/patients/new` | HTML |
| POST | `/patients` | Создание |
| GET | `/patients/:id/edit` | HTML |
| POST | `/patients/:id/edit` | Обновление |
| DELETE | `/patients/:id` | Удаление (запрет для роли `other`) |

## Статистика

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/statistics` | HTML, фильтры + журнал аудита выбранного пациента |

## Монитор и таймеры

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/monitor` | HTML без layout |
| GET | `/monitor_events` | SSE — массив пациентов для монитора |
| GET | `/api/patient_timer/:id` | JSON `time_remaining`, `expired` (публичный) |
| GET | `/api/active_patients` | JSON активных по таймеру шага |
| GET | `/triage_events/:patient_id` | SSE — таймер одного триажа (EventMachine) |

## Триаж: шаги и действия

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/patients/:id/triage/start` | Создать триаж |
| GET | `/patients/:id/triage` | Шаг 1 |
| POST | `/patients/:id/triage/step1` | Сохранение шага 1 |
| GET/POST | `/patients/:id/triage/step2` | Шаг 2 |
| GET/POST | `/patients/:id/triage/step3` | Шаг 3 |
| GET | `/patients/:id/triage/actions` | Экран действий (+ `start_actions!`) |
| GET | `/patients/:id/triage/view` | Просмотр данных |
| GET | `/patients/:id/triage/edit_step/:step` | Редактирование шага |
| POST | `/patients/:id/triage/preview_step_update/:step` | JSON предпросмотр |
| POST | `/patients/:id/triage/update_step/:step` | Сохранение правок шага |

### JSON действия приоритета

| POST | `/patients/:id/triage/actions/mark` | Отметить действие |
| POST | `/patients/:id/triage/actions/unmark` | Снять |
| POST | `/patients/:id/triage/actions/complete` | Завершить все |
| POST | `/patients/:id/triage/actions/red_arrest/brigade` | Бригада |
| POST | `/patients/:id/triage/actions/red_arrest/toggle` | Чекбоксы team/manip |
| POST | `/patients/:id/triage/actions/red_arrest/vital` | Витальные / признаки |

## Права (кратко, см. README.md)

- **admin**: полный доступ, любой исполнитель по карте.
- **doctor**: пациенты, исполнитель — себя или `other`; редактирование сохранённых шагов.
- **other**: только свой исполнитель при создании; не удаляет пациентов; редактирование сохранённых шагов только своих пациентов.
- Любой авторизованный: активные шаги триажа и действия приоритета (совместная смена).
- После `actions_completed`: редактирование шагов запрещено всем.

## Побочные эффекты для реалтайм

При любом сохранении `Triage` / пациента, влияющем на список или монитор: рассылка через Action Cable (замена SSE): канал монитора + опционально `patient:{id}` для таймера.
