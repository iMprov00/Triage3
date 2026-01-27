class Triage < ActiveRecord::Base
  belongs_to :patient
  
  validates :patient_id, presence: true
  
  def time_remaining
    return 0 unless timer_active
    elapsed = Time.now - start_time
    remaining = 120 - elapsed.to_i
    remaining > 0 ? remaining : 0
  end
  
  def expired?
    time_remaining <= 0
  end
  
  def complete_triage
    update(
      timer_active: false,
      completed_at: Time.now
    )
  end
end