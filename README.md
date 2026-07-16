# TriagV3

Система триажа: **этап 1** (приёмный триаж) и **этап 2** (продолжение после этапа 1).

Стек: **Rails API** + **React** (два SPA).

| Компонент | Папка | Порт (dev) | Порт (Docker) |
|-----------|--------|------------|---------------|
| API | `api/` | 3000 | внутренний |
| Этап 1 | `client/` | 5173 | **1001** |
| Этап 2 | `client-stage2/` | 5174 | **1002** |

---

## Деплой через Docker (продакшен)

Сервер по умолчанию: **http://192.168.1.184/**

- Этап 1: http://192.168.1.184:1001  
- Этап 2: http://192.168.1.184:1002  

Кнопки «Этап 1» / «Этап 2» в шапке ведут на соседний порт того же хоста (или на URL из переменных сборки).

### Первый запуск

1. Установите [Docker](https://docs.docker.com/get-docker/) и Docker Compose.

2. Создайте `.env` в корне проекта:

```bash
copy .env.example .env
```

3. Заполните в `.env`:
   - `SECRET_KEY_BASE` — сгенерируйте: `cd api && bundle exec rails secret`
   - `RAILS_MASTER_KEY` — содержимое файла `api/config/master.key`

4. Сборка и запуск:

```bash
docker compose up -d --build
```

5. Seed (админ и справочники, один раз):

```bash
docker compose exec api bin/rails db:seed
```

6. Откройте в браузере:
   - http://192.168.1.184:1001 — этап 1  
   - http://192.168.1.184:1002 — этап 2  

**Вход:** `admin` / `admin123`

### Обновление после изменений кода

```bash
docker compose up -d --build
```

### Остановка

```bash
docker compose down
```

Данные SQLite и Redis сохраняются в Docker volumes (`api_storage`, `redis_data`).

### Переменные `.env`

| Переменная | Описание |
|------------|----------|
| `PUBLIC_HOST` | IP или hostname сервера (по умолчанию `192.168.1.184`) |
| `STAGE1_PORT` | Порт UI этапа 1 (по умолчанию `1001`) |
| `STAGE2_PORT` | Порт UI этапа 2 (по умолчанию `1002`) |
| `SECRET_KEY_BASE` | Секрет Rails |
| `RAILS_MASTER_KEY` | Ключ credentials |

---

## Разработка (локально)

```cmd
start-dev.cmd
```

Или три терминала:

```bash
cd api && bundle exec rails server
cd client && npm install && npm run dev
cd client-stage2 && npm install && npm run dev
```

- Этап 1: http://localhost:5173  
- Этап 2: http://localhost:5174  
- API: http://localhost:3000  

Опционально `.env` в `client/` и `client-stage2/` (см. `.env.example`).

---

## Этап 2 (кратко)

- Пациент попадает на этап 2 после завершения действий этапа 1 (или вручную «Принять с этапа 1»).
- Администрирование пользователей — в приложении этапа 1.

---

## Права пользователей

Роли: `admin`, `doctor`, `other`. Подробнее — в истории коммитов / документации отдела.

- **other** — не может удалять пациентов.
- Редактирование сохранённых шагов — admin/doctor; other — только своих пациентов.
- После `actions_completed` редактирование шагов недоступно.
