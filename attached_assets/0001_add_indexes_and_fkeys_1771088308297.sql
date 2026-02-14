-- ==================== تنظيف البيانات اليتيمة قبل إضافة القيود ====================
-- هذه الخطوة تضبط القيم المعلقة إلى NULL حتى لا تتعارض مع الـ Foreign Keys

-- Cases: تنظيف client_id و department_id غير الموجودين
UPDATE law_cases SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
UPDATE law_cases SET department_id = NULL WHERE department_id IS NOT NULL AND department_id NOT IN (SELECT id FROM departments);

-- Consultations: تنظيف client_id و department_id
UPDATE consultations SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
UPDATE consultations SET department_id = NULL WHERE department_id IS NOT NULL AND department_id NOT IN (SELECT id FROM departments);

-- Hearings: حذف الجلسات المرتبطة بقضايا محذوفة
DELETE FROM hearings WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Field Tasks: تنظيف case_id و consultation_id
UPDATE field_tasks SET case_id = NULL WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);
UPDATE field_tasks SET consultation_id = NULL WHERE consultation_id IS NOT NULL AND consultation_id NOT IN (SELECT id FROM consultations);

-- Contact Logs: حذف سجلات التواصل لعملاء محذوفين
DELETE FROM contact_logs WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);

-- Memos: تنظيف
DELETE FROM memos WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);
UPDATE memos SET hearing_id = NULL WHERE hearing_id IS NOT NULL AND hearing_id NOT IN (SELECT id FROM hearings);

-- Notifications: حذف إشعارات لمستخدمين محذوفين
DELETE FROM notifications WHERE recipient_id IS NOT NULL AND recipient_id NOT IN (SELECT id FROM users);

-- Departments: تنظيف head_id
UPDATE departments SET head_id = NULL WHERE head_id IS NOT NULL AND head_id NOT IN (SELECT id FROM users);

-- Case Activity Log: حذف سجلات لقضايا محذوفة
DELETE FROM case_activity_log WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Case Notes: حذف ملاحظات لقضايا محذوفة
DELETE FROM case_notes WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Legal Deadlines: حذف مواعيد لقضايا محذوفة
DELETE FROM legal_deadlines WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Delegations: حذف تفويضات لمستخدمين محذوفين
DELETE FROM delegations_table WHERE from_user_id IS NOT NULL AND from_user_id NOT IN (SELECT id FROM users);
DELETE FROM delegations_table WHERE to_user_id IS NOT NULL AND to_user_id NOT IN (SELECT id FROM users);

-- Support Tickets: حذف تذاكر لمستخدمين محذوفين
DELETE FROM support_tickets WHERE submitted_by IS NOT NULL AND submitted_by NOT IN (SELECT id FROM users);

-- ==================== Foreign Key Constraints ====================

-- Cases → Clients
ALTER TABLE law_cases ADD CONSTRAINT fk_cases_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE law_cases ADD CONSTRAINT fk_cases_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

-- Consultations → Clients, Departments
ALTER TABLE consultations ADD CONSTRAINT fk_consultations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE consultations ADD CONSTRAINT fk_consultations_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

-- Hearings → Cases
ALTER TABLE hearings ADD CONSTRAINT fk_hearings_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;

-- Field Tasks → Cases, Consultations
ALTER TABLE field_tasks ADD CONSTRAINT fk_field_tasks_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE SET NULL;
ALTER TABLE field_tasks ADD CONSTRAINT fk_field_tasks_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;

-- Contact Logs → Clients
ALTER TABLE contact_logs ADD CONSTRAINT fk_contact_logs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Memos → Cases, Hearings
ALTER TABLE memos ADD CONSTRAINT fk_memos_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE memos ADD CONSTRAINT fk_memos_hearing FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE SET NULL;

-- Notifications → Users (recipient)
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

-- Departments → Users (head)
ALTER TABLE departments ADD CONSTRAINT fk_departments_head FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;

-- Attachments → entityType/entityId are polymorphic, so no FK constraint

-- Case Activity Log → Cases
ALTER TABLE case_activity_log ADD CONSTRAINT fk_case_activity_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;

-- Case Notes → Cases
ALTER TABLE case_notes ADD CONSTRAINT fk_case_notes_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;

-- Legal Deadlines → Cases
ALTER TABLE legal_deadlines ADD CONSTRAINT fk_legal_deadlines_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;

-- Delegations → Users
ALTER TABLE delegations_table ADD CONSTRAINT fk_delegations_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE delegations_table ADD CONSTRAINT fk_delegations_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Support Tickets → Users
ALTER TABLE support_tickets ADD CONSTRAINT fk_support_tickets_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;

-- ==================== Database Indexes ====================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Cases
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON law_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_department_id ON law_cases(department_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON law_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_current_stage ON law_cases(current_stage);
CREATE INDEX IF NOT EXISTS idx_cases_primary_lawyer ON law_cases(primary_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_is_archived ON law_cases(is_archived);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON law_cases(created_at);

-- Consultations
CREATE INDEX IF NOT EXISTS idx_consultations_client_id ON consultations(client_id);
CREATE INDEX IF NOT EXISTS idx_consultations_department_id ON consultations(department_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_assigned_to ON consultations(assigned_to);

-- Hearings
CREATE INDEX IF NOT EXISTS idx_hearings_case_id ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_hearing_date ON hearings(hearing_date);
CREATE INDEX IF NOT EXISTS idx_hearings_status ON hearings(status);

-- Field Tasks
CREATE INDEX IF NOT EXISTS idx_field_tasks_case_id ON field_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_field_tasks_assigned_to ON field_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_field_tasks_status ON field_tasks(status);

-- Contact Logs
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_created_by ON contact_logs(created_by);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Memos
CREATE INDEX IF NOT EXISTS idx_memos_case_id ON memos(case_id);
CREATE INDEX IF NOT EXISTS idx_memos_hearing_id ON memos(hearing_id);
CREATE INDEX IF NOT EXISTS idx_memos_assigned_to ON memos(assigned_to);
CREATE INDEX IF NOT EXISTS idx_memos_status ON memos(status);

-- Case Activity Log
CREATE INDEX IF NOT EXISTS idx_case_activity_case_id ON case_activity_log(case_id);
CREATE INDEX IF NOT EXISTS idx_case_activity_user_id ON case_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_case_activity_created_at ON case_activity_log(created_at);

-- Case Notes
CREATE INDEX IF NOT EXISTS idx_case_notes_case_id ON case_notes(case_id);

-- Legal Deadlines
CREATE INDEX IF NOT EXISTS idx_legal_deadlines_case_id ON legal_deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_deadlines_status ON legal_deadlines(status);

-- Delegations
CREATE INDEX IF NOT EXISTS idx_delegations_from_user ON delegations_table(from_user_id);
CREATE INDEX IF NOT EXISTS idx_delegations_to_user ON delegations_table(to_user_id);
CREATE INDEX IF NOT EXISTS idx_delegations_status ON delegations_table(status);

-- Support Tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_submitted_by ON support_tickets(submitted_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- Attachments
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
