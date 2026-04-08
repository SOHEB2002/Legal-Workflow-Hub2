-- Performance optimization: Create database indexes for common query patterns
-- This file is executed automatically at server startup (idempotent - IF NOT EXISTS).

-- ==================== Hearings indexes ====================
CREATE INDEX IF NOT EXISTS idx_hearings_case_id ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_status ON hearings(status);
CREATE INDEX IF NOT EXISTS idx_hearings_hearing_date ON hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_hearings_attending_lawyer_id ON hearings(attending_lawyer_id);

-- ==================== Field tasks indexes ====================
CREATE INDEX IF NOT EXISTS idx_field_tasks_assigned_to ON field_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_field_tasks_case_id ON field_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_field_tasks_status ON field_tasks(status);
CREATE INDEX IF NOT EXISTS idx_field_tasks_due_date ON field_tasks(due_date);

-- ==================== Cases indexes ====================
CREATE INDEX IF NOT EXISTS idx_cases_status ON law_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON law_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_department_id ON law_cases(department_id);
CREATE INDEX IF NOT EXISTS idx_cases_primary_lawyer_id ON law_cases(primary_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_responsible_lawyer_id ON law_cases(responsible_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_current_stage ON law_cases(current_stage);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON law_cases(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_is_archived ON law_cases(is_archived);

-- ==================== Memos indexes ====================
CREATE INDEX IF NOT EXISTS idx_memos_case_id ON memos(case_id);
CREATE INDEX IF NOT EXISTS idx_memos_hearing_id ON memos(hearing_id);
CREATE INDEX IF NOT EXISTS idx_memos_assigned_to ON memos(assigned_to);
CREATE INDEX IF NOT EXISTS idx_memos_status ON memos(status);

-- ==================== Consultations indexes ====================
CREATE INDEX IF NOT EXISTS idx_consultations_client_id ON consultations(client_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_department_id ON consultations(department_id);
CREATE INDEX IF NOT EXISTS idx_consultations_assigned_to ON consultations(assigned_to);

-- ==================== Notifications indexes ====================
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON notifications(related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ==================== Case activity / notes / comments ====================
CREATE INDEX IF NOT EXISTS idx_case_activity_case_id ON case_activity_log(case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_case_id ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_comments_case_id ON case_comments(case_id);

-- ==================== Contact logs indexes ====================
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_case_id ON contact_logs(case_id);
