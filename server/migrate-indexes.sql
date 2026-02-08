-- Performance optimization: Create database indexes for common query patterns

-- ==================== Hearings indexes ====================
CREATE INDEX IF NOT EXISTS idx_hearings_case_id ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_status ON hearings(status);
CREATE INDEX IF NOT EXISTS idx_hearings_hearing_date ON hearings(hearing_date);

-- ==================== Field tasks indexes ====================
CREATE INDEX IF NOT EXISTS idx_field_tasks_assigned_to ON field_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_field_tasks_case_id ON field_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_field_tasks_status ON field_tasks(status);
CREATE INDEX IF NOT EXISTS idx_field_tasks_due_date ON field_tasks(due_date);

-- ==================== Cases indexes ====================
CREATE INDEX IF NOT EXISTS idx_cases_status ON law_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON law_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_department_id ON law_cases(department_id);

-- ==================== Consultations indexes ====================
CREATE INDEX IF NOT EXISTS idx_consultations_client_id ON consultations(client_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

-- ==================== Notifications indexes ====================
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- ==================== Contact logs indexes ====================
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON contact_logs(client_id);
