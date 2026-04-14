# README для ИИ: как добавлять новые действия триажа

Этот файл нужен для AI-ассистентов и разработчиков, чтобы безопасно расширять логику действий triage **без поломки текущего поведения**.



## 1) Где находится расширяемая архитектура

- Основная модель: `models/triage.rb`
- Слой правил/стратегий: `models/triage_rules.rb`

В `Triage` добавлены точки расширения:

- `Triage.priority_strategy`
- `Triage.actions_catalog`

По умолчанию используются:

- `TriageRules::DefaultPriorityStrategy`
- `TriageRules::DefaultActionsCatalog`

Это значит, что текущее поведение системы сохранено 1:1, а новые варианты добавляются через новые классы.

## 2) Что расширять для новых сценариев

### 2.1 Новые условия назначения приоритета

Создать класс, наследник `TriageRules::PriorityStrategy`, и реализовать:

- `evaluate_step1(triage)` -> `'red'` или `nil`
- `evaluate_step2(triage)` -> `'yellow'` / `'purple'` или `nil`
- `evaluate_step3(triage)` -> `'yellow'` / `'purple'` / `'green'`
- при необходимости:
  - `step1_data_implies_red_priority?(step1_data)`
  - `step1_data_implies_red_arrest?(step1_data)`

Важно:

- Возвращать те же коды приоритета: `red`, `yellow`, `purple`, `green`.
- Не менять формат `step1_data/step2_data/step3_data` без отдельной миграции и обновления форм.

### 2.2 Новые наборы действий

Создать класс, наследник `TriageRules::ActionsCatalog`, и реализовать:

- `actions_for(priority:, triage:)` -> массив действий
- `action_text_for_key(key)` -> человекочитаемый текст для аудита

Формат действия (сохранять совместимость):

```ruby
{
  key: 'unique_action_key',
  text: 'Текст действия',
  starts_timer: true,          # опционально
  timer_minutes: 12,           # опционально
  final: true,                 # опционально
  final_always_available: true # опционально
}
```

## 3) Подключение новых стратегий

Подключать в инициализации приложения (например, в `app.rb` после загрузки моделей):

```ruby
Triage.priority_strategy = MyCustomPriorityStrategy.new
Triage.actions_catalog = MyCustomActionsCatalog.new
```

Если кастомная логика не нужна, ничего подключать не надо: останется default-реализация.

## 4) Принципы совместимости (обязательно)

1. **Не ломать текущий UI и маршруты**  
   `views/triage_actions*.erb` и маршруты `app.rb` ожидают прежние ключи/флаги.

2. **Не ломать аудит**  
   Для новых ключей действий добавлять тексты в `action_text_for_key`, иначе в журнале будут "сырые" ключи.

3. **Сохранять контракт таймеров**  
   - шаги: `STEPS`
   - фаза действий: `ACTIONS_TIME_LIMIT`
   - таймер бригады/медсестры: `starts_timer + timer_minutes`

4. **Не менять существующие ключи без миграции данных**  
   `actions_data` хранит ключи действий; переименование ломает старые записи и аудит.

5. **Сценарий `red_arrest` не трогать без отдельной задачи**  
   Это отдельный поток (`triage_actions_red_arrest`) со своими endpoint-ами и условиями завершения.

## 5) Рекомендуемый паттерн для "условных" действий

Когда нужно разные действия внутри одного приоритета (пример: красный с кровотечением vs красный без кровотечения), делать ветвление в `actions_for`:

```ruby
def actions_for(priority:, triage:)
  return [] unless priority.to_s == 'red'

  s1 = triage&.step1_data || {}
  bleeding = s1['active_bleeding'] == true || s1['active_bleeding'].to_s == 'true'
  breathing_no = s1['breathing'] == false || s1['breathing'].to_s == 'false'
  heartbeat_no = s1['heartbeat'] == false || s1['heartbeat'].to_s == 'false'

  return RED_ARREST_ACTIONS if breathing_no || heartbeat_no
  return RED_BLEEDING_ACTIONS if bleeding

  RED_DEFAULT_ACTIONS
end
```

Так можно масштабировать до любого числа сценариев без правки контроллеров.

## 6) Мини-чеклист перед завершением задачи

- [ ] `ruby -c models/triage_rules.rb`
- [ ] `ruby -c models/triage.rb`
- [ ] Проверка вручную:
  - [ ] старт триажа
  - [ ] прохождение шагов 1/2/3
  - [ ] назначение приоритета как раньше
  - [ ] экран действий открывается
  - [ ] отметка/снятие действий работает
  - [ ] завершение действий работает
  - [ ] в аудите корректные подписи действий

## 7) Что НЕ делать

- Не вшивать новые условия обратно напрямую в `Triage#check_step*` если можно вынести в стратегию.
- Не дублировать логику сразу в нескольких местах (модель + контроллер + view).
- Не менять текущие константы/ключи действий без запроса на миграцию legacy-данных.

