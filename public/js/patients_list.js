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
    var perf = p.performer_name || '';
    var st = (p.card_state_class || '').replace(/\s+/g, '');
    var flags = (p.can_delete === false ? '0' : '1') + (p.can_edit_saved_steps === false ? '0' : '1');
    return p.id + ':' + st + ':' + perf + ':' + flags + ':' + (t ? t.step + ':' + t.priority + ':' + (t.completed_at ? '1' : '0') + ':' + (t.timer_active ? '1' : '0') + ':' + (t.actions_completed_at ? '1' : '0') : 'null');
  }).join('|');
}

// Функции для классов
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

function stepDataHasValues(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.keys(obj).some(function(k) {
    var v = obj[k];
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}

// Должно совпадать с patient_list_card_state_class в app.rb (fallback при старых ответах API).
function patientListCardStateClass(p) {
  var t = p.triage;
  if (!t) return 'patient-b-card--notriage';
  if (t.actions_completed_at) return 'patient-b-card--done';
  if (!t.completed_at) return 'patient-b-card--triage-active';
  var pr = (t.priority || '').toString();
  if (pr === 'red') return 'patient-b-card--priority-red';
  if (pr === 'yellow') return 'patient-b-card--priority-yellow';
  if (pr === 'purple') return 'patient-b-card--priority-purple';
  if (pr === 'green') return 'patient-b-card--priority-green';
  return 'patient-b-card--triage-active';
}

// Карточка варианта B + модалки (должно совпадать с patient_list_variant_b.erb)
function renderPatientsList(patients) {
  var container = document.getElementById('patients-list-container');
  if (!patients || patients.length === 0) {
    container.innerHTML = '<div class="col-12"><div class="app-card card"><div class="card-body text-center py-5"><i class="bi bi-person-x text-muted" style="font-size: 3rem;"></i><h4 class="mt-3 mb-2">Пациенты не найдены</h4><p class="text-muted mb-0">Попробуйте изменить параметры поиска или создайте нового пациента.</p></div></div></div>';
    return;
  }

  var html = '';
  patients.forEach(function(p) {
    var t = p.triage;
    var detailId = 'patientDetailModal' + p.id;
    var deleteId = 'deleteModal' + p.id;
    var canDelete = p.can_delete !== false;
    var canEditSaved = p.can_edit_saved_steps !== false;
    var maxTime = t ? (t.max_time || 120) : 120;
    var stateCls = p.card_state_class || patientListCardStateClass(p);

    html += '<div class="col-12 col-md-6 col-xl-4 col-card">';
    html += '<div class="patient-b-card h-100 ' + stateCls + '">';
    html += '<div class="patient-b-head"><h2 class="patient-b-fio">' + escapeHtml(p.full_name) + '</h2></div>';
    html += '<div class="small text-secondary">' + escapeHtml(p.admission_date || '');
    if (p.admission_time) {
      html += ' · ' + escapeHtml(p.admission_time);
    }
    html += '<span class="text-muted">·</span> исп. <strong class="text-body">' + escapeHtml(p.performer_name || '') + '</strong></div>';

    if (t) {
      html += '<div class="patient-b-chips">';
      if (t.completed_at && t.priority && t.priority !== 'pending') {
        html += '<span class="badge ' + priorityClass(t.priority) + '">' + escapeHtml(t.priority_name || t.priority) + '</span>';
      } else if (!t.completed_at) {
        html += '<span class="badge patient-b-step-badge"><i class="bi bi-' + (t.step || 1) + '-circle"></i> Шаг ' + (t.step || 1) + '</span>';
      }
      html += '</div>';

      if (t.timer_active) {
        var timeRemaining = t.time_remaining || 0;
        var percent = maxTime ? Math.round((timeRemaining / maxTime) * 100) : 100;
        percent = Math.max(0, Math.min(100, percent));
        var timerBoxClass = t.expired ? 'timer-expired' : 'timer-running';
        var borderEx = t.expired ? ' border border-danger-subtle' : '';
        html += '<div class="patient-b-timer-line timer-box patient-list-timer ' + timerBoxClass + borderEx + '" data-timer-ends-at="' + (t.timer_ends_at || 0) + '" data-step-max="' + maxTime + '" data-patient-id="' + p.id + '">';
        html += '<span class="text-secondary small text-nowrap">Таймер</span>';
        html += '<div class="progress mb-0"><div class="progress-bar ' + progressBarClass(percent) + '" style="width: ' + percent + '%"></div></div>';
        html += '<span class="fw-bold small text-nowrap timer-value">' + formatTime(timeRemaining) + '</span>';
        html += '</div>';
      } else if (t.completed_at && !t.actions_completed_at) {
        html += '<div class="small text-muted mb-0"><i class="bi bi-list-task"></i> Действия приоритета</div>';
      } else if (t.actions_completed_at) {
        html += '<div class="small text-muted mb-0"><i class="bi bi-check-all"></i> Все действия завершены</div>';
      }
    } else {
      html += '<div class="small text-info mb-0"><i class="bi bi-info-circle"></i> Триаж не начат</div>';
    }

    html += '<div class="patient-b-actions">';
    html += '<button type="button" class="btn btn-outline-secondary w-100" data-bs-toggle="modal" data-bs-target="#' + detailId + '">';
    html += '<i class="bi bi-layout-text-sidebar-reverse me-1"></i> Подробнее и действия</button>';
    html += '</div></div></div>';

    // ——— Модалка подробнее ———
    html += '<div class="modal fade patient-detail-modal" id="' + detailId + '" tabindex="-1" aria-hidden="true">';
    html += '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div class="modal-content">';
    html += '<div class="modal-header border-0 pb-0"><div>';
    html += '<h5 class="modal-title">' + escapeHtml(p.full_name) + '</h5>';
    html += '<div class="small text-muted">ID ' + p.id;
    if (t) {
      html += ' · ';
      html += t.completed_at ? 'триаж завершён' : ('шаг ' + (t.step || 1));
    } else {
      html += ' · триаж не создан';
    }
    html += '</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button></div>';
    html += '<div class="modal-body pt-2">';

    if (t) {
      html += '<div class="d-flex flex-wrap gap-2 mb-3">';
      if (t.completed_at && t.priority && t.priority !== 'pending') {
        html += '<span class="badge ' + priorityClass(t.priority) + '">' + escapeHtml(t.priority_name || t.priority) + '</span>';
      } else if (!t.completed_at) {
        html += '<span class="badge patient-b-step-badge">Шаг ' + (t.step || 1) + '</span>';
      }
      html += '</div>';
    }

    html += '<dl class="patient-detail-dl mb-4">';
    html += '<dt>Поступление</dt><dd>' + escapeHtml(p.admission_date || '') + (p.admission_time ? ', ' + escapeHtml(p.admission_time) : '') + '</dd>';
    html += '<dt>Исполнитель</dt><dd>' + escapeHtml(p.performer_name || '') + '</dd>';
    html += '<dt>Дата рождения</dt><dd>' + escapeHtml(p.birth_date || '—') + '</dd>';
    html += '<dt>Вид обращения</dt><dd>' + escapeHtml(p.appeal_type || '') + '</dd>';
    html += '<dt>Срок беременности</dt><dd>' + escapeHtml(p.pregnancy_display || '') + '</dd>';
    html += '</dl>';

    if (t && t.expired && t.timer_active && !t.completed_at) {
      html += '<div class="alert alert-danger py-2 small mb-3"><i class="bi bi-exclamation-triangle me-1"></i> Время шага истекло — сохраните шаг или продолжите по ситуации.</div>';
    }

    html += '<div class="d-grid gap-2">';
    if (!t) {
      html += '<form action="/patients/' + p.id + '/triage/start" method="post" class="d-grid">';
      html += '<button type="submit" class="btn btn-primary btn-lg"><i class="bi bi-play-circle me-2"></i> Начать триаж</button></form>';
      html += '<div class="patient-detail-modal-footer-actions d-grid gap-2 pt-2 border-top mt-1">';
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-outline-secondary"><i class="bi bi-pencil me-1"></i> Карта пациента</a></div>';
    } else if (!t.completed_at) {
      var step = t.step || 1;
      var link = step === 1 ? '/patients/' + p.id + '/triage' : (step === 2 ? '/patients/' + p.id + '/triage/step2' : '/patients/' + p.id + '/triage/step3');
      var btnText = step === 1 ? 'Шаг 1 — Уровень сознания' : (step === 2 ? 'Шаг 2 — Общая оценка' : 'Шаг 3 — Витальные функции');
      html += '<a href="' + link + '" class="btn btn-primary btn-lg"><i class="bi bi-clipboard-pulse me-2"></i> ' + btnText + '</a>';
      var showStepRow = !t.actions_completed_at && canEditSaved;
      if (showStepRow) {
        html += '<div class="d-flex flex-wrap gap-2">';
        if (stepDataHasValues(t.step1_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/1" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 1</a>';
        }
        if (stepDataHasValues(t.step2_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/2" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 2</a>';
        }
        if (stepDataHasValues(t.step3_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/3" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 3</a>';
        }
        html += '</div>';
      }
      html += '<div class="patient-detail-modal-footer-actions d-grid gap-2 pt-2 border-top mt-1">';
      html += '<a href="/patients/' + p.id + '/triage/view" class="btn btn-outline-secondary"><i class="bi bi-file-text me-1"></i> Просмотр данных триажа</a>';
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-outline-secondary"><i class="bi bi-pencil me-1"></i> Карта пациента</a></div>';
    } else if (!t.actions_completed_at) {
      html += '<a href="/patients/' + p.id + '/triage/actions" class="btn btn-primary btn-lg"><i class="bi bi-list-check me-2"></i> Действия по приоритету</a>';
      var showStepRowActions = canEditSaved;
      if (showStepRowActions) {
        html += '<div class="d-flex flex-wrap gap-2">';
        if (stepDataHasValues(t.step1_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/1" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 1</a>';
        }
        if (stepDataHasValues(t.step2_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/2" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 2</a>';
        }
        if (stepDataHasValues(t.step3_data)) {
          html += '<a href="/patients/' + p.id + '/triage/edit_step/3" class="btn btn-primary flex-grow-1" style="min-width:7rem">Ред. шаг 3</a>';
        }
        html += '</div>';
      }
      html += '<div class="patient-detail-modal-footer-actions d-grid gap-2 pt-2 border-top mt-1">';
      html += '<a href="/patients/' + p.id + '/triage/view" class="btn btn-outline-secondary"><i class="bi bi-file-text me-1"></i> Просмотр данных триажа</a>';
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-outline-secondary"><i class="bi bi-pencil me-1"></i> Карта пациента</a></div>';
    } else {
      html += '<div class="patient-detail-modal-footer-actions d-grid gap-2">';
      html += '<a href="/patients/' + p.id + '/triage/view" class="btn btn-outline-secondary"><i class="bi bi-file-text me-1"></i> Просмотр данных триажа</a>';
      html += '<a href="/patients/' + p.id + '/edit" class="btn btn-outline-secondary"><i class="bi bi-pencil me-1"></i> Карта пациента</a></div>';
    }
    if (canDelete) {
      html += '<button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal" data-bs-toggle="modal" data-bs-target="#' + deleteId + '">';
      html += '<i class="bi bi-trash me-1"></i> Удалить пациента</button>';
    }
    html += '</div></div></div></div>';

    if (canDelete) {
      html += '<div class="modal fade" id="' + deleteId + '" tabindex="-1" aria-hidden="true">';
      html += '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">';
      html += '<div class="modal-header"><h5 class="modal-title">Подтверждение удаления</h5>';
      html += '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button></div>';
      html += '<div class="modal-body">';
      html += '<div class="d-flex align-items-center mb-3"><div class="bg-danger bg-opacity-10 p-2 rounded me-3">';
      html += '<i class="bi bi-exclamation-triangle text-danger fs-4"></i></div><div>';
      html += '<h6 class="mb-1">Удалить пациента?</h6><p class="text-muted small mb-0">Действие необратимо.</p></div></div>';
      html += '<div class="bg-light p-3 rounded mb-3 small"><div class="fw-medium">' + escapeHtml(p.full_name) + '</div>';
      html += '<div class="text-muted">ID ' + p.id + '</div>';
      if (t) {
        html += '<div class="mt-2 text-muted">Триаж: ';
        if (t.actions_completed_at) html += 'завершён полностью';
        else if (t.completed_at) html += 'действия приоритета';
        else html += 'шаг ' + (t.step || 1);
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="alert alert-warning small mb-0 py-2"><i class="bi bi-info-circle me-1"></i> Будут удалены все данные пациента и история триажа.</div>';
      html += '</div><div class="modal-footer">';
      html += '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Отмена</button>';
      html += '<form action="/patients/' + p.id + '" method="post" class="d-inline">';
      html += '<input type="hidden" name="_method" value="DELETE">';
      html += '<button type="submit" class="btn btn-danger">Удалить</button></form></div></div></div></div>';
    }
  });

  container.innerHTML = html;
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

    // Обновляем текст таймера (в списке пациентов — мм:сс)
    if (box.classList.contains('patient-list-timer')) {
      timerValue.textContent = formatTime(remaining);
    } else {
      timerValue.textContent = remaining + ' сек';
    }

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
