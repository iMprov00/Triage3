/**
 * Список пациентов: опрос API, рендер карточек, таймеры.
 * Полноценный SPA (React/Vue) имеет смысл при существенном росте клиентской логики и команды.
 */
// Глобальные переменные
var serverDown = false;
var lastPatientsHash = null; // Для предотвращения лишних перерисовок

// Генерация хэша структуры данных (игнорируя таймеры)
function getPatientsHash(patients) {
  return patients.map(function(p) {
    var t = p.triage;
    return p.id + ':' + (t ? t.step + ':' + t.priority + ':' + (t.completed_at ? '1' : '0') + ':' + (t.timer_active ? '1' : '0') + ':' + (t.actions_completed_at ? '1' : '0') : 'null');
  }).join('|');
}

// Функции для классов
function stepClass(s) {
  return s === 1 ? 'badge-step-1' :
         s === 2 ? 'badge-step-2' :
         s === 3 ? 'badge-step-3' :
         'bg-secondary';
}

function priorityClass(p) {
  return p === 'red' ? 'badge-priority-1' :
         p === 'yellow' ? 'badge-priority-2' :
         p === 'purple' ? 'badge-priority-3' :
         p === 'green' ? 'badge-priority-4' :
         'bg-secondary';
}

function progressBarClass(percent) {
  return percent <= 25 ? 'progress-bar-danger' :
         percent <= 50 ? 'progress-bar-warning' :
         'progress-bar-success';
}

// Экранирование HTML
function escapeHtml(s) {
  if (!s) return '';
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// Форматирование времени
function formatTime(seconds) {
  if (seconds === undefined || seconds === null) return '--:--';
  var mins = Math.floor(seconds / 60);
  var secs = seconds % 60;
  return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
}

// Рендеринг списка пациентов
function renderPatientsList(patients) {
  var container = document.getElementById('patients-list-container');
  if (!patients || patients.length === 0) {
    container.innerHTML = '<div class="col-12"><div class="app-card card"><div class="card-body text-center py-5"><i class="bi bi-person-x text-muted" style="font-size: 3rem;"></i><h4 class="mt-3 mb-2">Пациенты не найдены</h4><p class="text-muted mb-0">Попробуйте изменить параметры поиска или создайте нового пациента.</p></div></div></div>';
    return;
  }

  var html = '';
  patients.forEach(function(p) {
    var t = p.triage;

    // Начало карточки
    html += '<div class="col-12 col-sm-6 col-lg-4 col-xl-3 col-card">';
    html += '<div class="app-card card h-100">';
    html += '<div class="card-body d-flex flex-column">';

    // Заголовок с ID и датой создания
    html += '<div class="d-flex justify-content-between align-items-start mb-3">';
    html += '<div><span class="badge bg-secondary">ID: ' + p.id + '</span></div>';
    html += '<span class="text-muted small">' + (p.created_at ? p.created_at.substr(0, 10) : '') + '</span>';
    html += '</div>';

    // ФИО пациента
    html += '<h5 class="card-title mb-4">' + escapeHtml(p.full_name) + '</h5>';

    // Информация о пациенте
    html += '<div class="card-text mb-4 flex-grow-1"><div class="small">';

    // Дата поступления
    html += '<div class="d-flex align-items-center mb-2">';
    html += '<i class="bi bi-calendar-plus text-muted me-2" style="width: 20px;"></i>';
    html += '<div><div class="text-secondary">Поступил</div><div class="fw-medium">' +
            (p.admission_date || '') + ' <span class="text-muted">' + (p.admission_time || '') + '</span></div></div>';
    html += '</div>';

    // Дата рождения
    html += '<div class="d-flex align-items-center mb-2">';
    html += '<i class="bi bi-calendar-heart text-muted me-2" style="width: 20px;"></i>';
    html += '<div><div class="text-secondary">Дата рождения</div><div class="fw-medium">' + (p.birth_date || '') + '</div></div>';
    html += '</div>';

    // Исполнитель
    html += '<div class="d-flex align-items-center mb-2">';
    html += '<i class="bi bi-person-badge text-muted me-2" style="width: 20px;"></i>';
    html += '<div><div class="text-secondary">Исполнитель</div><div class="fw-medium">' + escapeHtml(p.performer_name || '') + '</div></div>';
    html += '</div>';

    // Вид обращения
    html += '<div class="d-flex align-items-center mb-2">';
    html += '<i class="bi bi-clipboard text-muted me-2" style="width: 20px;"></i>';
    html += '<div><div class="text-secondary">Вид обращения</div><div class="fw-medium">' + escapeHtml(p.appeal_type || '') + '</div></div>';
    html += '</div>';

    // Срок беременности
    html += '<div class="d-flex align-items-center">';
    html += '<i class="bi bi-calendar-week text-muted me-2" style="width: 20px;"></i>';
    html += '<div><div class="text-secondary">Срок беременности</div><div class="fw-medium">' + escapeHtml(p.pregnancy_display || '') + '</div></div>';
    html += '</div>';

    html += '</div></div>'; // Закрываем card-text и small

    // Информация о триаже
    if (t) {
      html += '<div class="mb-4">';

      // Шаг и приоритет
      html += '<div class="d-flex justify-content-between align-items-center mb-3">';
      html += '<div class="d-flex gap-1">';

      // Шаг
      html += '<span class="badge ' + stepClass(t.step) + '">';
      html += '<i class="bi bi-' + (t.step || 1) + '-circle"></i> Шаг ' + (t.step || 1);
      html += '</span>';

      // Приоритет
      if (t.priority && t.priority !== 'pending') {
        html += '<span class="badge ' + priorityClass(t.priority) + '">' + escapeHtml(t.priority_name || t.priority) + '</span>';
      }

      html += '</div>';

      // Статус завершения
      if (t.completed_at) {
        html += '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Завершен</span>';
      }

      html += '</div>';

      // Таймер
      if (t.timer_active) {
        var maxTime = t.max_time || 120;
        var endsAt = t.timer_ends_at || 0;
        var timeRemaining = t.time_remaining || 0;
        var percent = maxTime ? Math.round((timeRemaining / maxTime) * 100) : 100;
        var timerBoxClass = t.expired ? 'timer-expired' : 'timer-running';

        html += '<div class="timer-box ' + timerBoxClass + '" data-timer-ends-at="' + endsAt + '" data-step-max="' + maxTime + '" data-patient-id="' + p.id + '">';
        html += '<div class="d-flex justify-content-between align-items-center mb-2">';
        html += '<span class="text-secondary small">Таймер шага</span>';
        html += '<span class="timer-value fw-bold">' + timeRemaining + ' сек</span>';
        html += '</div>';

        // Прогресс-бар
        html += '<div class="progress">';
        html += '<div class="progress-bar ' + progressBarClass(percent) + '" style="width: ' + percent + '%"></div>';
        html += '</div>';

        // Предупреждение об истечении времени
        if (t.expired) {
          html += '<div class="alert alert-danger mt-2 mb-0 py-1"><i class="bi bi-exclamation-triangle"></i> Время вышло!</div>';
        }

        html += '</div>';
      }

      html += '</div>'; // Закрываем mb-4

      // Основные кнопки действий
      html += '<div class="mt-auto">';

      if (t.timer_active && !t.completed_at) {
        var step = t.step || 1;
        var link = step === 1 ? '/patients/' + p.id + '/triage' :
                   step === 2 ? '/patients/' + p.id + '/triage/step2' :
                   '/patients/' + p.id + '/triage/step3';
        var btnCls = step === 1 ? 'btn-primary' :
                     step === 2 ? 'btn-warning' :
                     'btn-success';
        var btnText = step === 1 ? 'Шаг 1 — Уровень сознания' :
                      step === 2 ? 'Шаг 2 — Общая оценка' :
                      'Шаг 3 — Витальные функции';

        html += '<a href="' + link + '" class="btn ' + btnCls + ' btn-sm w-100 mb-2">';
        html += '<i class="bi bi-clipboard-pulse"></i> ' + btnText;
        html += '</a>';
      } else if (t.completed_at) {
        html += '<a href="/patients/' + p.id + '/triage/actions" class="btn btn-info btn-sm w-100 mb-2">';
        html += '<i class="bi bi-eye"></i> Действия по приоритету';
        html += '</a>';
        html += '<a href="/patients/' + p.id + '/triage/view" class="btn btn-outline-secondary btn-sm w-100">';
        html += '<i class="bi bi-file-text"></i> Просмотр данных триажа';
        html += '</a>';
      }

      html += '</div>';

      // Кнопки управления
      html += '<div class="action-bar mt-3 pt-3 border-top">';

      // Редактирование пациента
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-sm btn-outline-secondary flex-fill" title="Редактировать пациента">';
      html += '<i class="bi bi-pencil"></i>';
      html += '</a>';

      // Кнопки редактирования шагов (пока действия не завершены)
      if (t && !t.actions_completed_at) {
        // Проверяем наличие данных для шагов
        var hasStep1 = t.step1_data && Object.keys(t.step1_data).length > 0;
        var hasStep2 = t.step2_data && Object.keys(t.step2_data).length > 0;
        var hasStep3 = t.step3_data && Object.keys(t.step3_data).length > 0;

        if (hasStep1) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/1" class="btn btn-sm btn-outline-info" title="Редактировать шаг 1">';
          html += '<i class="bi bi-1-circle"></i>';
          html += '</a>';
        }
        if (hasStep2) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/2" class="btn btn-sm btn-outline-info" title="Редактировать шаг 2">';
          html += '<i class="bi bi-2-circle"></i>';
          html += '</a>';
        }
        if (hasStep3) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/3" class="btn btn-sm btn-outline-info" title="Редактировать шаг 3">';
          html += '<i class="bi bi-3-circle"></i>';
          html += '</a>';
        }
      }

      // Удаление пациента
      html += '<button type="button" class="btn btn-sm btn-outline-danger flex-fill" data-bs-toggle="modal" data-bs-target="#deleteModal' + p.id + '" title="Удалить пациента">';
      html += '<i class="bi bi-trash"></i>';
      html += '</button>';

      html += '</div>'; // Закрываем action-bar

    } else {
      // Нет триажа
      html += '<div class="alert alert-warning mb-4">';
      html += '<div class="d-flex align-items-center"><i class="bi bi-exclamation-circle me-2"></i>';
      html += '<div><div class="fw-medium">Триаж не создан</div><div class="small">Начните триаж для определения приоритета</div></div>';
      html += '</div>';
      html += '<a href="/patients/' + p.id + '/triage" class="btn btn-sm btn-primary w-100 mt-2">';
      html += '<i class="bi bi-play-circle"></i> Начать триаж';
      html += '</a>';
      html += '</div>';

      // Кнопки управления для пациента без триажа
      html += '<div class="action-bar mt-3 pt-3 border-top">';
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-sm btn-outline-secondary flex-fill">';
      html += '<i class="bi bi-pencil"></i> Редактировать';
      html += '</a>';
      html += '<button type="button" class="btn btn-sm btn-outline-danger flex-fill" data-bs-toggle="modal" data-bs-target="#deleteModal' + p.id + '">';
      html += '<i class="bi bi-trash"></i> Удалить';
      html += '</button>';
      html += '</div>';
    }

    html += '</div></div></div>'; // Закрываем card-body, card, col-card

    // Модальное окно удаления
    html += '<div class="modal fade" id="deleteModal' + p.id + '" tabindex="-1">';
    html += '<div class="modal-dialog modal-dialog-centered">';
    html += '<div class="modal-content">';
    html += '<div class="modal-header"><h5 class="modal-title">Подтверждение удаления</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>';
    html += '<div class="modal-body">';
    html += '<div class="d-flex align-items-center mb-3">';
    html += '<div class="bg-danger bg-opacity-10 p-2 rounded me-3"><i class="bi bi-exclamation-triangle text-danger" style="font-size: 1.5rem;"></i></div>';
    html += '<div><h6 class="mb-1">Вы уверены, что хотите удалить пациента?</h6><p class="text-muted small mb-0">Это действие нельзя отменить.</p></div>';
    html += '</div>';
    html += '<div class="bg-light p-3 rounded mb-3"><div class="row small">';
    html += '<div class="col-6"><div class="text-secondary mb-1">Пациент</div><div class="fw-medium">' + escapeHtml(p.full_name) + '</div></div>';
    html += '<div class="col-6"><div class="text-secondary mb-1">ID</div><div class="fw-medium">' + p.id + '</div></div>';
    if (t) {
      html += '<div class="col-12 mt-2"><div class="text-secondary mb-1">Статус триажа</div><div class="fw-medium">';
      if (t.completed_at) {
        html += 'Завершен (' + escapeHtml(t.priority_name || '') + ')';
      } else {
        html += 'Активен (шаг ' + (t.step || 1) + ')';
      }
      html += '</div></div>';
    }
    html += '</div></div>';
    html += '<div class="alert alert-warning small mb-0"><i class="bi bi-info-circle me-1"></i>Будут удалены все данные пациента, включая историю триажа.</div>';
    html += '</div>';
    html += '<div class="modal-footer">';
    html += '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Отмена</button>';
    html += '<form action="/patients/' + p.id + '" method="post" style="display: inline;">';
    html += '<input type="hidden" name="_method" value="DELETE">';
    html += '<button type="submit" class="btn btn-danger">Удалить пациента</button>';
    html += '</form>';
    html += '</div></div></div></div>';
  });

  container.innerHTML = html;

  // Инициализируем Bootstrap компоненты для новых элементов
  initBootstrapComponents();
}

// Загрузка списка пациентов
function fetchPatientsList() {
  // Собираем все текущие значения фильтров
  var search = document.querySelector('input[name="search"]') ? document.querySelector('input[name="search"]').value : '';
  var admission_date = document.querySelector('input[name="admission_date"]') ? document.querySelector('input[name="admission_date"]').value : '';
  var appeal_type = document.querySelector('select[name="appeal_type"]') ? document.querySelector('select[name="appeal_type"]').value : '';
  var pregnancy_condition = document.querySelector('select[name="pregnancy_condition"]') ? document.querySelector('select[name="pregnancy_condition"]').value : '';
  var performer_filter = document.querySelector('select[name="performer_filter"]') ? document.querySelector('select[name="performer_filter"]').value : '';
  var only_active = document.querySelector('select[name="only_active"]') ? document.querySelector('select[name="only_active"]').value : '';

  // Создаем параметры запроса
  var params = new URLSearchParams();
  if (search) params.append('search', search);
  if (admission_date) params.append('admission_date', admission_date);
  if (appeal_type && appeal_type !== 'all') params.append('appeal_type', appeal_type);
  if (pregnancy_condition) params.append('pregnancy_condition', pregnancy_condition);
  if (performer_filter) params.append('performer_filter', performer_filter);
  if (only_active) params.append('only_active', only_active);

  var qs = params.toString();
  var url = '/api/patients_list' + (qs ? '?' + qs : '');

  // AJAX запрос
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    if (xhr.status === 200) {
      serverDown = false;
      var serverDownAlert = document.getElementById('server-down-alert');
      if (serverDownAlert) {
        serverDownAlert.classList.add('d-none');
      }

      try {
        var patients = JSON.parse(xhr.responseText);
        var newHash = getPatientsHash(patients);

        // Перерисовываем только если изменилась структура (добавился/удалился пациент, изменился шаг/приоритет)
        // При первом запросе (lastPatientsHash === null) просто запоминаем хэш без перерисовки
        if (lastPatientsHash !== null && newHash !== lastPatientsHash) {
          renderPatientsList(patients);
        }
        lastPatientsHash = newHash;

        // Всегда обновляем timer_ends_at для точного countdown (без перерисовки)
        patients.forEach(function(p) {
          if (p.triage && p.triage.timer_active) {
            var box = document.querySelector('.timer-box[data-patient-id="' + p.id + '"]');
            if (box) {
              box.dataset.timerEndsAt = p.triage.timer_ends_at || 0;
              box.dataset.stepMax = p.triage.max_time || 120;
            }
          }
        });
      } catch(e) {
        console.error('Ошибка парсинга JSON:', e);
      }
    } else {
      serverDown = true;
      var serverDownAlert = document.getElementById('server-down-alert');
      if (serverDownAlert) {
        serverDownAlert.classList.remove('d-none');
        serverDownAlert.classList.add('show');
      }
    }
  };

  xhr.onerror = function() {
    serverDown = true;
    var serverDownAlert = document.getElementById('server-down-alert');
    if (serverDownAlert) {
      serverDownAlert.classList.remove('d-none');
      serverDownAlert.classList.add('show');
    }
  };

  xhr.send();
}

// Клиентский countdown таймеров (аналогично монитору)
function updateAllTimers() {
  var now = Date.now() / 1000;
  var timerBoxes = document.querySelectorAll('.timer-box');

  timerBoxes.forEach(function(box) {
    var timerEndsAt = parseFloat(box.dataset.timerEndsAt) || 0;
    var maxTime = parseFloat(box.dataset.stepMax) || 120;

    var timerValue = box.querySelector('.timer-value');
    var progressBar = box.querySelector('.progress-bar');

    if (!timerEndsAt || !timerValue) return;

    // Проверка сервера
    if (serverDown) {
      timerValue.textContent = 'Сервер не отвечает';
      box.classList.remove('timer-running');
      box.classList.add('timer-expired');
      return;
    }

    // Рассчитываем оставшееся время локально
    var remaining = Math.max(0, Math.floor(timerEndsAt - now));

    // Обновляем текст таймера
    timerValue.textContent = remaining + ' сек';

    // Обновляем классы
    box.classList.remove('timer-running', 'timer-expired');
    box.classList.add(remaining <= 0 ? 'timer-expired' : 'timer-running');

    // Обновляем прогресс-бар
    if (progressBar) {
      var percent = Math.max(0, Math.round((remaining / maxTime) * 100));
      progressBar.style.width = percent + '%';

      progressBar.classList.remove('progress-bar-success', 'progress-bar-warning', 'progress-bar-danger');
      if (percent <= 25) {
        progressBar.classList.add('progress-bar-danger');
      } else if (percent <= 50) {
        progressBar.classList.add('progress-bar-warning');
      } else {
        progressBar.classList.add('progress-bar-success');
      }
    }
  });
}

// Инициализация Bootstrap компонентов
function initBootstrapComponents() {
  // Модальные окна
  var modalElements = document.querySelectorAll('.modal');
  modalElements.forEach(function(modalEl) {
    if (!modalEl._modal) {
      var modal = new bootstrap.Modal(modalEl);
      modalEl._modal = modal;
    }
  });

  // Алерты
  var alertElements = document.querySelectorAll('.alert-dismissible');
  alertElements.forEach(function(alertEl) {
    if (!alertEl._alert) {
      var alert = new bootstrap.Alert(alertEl);
      alertEl._alert = alert;
    }
  });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  // Устанавливаем текущую дату как значение по умолчанию, если поле пустое
  var admissionDateInput = document.querySelector('input[name="admission_date"]');
  if (admissionDateInput && !admissionDateInput.value) {
    var today = new Date();
    var formattedDate = today.getFullYear() + '-' +
                       String(today.getMonth() + 1).padStart(2, '0') + '-' +
                       String(today.getDate()).padStart(2, '0');
    admissionDateInput.value = formattedDate;
  }

  // Устанавливаем значения из URL параметров
  var urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach(function(value, key) {
    var element = document.querySelector('[name="' + key + '"]');
    if (element) {
      element.value = value;
    }
  });

  // Если в URL нет параметра admission_date, добавляем его
  if (!urlParams.has('admission_date')) {
    var newUrl = new URL(window.location.href);
    var admissionDateValue = admissionDateInput ? admissionDateInput.value : new Date().toISOString().split('T')[0];
    newUrl.searchParams.set('admission_date', admissionDateValue);
    window.history.replaceState({}, '', newUrl);
  }

  // Обработчик для кнопки сброса
  var resetBtn = document.getElementById('reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', function(e) {
      e.preventDefault();

      var admissionDateInput2 = document.querySelector('input[name="admission_date"]');
      var currentDate = admissionDateInput2 ? admissionDateInput2.value : new Date().toISOString().split('T')[0];

      var newUrl = new URL(window.location.origin + '/patients');
      newUrl.searchParams.set('admission_date', currentDate);

      window.location.href = newUrl.toString();
    });
  }

  // Запускаем периодические обновления
  setInterval(updateAllTimers, 1000);
  setInterval(fetchPatientsList, 5000);

  // Первоначальная инициализация
  updateAllTimers();
  initBootstrapComponents();
});
