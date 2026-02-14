-- ==================== تنظيف البيانات اليتيمة ====================

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

-- Case Activity Log
DELETE FROM case_activity_log WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Case Notes
DELETE FROM case_notes WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Legal Deadlines
DELETE FROM legal_deadlines WHERE case_id IS NOT NULL AND case_id NOT IN (SELECT id FROM law_cases);

-- Delegations
DELETE FROM delegations_table WHERE from_user_id IS NOT NULL AND from_user_id NOT IN (SELECT id FROM users);
DELETE FROM delegations_table WHERE to_user_id IS NOT NULL AND to_user_id NOT IN (SELECT id FROM users);

-- Support Tickets
DELETE FROM support_tickets WHERE submitted_by IS NOT NULL AND submitted_by NOT IN (SELECT id FROM users);

-- ==================== إضافة Foreign Keys (اللي ما تنفذت) ====================

-- حذف القيود القديمة لو موجودة (تجنب التكرار)
ALTER TABLE law_cases DROP CONSTRAINT IF EXISTS fk_cases_client;
ALTER TABLE law_cases DROP CONSTRAINT IF EXISTS fk_cases_department;
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS fk_consultations_client;
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS fk_consultations_department;
ALTER TABLE hearings DROP CONSTRAINT IF EXISTS fk_hearings_case;
ALTER TABLE field_tasks DROP CONSTRAINT IF EXISTS fk_field_tasks_case;
ALTER TABLE field_tasks DROP CONSTRAINT IF EXISTS fk_field_tasks_consultation;
ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS fk_contact_logs_client;
ALTER TABLE memos DROP CONSTRAINT IF EXISTS fk_memos_case;
ALTER TABLE memos DROP CONSTRAINT IF EXISTS fk_memos_hearing;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_recipient;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_head;
ALTER TABLE case_activity_log DROP CONSTRAINT IF EXISTS fk_case_activity_case;
ALTER TABLE case_notes DROP CONSTRAINT IF EXISTS fk_case_notes_case;
ALTER TABLE legal_deadlines DROP CONSTRAINT IF EXISTS fk_legal_deadlines_case;
ALTER TABLE delegations_table DROP CONSTRAINT IF EXISTS fk_delegations_from_user;
ALTER TABLE delegations_table DROP CONSTRAINT IF EXISTS fk_delegations_to_user;
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS fk_support_tickets_submitted_by;

-- إعادة إنشاء الـ Foreign Keys
ALTER TABLE law_cases ADD CONSTRAINT fk_cases_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE law_cases ADD CONSTRAINT fk_cases_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE consultations ADD CONSTRAINT fk_consultations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE consultations ADD CONSTRAINT fk_consultations_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE hearings ADD CONSTRAINT fk_hearings_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE field_tasks ADD CONSTRAINT fk_field_tasks_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE SET NULL;
ALTER TABLE field_tasks ADD CONSTRAINT fk_field_tasks_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL;
ALTER TABLE contact_logs ADD CONSTRAINT fk_contact_logs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE memos ADD CONSTRAINT fk_memos_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE memos ADD CONSTRAINT fk_memos_hearing FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE departments ADD CONSTRAINT fk_departments_head FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE case_activity_log ADD CONSTRAINT fk_case_activity_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE case_notes ADD CONSTRAINT fk_case_notes_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE legal_deadlines ADD CONSTRAINT fk_legal_deadlines_case FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
ALTER TABLE delegations_table ADD CONSTRAINT fk_delegations_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE delegations_table ADD CONSTRAINT fk_delegations_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE support_tickets ADD CONSTRAINT fk_support_tickets_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
