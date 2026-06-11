# frozen_string_literal: true

class Stage2Triage < ApplicationRecord
  include BroadcastsStage2Realtime

  PHASES = %w[pre_doctor decision doctor action exit].freeze

  PHASE_LABELS = {
    "pre_doctor" => "Доврачебный этап",
    "decision" => "Точка принятия решения",
    "doctor" => "Врачебный этап",
    "action" => "Точка действия",
    "exit" => "Точка выхода"
  }.freeze

  PRIORITIES = %w[pending red yellow orange grey green].freeze
  DECISION_PRIORITIES = Stage2Rules::DECISION_PRIORITIES

  PRE_DOCTOR_DISCHARGE_KEYS = Stage2Rules::DISCHARGE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_FHR_KEYS = Stage2Rules::FETAL_HEART_RATE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_UTERINE_KEYS = Stage2Rules::UTERINE_TONE_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_SKIN_KEYS = Stage2Rules::SKIN_FINDING_OPTIONS.map { |o| o[:key] }.freeze
  PRE_DOCTOR_EDEMA_LOCATION_KEYS = Stage2Rules::EDEMA_LOCATION_OPTIONS.map { |o| o[:key] }.freeze
  INVESTIGATION_KEYS = Stage2Rules::INVESTIGATION_OPTIONS.map { |o| o[:key] }.freeze

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

  def investigations_data
    pre_doctor_data["investigations"] || {}
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
    return "completed" if actions_completed?
    return "actions" if decision_completed? && priority != "pending" && !actions_completed?
    return "decision" if pre_doctor_completed? && !decision_completed?
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
    now = Time.current.iso8601

    merged = phase_data_hash.merge(
      "pre_doctor" => validated.merge(
        "completed_at" => now,
        "completed_by_user_id" => user&.id
      )
    )

    update!(
      phase_data: merged,
      suggested_priority: suggested,
      current_phase: "decision"
    )

    suggested
  end

  def submit_decision!(priority:, note: nil, user: nil)
    raise ArgumentError, "invalid priority" unless DECISION_PRIORITIES.include?(priority.to_s)
    raise ArgumentError, "Сначала завершите доврачебный этап" unless pre_doctor_completed?
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
    self.actions_data ||= {}
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

    final_def = priority_actions.find { |a| a[:final] }
    return true if final_def && final_def[:final_always_available]

    required_actions = priority_actions.reject { |a| a[:final] }
    required_actions.all? { |a| actions_data[a[:key]].present? }
  end

  def complete_actions!
    final_action = priority_actions.find { |a| a[:final] }
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

  private

  def validate_pre_doctor_attrs!(attrs)
    discharge = attrs[:discharge].to_s
    fetal = attrs[:fetal_heart_rate].to_s
    uterine = attrs[:uterine_tone].to_s
    pain = attrs[:pain_vas].to_i
    skin = attrs[:skin_finding].to_s
    edema_location = attrs[:edema_location].to_s.presence
    duration_sec = attrs[:contraction_duration_sec]
    interval_min = attrs[:contraction_interval_min]
    vitals_src = attrs[:vitals].is_a?(Hash) ? attrs[:vitals] : {}
    inv_src = attrs[:investigations].is_a?(Hash) ? attrs[:investigations] : {}

    errors = []
    errors << "Укажите характер выделений" unless PRE_DOCTOR_DISCHARGE_KEYS.include?(discharge)
    errors << "Укажите сердцебиение плода" unless PRE_DOCTOR_FHR_KEYS.include?(fetal)
    errors << "Укажите маточный тонус" unless PRE_DOCTOR_UTERINE_KEYS.include?(uterine)
    errors << "Оцените боль по ВАШ (0–10)" unless pain.between?(0, 10)
    errors << "Укажите осмотр кожных покровов" unless PRE_DOCTOR_SKIN_KEYS.include?(skin)

    if uterine == "labor_regular"
      errors << "Укажите длительность схватки (сек)" unless positive_int?(duration_sec)
      errors << "Укажите интервал между схватками (мин)" unless positive_int?(interval_min)
    elsif uterine == "labor_irregular"
      errors << "Укажите длительность схватки (сек)" unless positive_int?(duration_sec)
    end

    if skin == "edema"
      errors << "Укажите локализацию отёков" unless PRE_DOCTOR_EDEMA_LOCATION_KEYS.include?(edema_location)
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

    raise ArgumentError, errors.join("; ") if errors.any?

    investigations = {}
    INVESTIGATION_KEYS.each do |key|
      raw = inv_src[key] || inv_src[key.to_sym]
      investigations[key] = raw == true || raw.to_s == "true" || raw == "1" || raw == 1
    end

    result = {
      "discharge" => discharge,
      "fetal_heart_rate" => fetal,
      "uterine_tone" => uterine,
      "pain_vas" => pain,
      "skin_finding" => skin,
      "vitals" => vitals,
      "investigations" => investigations
    }

    if uterine == "labor_regular"
      result["contraction_duration_sec"] = duration_sec.to_i
      result["contraction_interval_min"] = interval_min.to_i
    elsif uterine == "labor_irregular"
      result["contraction_duration_sec"] = duration_sec.to_i
    end

    result["edema_location"] = edema_location if skin == "edema"

    result
  end

  def positive_int?(val)
    val.to_s.match?(/\A[1-9]\d*\z/)
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
end
