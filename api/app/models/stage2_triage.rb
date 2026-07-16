# frozen_string_literal: true

class Stage2Triage < ApplicationRecord
  include BroadcastsStage2Realtime

  attr_accessor :skip_list_broadcast

  PHASES = %w[pre_doctor decision doctor action exit].freeze

  PHASE_LABELS = {
    "pre_doctor" => "Доврачебный осмотр",
    "decision" => "Точка принятия решения",
    "doctor" => "Врачебный осмотр",
    "action" => "Точка действия",
    "exit" => "Точка выхода"
  }.freeze

  PRIORITIES = %w[pending red yellow orange grey green].freeze
  DECISION_PRIORITIES = Stage2Rules::DECISION_PRIORITIES

  PRE_DOCTOR_DISCHARGE_KEYS = Stage2Rules::DISCHARGE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_FHR_KEYS = Stage2Rules::FETAL_HEART_RATE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_UTERINE_KEYS = Stage2Rules::UTERINE_TONE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_SKIN_COLOR_KEYS = Stage2Rules::SKIN_COLOR_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_EDEMA_LOCATION_KEYS = Stage2Rules::EDEMA_LOCATION_OPTIONS.map { |o| o[:key] }.freeze
  INVESTIGATION_KEYS = (
    Stage2Rules::INVESTIGATION_OPTIONS.map { |o| o[:key] } +
    Stage2Rules::LAB_INVESTIGATION_OPTIONS.map { |o| o[:key] }
  ).freeze
  CTG_RESULT_KEYS = Stage2Rules::CTG_RESULT_OPTIONS.map { |o| o[:key] }.freeze
  ULTRASOUND_FINDING_KEYS = Stage2Rules::ULTRASOUND_FINDING_OPTIONS.map { |o| o[:key] }.freeze

  belongs_to :stage2_case

  validates :current_phase, inclusion: { in: PHASES }
  validates :priority, inclusion: { in: PRIORITIES }
  validates :suggested_priority, inclusion: { in: PRIORITIES }

  def self.pre_doctor_priority_strategy
    @pre_doctor_priority_strategy ||= Stage2Rules::PreDoctorPriorityStrategy.new
  end

  def self.actions_catalog
    @actions_catalog ||= Stage2Rules::DefaultActionsCatalog.new
  end

  def self.action_text_for_key(key)
    actions_catalog.action_text_for_key(key)
  end

  def self.action_display_text(action_key, payload = {})
    return nil if action_key.blank?

    text = Triage.strip_priority_prefix(action_text_for_key(action_key))
    Triage.append_audit_value(text, payload)
  end

  def phase_label
    PHASE_LABELS[current_phase] || current_phase
  end

  def priority_name
    Stage2Rules::PRIORITY_NAMES[priority] || "не определён"
  end

  def suggested_priority_name
    Stage2Rules::PRIORITY_NAMES[suggested_priority] || "не определён"
  end

  def phase_data_hash
    h = phase_data
    h.is_a?(Hash) ? h : {}
  end

  def pre_doctor_data
    phase_data_hash["pre_doctor"] || {}
  end

  def decision_data
    phase_data_hash["decision"] || {}
  end

  def doctor_data
    phase_data_hash["doctor"] || {}
  end

  def doctor_examination_completed?
    return true if doctor_data["completed_at"].present?
    # Записи до разделения на доврачебный и врачебный осмотр
    return true if decision_data["completed_at"].present?
    return true if priority != "pending" && decision_data.present?

    false
  end

  def investigations_data
    doctor_data["investigations"] || {}
  end

  def pre_doctor_completed?
    pre_doctor_data["completed_at"].present?
  end

  def decision_completed?
    return true if decision_data["completed_at"].present?

    pre_doctor_completed? && priority != "pending" && decision_data.empty?
  end

  def actions_completed?
    actions_completed_at.present?
  end

  def workflow_route
    return "awaiting_acceptance" if stage2_case&.pending_acceptance?
    return "completed" if actions_completed?
    return "actions" if decision_completed? && priority != "pending" && !actions_completed?
    return "decision" if doctor_examination_completed? && !decision_completed?
    return "doctor_examination" if pre_doctor_completed? && !doctor_examination_completed?
    return "pre_doctor" if current_phase == "pre_doctor" && !pre_doctor_completed?

    "stub"
  end

  def display_priority
    return priority if priority != "pending"
    return suggested_priority if pre_doctor_completed? && suggested_priority != "pending"

    nil
  end

  def display_priority_name
    if priority != "pending"
      priority_name
    elsif pre_doctor_completed? && suggested_priority != "pending"
      "Рекомендация: #{suggested_priority_name}"
    else
      nil
    end
  end

  def submit_pre_doctor!(attrs, user: nil)
    raise ArgumentError, "Доврачебный этап уже завершён" if pre_doctor_completed?

    validated = validate_pre_doctor_attrs!(attrs)
    suggested = self.class.pre_doctor_priority_strategy.evaluate(validated)
    now = Time.current
    accepted_at = stage2_case&.accepted_at || started_at || now
    duration_seconds = (now - accepted_at).to_i

    merged = phase_data_hash.merge(
      "pre_doctor" => validated.merge(
        "accepted_at" => accepted_at.iso8601,
        "completed_at" => now.iso8601,
        "duration_seconds" => duration_seconds,
        "completed_by_user_id" => user&.id
      )
    )

    update!(
      phase_data: merged,
      suggested_priority: suggested,
      current_phase: "doctor"
    )

    suggested
  end

  def submit_doctor_examination!(attrs, user: nil)
    raise ArgumentError, "Сначала завершите доврачебный осмотр" unless pre_doctor_completed?
    raise ArgumentError, "Врачебный осмотр уже завершён" if doctor_examination_completed?

    validated = validate_doctor_examination_attrs!(attrs)
    now = Time.current.iso8601

    merged = phase_data_hash.merge(
      "doctor" => validated.merge(
        "completed_at" => now,
        "completed_by_user_id" => user&.id
      )
    )

    update!(
      phase_data: merged,
      current_phase: "decision"
    )

    validated
  end

  def submit_decision!(priority:, note: nil, user: nil)
    raise ArgumentError, "invalid priority" unless DECISION_PRIORITIES.include?(priority.to_s)
    raise ArgumentError, "Сначала завершите доврачебный осмотр" unless pre_doctor_completed?
    raise ArgumentError, "Сначала завершите врачебный осмотр" unless doctor_examination_completed?
    raise ArgumentError, "Решение уже принято" if decision_completed? && decision_data["completed_at"].present?

    now = Time.current
    merged = phase_data_hash.merge(
      "decision" => {
        "priority" => priority.to_s,
        "note" => note.presence,
        "completed_at" => now.iso8601,
        "completed_by_user_id" => user&.id,
        "suggested_priority" => suggested_priority
      }
    )

    update!(
      priority: priority.to_s,
      current_phase: "action",
      actions_started_at: now,
      phase_data: merged
    )

    priority.to_s
  end

  def mark_action!(action_key)
    raise ArgumentError, "Это действие — рекомендация, отметка не требуется" unless markable_action?(action_key)

    self.actions_data ||= {}
    action = priority_actions.find { |a| a[:key] == action_key.to_s }
    if action[:final]
      final_actions.each do |final_def|
        next if final_def[:key] == action_key.to_s

        actions_data.delete(final_def[:key])
      end
    end

    return if actions_data[action_key]

    actions_data[action_key] = Time.now.to_i
    save!
  end

  def unmark_action!(action_key)
    self.actions_data ||= {}
    actions_data.delete(action_key)
    save!
  end

  def action_completed?(action_key)
    actions_data.is_a?(Hash) && actions_data[action_key].present?
  end

  def can_complete_final_action?
    return false unless actions_data.is_a?(Hash)

    marked = final_actions.select { |a| action_completed?(a[:key]) }
    marked.size == 1
  end

  def selected_final_action
    final_actions.find { |a| action_completed?(a[:key]) }
  end

  def final_actions
    priority_actions.select { |a| a[:final] == true }
  end

  def markable_action?(action_key)
    action = priority_actions.find { |a| a[:key] == action_key.to_s }
    return false unless action

    action[:final] == true
  end

  def complete_actions!
    final_action = selected_final_action
    return false unless final_action
    return false unless can_complete_final_action? && action_completed?(final_action[:key])

    now = Time.current
    update!(
      actions_completed_at: now,
      current_phase: "exit",
      completed_at: now,
      timer_active: false
    )
    true
  end

  def priority_actions
    self.class.actions_catalog.actions_for(priority: priority, triage: self)
  end

  def advance_phase!
    return false if current_phase == "pre_doctor" && !pre_doctor_completed?

    idx = PHASES.index(current_phase)
    return false unless idx && idx < PHASES.size - 1

    next_phase = PHASES[idx + 1]
    attrs = { current_phase: next_phase }
    attrs[:completed_at] = Time.current if next_phase == "exit"
    attrs[:timer_active] = false if next_phase == "exit"
    update!(attrs)
    true
  end

  def completed?
    completed_at.present? || current_phase == "exit"
  end

  class DraftConflictError < StandardError
    attr_reader :phase_key, :phase_data, :draft_revision, :updated_by_name

    def initialize(message, phase_key:, phase_data:, draft_revision:, updated_by_name:)
      @phase_key = phase_key
      @phase_data = phase_data
      @draft_revision = draft_revision
      @updated_by_name = updated_by_name
      super(message)
    end
  end

  def save_draft!(phase, attrs, user:, expected_revision: nil)
    phase_key = draft_phase_key(phase)
    raise ArgumentError, "unknown phase" unless phase_key

    guard_draft_allowed!(phase_key)

    incoming = normalize_draft_attrs(phase_key, attrs)
    current = (phase_data_hash[phase_key] || {}).dup
    assert_draft_revision!(current, user: user, expected_revision: expected_revision)

    merged = deep_merge_draft(current, incoming)
    merged = strip_completion_fields(merged)
    merged = apply_draft_meta(merged, user)

    self.skip_list_broadcast = true
    update!(phase_data: phase_data_hash.merge(phase_key => merged))

    broadcast_stage2_triage_draft(
      patient_id: stage2_case.patient_id,
      phase: phase_key,
      phase_data: merged
    )

    merged
  end

  PHASE_EDIT_KEYS = %w[pre_doctor doctor_examination decision].freeze

  def preview_phase_update(phase, params)
    raise ArgumentError, "Действия по приоритету завершены. Редактирование недоступно." if actions_completed?

    phase_key = normalize_phase_edit_key(phase)
    raise ArgumentError, "Неверная фаза" unless PHASE_EDIT_KEYS.include?(phase_key)

    case phase_key
    when "pre_doctor"
      preview_pre_doctor_phase_update(params)
    when "doctor_examination"
      preview_doctor_examination_phase_update(params)
    when "decision"
      preview_decision_phase_update(params)
    end
  end

  def apply_update_phase!(phase, params)
    raise ArgumentError, "Действия по приоритету завершены. Редактирование недоступно." if actions_completed?

    phase_key = normalize_phase_edit_key(phase)
    raise ArgumentError, "Неверная фаза" unless PHASE_EDIT_KEYS.include?(phase_key)

    case phase_key
    when "pre_doctor"
      apply_update_pre_doctor_phase!(params)
    when "doctor_examination"
      apply_update_doctor_examination_phase!(params)
    when "decision"
      apply_update_decision_phase!(params)
    end
  end

  private

  def normalize_phase_edit_key(phase)
    case phase.to_s
    when "pre_doctor", "pre-doctor" then "pre_doctor"
    when "doctor_examination", "doctor-examination", "doctor" then "doctor_examination"
    when "decision" then "decision"
    else phase.to_s
    end
  end

  def preview_pre_doctor_phase_update(params)
    raise ArgumentError, "Доврачебный этап ещё не пройден" unless pre_doctor_completed?

    validated = validate_pre_doctor_attrs!(params)
    new_suggested = self.class.pre_doctor_priority_strategy.evaluate(validated)
    {
      suggested_priority_changed: new_suggested != suggested_priority,
      suggested_priority: new_suggested,
      suggested_priority_name: Stage2Rules::PRIORITY_NAMES[new_suggested],
      downstream_reset: decision_data["completed_at"].present?
    }
  end

  def preview_doctor_examination_phase_update(params)
    raise ArgumentError, "Врачебный осмотр ещё не пройден" unless doctor_examination_completed?

    { downstream_reset: false }
  end

  def preview_decision_phase_update(params)
    raise ArgumentError, "Решение ещё не принято" unless decision_data["completed_at"].present?

    new_priority = (params[:priority] || params["priority"]).to_s
    raise ArgumentError, "invalid priority" unless DECISION_PRIORITIES.include?(new_priority)

    {
      priority_changed: new_priority != priority,
      current_priority: priority,
      current_priority_name: priority_name,
      new_priority: new_priority,
      new_priority_name: Stage2Rules::PRIORITY_NAMES[new_priority],
      downstream_reset: new_priority != priority && actions_data.present?
    }
  end

  def apply_update_pre_doctor_phase!(params)
    raise ArgumentError, "Доврачебный этап ещё не пройден" unless pre_doctor_completed?

    validated = validate_pre_doctor_attrs!(params)
    new_suggested = self.class.pre_doctor_priority_strategy.evaluate(validated)
    existing = pre_doctor_data
    completion_meta = existing.slice(
      "accepted_at", "completed_at", "duration_seconds", "completed_by_user_id", "called_doctor_name", "called_doctor_user_id"
    )

    merged_pd = validated.merge(completion_meta)
    new_phase_data = phase_data_hash.merge("pre_doctor" => merged_pd)
    attrs = {
      phase_data: new_phase_data,
      suggested_priority: new_suggested
    }

    if decision_data["completed_at"].present?
      attrs[:phase_data] = new_phase_data.merge("decision" => {})
      attrs[:priority] = "pending"
      attrs[:actions_data] = {}
      attrs[:actions_started_at] = nil
      attrs[:actions_completed_at] = nil
      attrs[:current_phase] = doctor_examination_completed? ? "decision" : "doctor"
    end

    update!(attrs)
    self
  end

  def apply_update_doctor_examination_phase!(params)
    raise ArgumentError, "Врачебный осмотр ещё не пройден" unless doctor_examination_completed?

    validated = validate_doctor_examination_attrs!(params)
    existing = doctor_data
    completion_meta = existing.slice("completed_at", "completed_by_user_id")
    merged_doc = validated.merge(completion_meta)

    update!(phase_data: phase_data_hash.merge("doctor" => merged_doc))
    self
  end

  def apply_update_decision_phase!(params)
    raise ArgumentError, "Решение ещё не принято" unless decision_data["completed_at"].present?

    new_priority = (params[:priority] || params["priority"]).to_s
    note = (params[:note] || params["note"]).to_s.strip.presence
    raise ArgumentError, "invalid priority" unless DECISION_PRIORITIES.include?(new_priority)

    old_priority = priority
    merged_decision = decision_data.merge(
      "priority" => new_priority,
      "note" => note,
      "suggested_priority" => suggested_priority
    )

    attrs = {
      priority: new_priority,
      phase_data: phase_data_hash.merge("decision" => merged_decision)
    }

    if old_priority != new_priority
      attrs[:actions_data] = {}
      attrs[:actions_started_at] = Time.current
      attrs[:actions_completed_at] = nil
    end

    update!(attrs)
    self
  end

  def validate_pre_doctor_attrs!(attrs)
    discharge = attrs[:discharge].to_s
    fetal = attrs[:fetal_heart_rate].to_s
    uterine = attrs[:uterine_tone].to_s
    pain = attrs[:pain_vas].to_i
    skin_color, has_rash, has_edema, rash_description, edema_location = extract_skin_attrs(attrs)
    duration_sec = attrs[:contraction_duration_sec]
    interval_min = attrs[:contraction_interval_min]
    vitals_src = attrs[:vitals].is_a?(Hash) ? attrs[:vitals] : {}
    doctor_called = truthy_flag?(attrs[:doctor_called])
    ctg_ordered = truthy_flag?(attrs[:ctg_ordered])
    ultrasound_ordered = truthy_flag?(attrs[:ultrasound_ordered])

    errors = []
    errors << "Укажите характер выделений" unless PRE_DOCTOR_DISCHARGE_KEYS.include?(discharge)
    errors << "Укажите сердцебиение плода" unless PRE_DOCTOR_FHR_KEYS.include?(fetal)
    errors << "Укажите маточный тонус" unless PRE_DOCTOR_UTERINE_KEYS.include?(uterine)
    errors << "Оцените боль по ВАШ (0–10)" unless pain.between?(0, 10)
    errors << "Укажите осмотр кожных покровов" unless PRE_DOCTOR_SKIN_COLOR_KEYS.include?(skin_color)

    if !(attrs.key?(:has_rash) || attrs.key?("has_rash")) && (attrs[:skin_finding] || attrs["skin_finding"]).to_s != "rash"
      errors << "Укажите наличие сыпи"
    end
    if !(attrs.key?(:has_edema) || attrs.key?("has_edema")) && (attrs[:skin_finding] || attrs["skin_finding"]).to_s != "edema"
      errors << "Укажите наличие отёков"
    end

    if uterine == "labor_regular"
      errors << "Укажите длительность схватки (сек)" unless positive_int?(duration_sec)
      errors << "Укажите интервал между схватками (мин)" unless positive_int?(interval_min)
    elsif uterine == "labor_irregular"
      errors << "Укажите длительность схватки (сек)" unless positive_int?(duration_sec)
    end

    if has_rash && rash_description.blank?
      errors << "Опишите сыпь"
    end

    if has_edema && !PRE_DOCTOR_EDEMA_LOCATION_KEYS.include?(edema_location)
      errors << "Укажите локализацию отёков"
    end

    vitals = {}
    Stage2Rules::VITAL_FIELDS.each do |field|
      val = vitals_src[field] || vitals_src[field.to_sym]
      if field == "saturation"
        errors << "Укажите сатурацию (0–100)" unless val.to_s.match?(/\A\d+\z/) && val.to_i.between?(0, 100)
        vitals[field] = val.to_i if val.present?
      else
        errors << "Укажите #{vital_label(field)}" unless positive_int?(val)
        vitals[field] = val.to_i if val.present?
      end
    end

    if vitals["systolic_bp"].to_i.positive? && vitals["diastolic_bp"].to_i.positive?
      if vitals["diastolic_bp"] >= vitals["systolic_bp"]
        errors << "Диастолическое АД должно быть меньше систолического"
      end
    end

    errors << "Отметьте вызов врача" unless doctor_called

    raise ArgumentError, errors.join("; ") if errors.any?

    result = {
      "discharge" => discharge,
      "fetal_heart_rate" => fetal,
      "uterine_tone" => uterine,
      "pain_vas" => pain,
      "skin_color" => skin_color,
      "has_rash" => has_rash,
      "has_edema" => has_edema,
      "vitals" => vitals,
      "doctor_called" => doctor_called,
      "ctg_ordered" => ctg_ordered,
      "ultrasound_ordered" => ultrasound_ordered
    }

    if uterine == "labor_regular"
      result["contraction_duration_sec"] = duration_sec.to_i
      result["contraction_interval_min"] = interval_min.to_i
    elsif uterine == "labor_irregular"
      result["contraction_duration_sec"] = duration_sec.to_i
    end

    result["rash_description"] = rash_description if has_rash
    result["edema_location"] = edema_location if has_edema

    result
  end

  def extract_skin_attrs(attrs)
    legacy_skin = (attrs[:skin_finding] || attrs["skin_finding"]).to_s
    skin_color = (attrs[:skin_color] || attrs["skin_color"]).to_s.presence
    if skin_color.blank? && legacy_skin.present? && !%w[rash edema].include?(legacy_skin)
      skin_color = legacy_skin
    end
    skin_color = "normal_color" if skin_color.blank?

    has_rash = truthy_flag?(attrs[:has_rash]) || legacy_skin == "rash"
    has_edema = truthy_flag?(attrs[:has_edema]) || legacy_skin == "edema"
    rash_description = (attrs[:rash_description] || attrs["rash_description"]).to_s.strip
    edema_location = (attrs[:edema_location] || attrs["edema_location"]).to_s.presence

    [skin_color, has_rash, has_edema, rash_description, edema_location]
  end

  def validate_doctor_examination_attrs!(attrs)
    inv_src = attrs[:investigations].is_a?(Hash) ? attrs[:investigations] : {}
    ctg_src = attrs[:ctg].is_a?(Hash) ? attrs[:ctg] : {}
    us_src = attrs[:ultrasound].is_a?(Hash) ? attrs[:ultrasound] : {}
    conclusion = attrs[:medical_conclusion].to_s.strip
    errors = []

    investigations = {}
    INVESTIGATION_KEYS.each do |key|
      raw = inv_src[key] || inv_src[key.to_sym]
      legacy_raw = legacy_lab_flag(inv_src, key)
      investigations[key] = truthy_flag?(raw) || truthy_flag?(legacy_raw)
    end

    ctg = nil
    if investigations["ctg_done"]
      result_type = (ctg_src["result_type"] || ctg_src[:result_type]).to_s
      errors << "Укажите результат КТГ" unless CTG_RESULT_KEYS.include?(result_type)

      basal_hr = ctg_src["basal_hr"] || ctg_src[:basal_hr]

      errors << "Укажите базальную ЧСС плода" unless positive_int?(basal_hr)

      ctg = { "result_type" => result_type, "basal_hr" => basal_hr.to_i }
    end

    ultrasound = nil
    if investigations["ultrasound_done"]
      finding = (us_src["finding"] || us_src[:finding]).to_s
      errors << "Укажите результат УЗИ" unless ULTRASOUND_FINDING_KEYS.include?(finding)

      disorders_text = (us_src["disorders_text"] || us_src[:disorders_text]).to_s.strip

      if finding == "disorders_found"
        errors << "Опишите выявленные нарушения при УЗИ" if disorders_text.blank?
      end

      ultrasound = { "finding" => finding }
      ultrasound["disorders_text"] = disorders_text if finding == "disorders_found"
    end

    raise ArgumentError, errors.join("; ") if errors.any?

    result = {
      "investigations" => investigations,
      "medical_conclusion" => conclusion.presence
    }
    result["ctg"] = ctg if ctg
    result["ultrasound"] = ultrasound if ultrasound
    result
  end

  def positive_int?(val)
    val.to_s.match?(/\A[1-9]\d*\z/)
  end

  def truthy_flag?(val)
    val == true || val.to_s == "true" || val == "1" || val == 1
  end

  def legacy_lab_flag(inv_src, key)
    case key
    when "labs_blood" then inv_src["labs_blood_done"] || inv_src[:labs_blood_done]
    when "labs_urine" then inv_src["labs_urine_done"] || inv_src[:labs_urine_done]
    end
  end

  def vital_label(field)
    {
      "systolic_bp" => "систолическое АД",
      "diastolic_bp" => "диастолическое АД",
      "heart_rate" => "ЧСС",
      "respiratory_rate" => "ЧД",
      "saturation" => "сатурацию"
    }[field] || field
  end

  def draft_phase_key(phase)
    case phase.to_s
    when "pre_doctor" then "pre_doctor"
    when "doctor_examination", "doctor" then "doctor"
    when "decision" then "decision"
    end
  end

  def guard_draft_allowed!(phase_key)
    case phase_key
    when "pre_doctor"
      raise ArgumentError, "Доврачебный этап уже завершён" if pre_doctor_completed?
    when "doctor"
      raise ArgumentError, "Сначала завершите доврачебный осмотр" unless pre_doctor_completed?
      raise ArgumentError, "Врачебный осмотр уже завершён" if doctor_examination_completed?
    when "decision"
      raise ArgumentError, "Сначала завершите врачебный осмотр" unless doctor_examination_completed?
      raise ArgumentError, "Решение уже принято" if decision_data["completed_at"].present?
    end
  end

  def normalize_draft_attrs(phase_key, attrs)
    src = attrs.is_a?(Hash) ? attrs : {}
    case phase_key
    when "pre_doctor"
      normalize_pre_doctor_draft(src)
    when "doctor"
      normalize_doctor_draft(src)
    when "decision"
      {
        "priority" => src[:priority].presence || src["priority"].presence,
        "note" => (src[:note] || src["note"]).to_s.strip.presence
      }.compact
    else
      {}
    end
  end

  def normalize_pre_doctor_draft(attrs)
    vitals_src = attrs[:vitals].is_a?(Hash) ? attrs[:vitals] : (attrs["vitals"].is_a?(Hash) ? attrs["vitals"] : {})
    vitals = {}
    Stage2Rules::VITAL_FIELDS.each do |field|
      val = vitals_src[field] || vitals_src[field.to_sym]
      vitals[field] = val.to_i if val.present? && val.to_s.match?(/\A\d+\z/)
    end

    h = {}
    %i[discharge fetal_heart_rate uterine_tone skin_color edema_location rash_description].each do |k|
      v = attrs[k] || attrs[k.to_s]
      h[k.to_s] = v.to_s if v.present?
    end

    %i[has_rash has_edema ctg_ordered ultrasound_ordered].each do |k|
      v = attrs[k]
      v = attrs[k.to_s] if v.nil?
      next if v.nil?

      h[k.to_s] = true if truthy_flag?(v)
      h[k.to_s] = false if v == false || v.to_s == "false" || v == "0"
    end

    # Legacy draft field
    legacy_skin = attrs[:skin_finding] || attrs["skin_finding"]
    h["skin_finding"] = legacy_skin.to_s if legacy_skin.present?

    pain = attrs[:pain_vas] || attrs["pain_vas"]
    h["pain_vas"] = pain.to_i if pain.present? && pain.to_s.match?(/\A\d+\z/)

    duration = attrs[:contraction_duration_sec] || attrs["contraction_duration_sec"]
    interval = attrs[:contraction_interval_min] || attrs["contraction_interval_min"]
    h["contraction_duration_sec"] = duration.to_i if duration.present? && duration.to_s.match?(/\A\d+\z/)
    h["contraction_interval_min"] = interval.to_i if interval.present? && interval.to_s.match?(/\A\d+\z/)

    dc = attrs[:doctor_called]
    dc = attrs["doctor_called"] if dc.nil?
    h["doctor_called"] = true if dc == true || dc.to_s == "true" || dc == "1"
    h["doctor_called"] = false if dc == false || dc.to_s == "false" || dc == "0"

    h["vitals"] = vitals if vitals.any?
    h
  end

  def normalize_doctor_draft(attrs)
    h = {}
    inv = attrs[:investigations] || attrs["investigations"]
    h["investigations"] = inv.to_h if inv.is_a?(Hash) && inv.present?

    ctg = attrs[:ctg] || attrs["ctg"]
    if ctg.is_a?(Hash)
      ctg_h = {}
      rt = ctg[:result_type] || ctg["result_type"]
      ctg_h["result_type"] = rt.to_s if rt.present?
      bh = ctg[:basal_hr] || ctg["basal_hr"]
      ctg_h["basal_hr"] = bh.to_i if bh.present? && bh.to_s.match?(/\A\d+\z/)
      ct = ctg[:custom_text] || ctg["custom_text"]
      ctg_h["custom_text"] = ct.to_s.strip if ct.present?
      h["ctg"] = ctg_h if ctg_h.any?
    end

    us = attrs[:ultrasound] || attrs["ultrasound"]
    if us.is_a?(Hash)
      us_h = {}
      f = us[:finding] || us["finding"]
      us_h["finding"] = f.to_s if f.present?
      dt = us[:disorders_text] || us["disorders_text"]
      us_h["disorders_text"] = dt.to_s.strip if dt.present?
      h["ultrasound"] = us_h if us_h.any?
    end

    mc = attrs[:medical_conclusion] || attrs["medical_conclusion"]
    h["medical_conclusion"] = mc.to_s.strip if mc.present?
    h
  end

  def deep_merge_draft(existing, incoming)
    result = existing.stringify_keys.dup
    incoming.stringify_keys.each do |key, value|
      if value.is_a?(Hash) && result[key].is_a?(Hash)
        result[key] = result[key].merge(value)
      else
        result[key] = value
      end
    end
    result
  end

  def strip_completion_fields(data)
    data.except(
      "completed_at", "completed_by_user_id", "duration_seconds", "accepted_at"
    )
  end

  def apply_draft_meta(data, user)
    rev = data["draft_revision"].to_i + 1
    data.merge(
      "draft_revision" => rev,
      "draft_updated_at" => Time.current.iso8601,
      "draft_updated_by_user_id" => user&.id,
      "draft_updated_by_name" => user&.full_name.to_s.presence || user&.login.to_s
    )
  end

  def assert_draft_revision!(current, user:, expected_revision:)
    return if expected_revision.nil?

    current_rev = current["draft_revision"].to_i
    expected = expected_revision.to_i
    editor_id = current["draft_updated_by_user_id"]
    return if current_rev <= expected
    return if editor_id.present? && user&.id.present? && editor_id.to_i == user.id.to_i

    raise DraftConflictError.new(
      "Данные уже изменены другим пользователем (#{current['draft_updated_by_name'] || '—'})",
      phase_key: nil,
      phase_data: current,
      draft_revision: current_rev,
      updated_by_name: current["draft_updated_by_name"]
    )
  end

  def broadcast_stage2_triage_draft(patient_id:, phase:, phase_data:)
    ActionCable.server.broadcast(
      "stage2_triage:#{patient_id}",
      {
        type: "draft_updated",
        phase: phase,
        phase_data: phase_data,
        draft_revision: phase_data["draft_revision"],
        draft_updated_at: phase_data["draft_updated_at"],
        draft_updated_by_user_id: phase_data["draft_updated_by_user_id"],
        draft_updated_by_name: phase_data["draft_updated_by_name"]
      }
    )
  rescue StandardError => e
    Rails.logger.warn("[Stage2Triage draft broadcast] #{e.class}: #{e.message}")
  end
end
