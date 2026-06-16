-- ============================================================================
-- seed-preview-tasks.sql — FAKE preview data to light up EVERY مهامي task kind.
--
-- DEV ONLY. Run from the Replit Shell against the DEV database:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-preview-tasks.sql
--
-- SAFETY:
--   * Hard guard below ABORTS unless current_database() = 'heliumdb' (the dev
--     DB per CLAUDE.md). It can NEVER run on prod (neondb). Verify first with:
--         SELECT current_database();
--   * Everything runs in ONE transaction — any error rolls back the whole seed
--     (dev stays clean), so a wrong value just aborts harmlessly.
--   * Every row id is prefixed 'SEED_' (and case/contract/consultation numbers
--     'SEED-...') so seed-preview-cleanup.sql removes EXACTLY these rows.
--
-- ASSUMPTIONS (if any is wrong the transaction aborts safely — fix & re-run):
--   * Dev DB name is 'heliumdb'. If SELECT current_database() shows otherwise,
--     tell Claude the real name to update the guard.
--   * Departments '1' (عام) and '2' (تجاري) exist (the app seeds them on boot).
--   * At least one existing active branch_manager exists — the SEED_ users copy
--     its password hash, so you log in to every seeded user with THAT account's
--     password.
-- ============================================================================

BEGIN;

-- ---- HARD DEV-ONLY GUARD -----------------------------------------------------
DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'SEED ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- ---- 1. USERS (password copied from an existing active branch_manager) -------
-- 2 lawyers, a department_head, a branch_manager, an admin_support (with a
-- task_specialties value), + a cases_review_head and a consultations_review_head
-- (needed for the committee review_pending kinds). Depts: عام='1', تجاري='2'.
INSERT INTO users (id, username, password, name, role, department_id, is_active,
                   can_be_assigned_cases, can_be_assigned_consultations,
                   must_change_password, task_specialties)
SELECT v.id, v.username,
       (SELECT password FROM users WHERE role = 'branch_manager' AND is_active = true
        ORDER BY created_at NULLS LAST LIMIT 1),
       v.name, v.role, v.dept, true, true, true, false, v.spec::jsonb
FROM (VALUES
  ('SEED_lawyer1',  'SEED_lawyer1',  'SEED محامٍ ١ (عام)',        'employee',                  '1',        NULL),
  ('SEED_lawyer2',  'SEED_lawyer2',  'SEED محامٍ ٢ (تجاري/مفوَّض)','employee',                 '2',        NULL),
  ('SEED_depthead', 'SEED_depthead', 'SEED رئيس قسم (عام)',        'department_head',           '1',        NULL),
  ('SEED_bm',       'SEED_bm',       'SEED مدير الفرع',            'branch_manager',            NULL,       NULL),
  ('SEED_admin',    'SEED_admin',    'SEED دعم إداري (ترافع)',     'admin_support',             NULL,       '["ترافع"]'),
  ('SEED_caserev',  'SEED_caserev',  'SEED رئيس لجنة القضايا',     'cases_review_head',         '1',        NULL),
  ('SEED_consrev',  'SEED_consrev',  'SEED رئيس لجنة الاستشارات',  'consultations_review_head', '2',        NULL)
) AS v(id, username, name, role, dept, spec);

-- ---- 2. CLIENTS --------------------------------------------------------------
INSERT INTO clients (id, client_type, individual_name, company_name, phone, created_by) VALUES
  ('SEED_client_1', 'فرد',  'SEED عميل ١', NULL,            '0500000001', 'SEED_bm'),
  ('SEED_client_2', 'شركة', NULL,          'SEED شركة ٢',   '0500000002', 'SEED_bm'),
  ('SEED_client_3', 'فرد',  'SEED عميل ٣', NULL,            '0500000003', 'SEED_bm');

-- ---- 3. CASES ----------------------------------------------------------------
-- C1: دراسة + primary=lawyer1  -> case_work; hosts hearings/memo/field/deadline/contact
-- C2: استلام + unassigned      -> case_unassigned (dept_head/branch_manager)
-- C3: مراجعة_داخلية + reviewer=lawyer1 (author=lawyer2) -> case review_pending (internal)
-- C4: إحالة_للجنة_المراجعة      -> case review_pending (committee, cases_review_head)
-- C5: استكمال_البيانات          -> data_completion (admin_support)
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       internal_reviewer_id, priority, case_classification, created_by) VALUES
  ('SEED_case_1','SEED-C1','SEED_client_1','تجاري','استلام','دراسة',                 '1','["SEED_lawyer1"]','SEED_lawyer1',NULL,        NULL,         'عاجل','منظورة_بالمحكمة','SEED_bm'),
  ('SEED_case_2','SEED-C2','SEED_client_1','عام',  'استلام','استلام',                '1','[]',             NULL,          NULL,        NULL,         'متوسط','قيد_الدراسة',    'SEED_bm'),
  ('SEED_case_3','SEED-C3','SEED_client_2','تجاري','لجنة_المراجعة','مراجعة_داخلية',   '1','["SEED_lawyer2"]','SEED_lawyer2',NULL,        'SEED_lawyer1','عالي','منظورة_بالمحكمة','SEED_bm'),
  ('SEED_case_4','SEED-C4','SEED_client_2','تجاري','لجنة_المراجعة','إحالة_للجنة_المراجعة','1','["SEED_lawyer2"]','SEED_lawyer2',NULL,     NULL,         'عالي','منظورة_بالمحكمة','SEED_bm'),
  ('SEED_case_5','SEED-C5','SEED_client_3','عام',  'استكمال_البيانات','استكمال_البيانات','1','[]',         'SEED_lawyer1',NULL,         NULL,         'متوسط','قيد_الدراسة',   'SEED_bm');

-- ---- 4. CONSULTATIONS (dept تجاري='2') ---------------------------------------
-- CN1: مراجعة_داخلية + reviewer=lawyer2 -> review_pending (consultation internal)
-- CN2: لجنة_مراجعة                       -> review_pending (committee, consultations_review_head)
-- CN3: منجزة                             -> consultation_closing (admin_support)
INSERT INTO consultations (id, consultation_number, client_id, consultation_type, current_stage,
                           status, department_id, assigned_to, internal_reviewer_id, question_summary, created_by) VALUES
  ('SEED_cons_1','SEED-CN1','SEED_client_2','مكتوبة','مراجعة_داخلية','active','2','SEED_lawyer1','SEED_lawyer2','SEED سؤال استشارة ١','SEED_bm'),
  ('SEED_cons_2','SEED-CN2','SEED_client_2','مكتوبة','لجنة_مراجعة','active','2','SEED_lawyer1',NULL,          'SEED سؤال استشارة ٢','SEED_bm'),
  ('SEED_cons_3','SEED-CN3','SEED_client_3','مكتوبة','منجزة','active','2','SEED_lawyer1',NULL,                'SEED سؤال استشارة ٣','SEED_bm');

-- ---- 5. CONTRACTS (dept تجاري='2') -------------------------------------------
-- CT1: مراجعة_داخلية + reviewer=lawyer2 -> review_pending (contract internal)
-- CT2: لجنة_مراجعة                       -> review_pending (committee, consultations_review_head)
INSERT INTO contracts (id, contract_number, title, client_id, contract_type, current_stage,
                       status, department_id, assigned_to, internal_reviewer_id, created_by) VALUES
  ('SEED_ct_1','SEED-CT1','SEED عقد ١','SEED_client_2','مراجعة_عقد','مراجعة_داخلية','active','2','SEED_lawyer1','SEED_lawyer2','SEED_bm'),
  ('SEED_ct_2','SEED-CT2','SEED عقد ٢','SEED_client_2','مراجعة_عقد','لجنة_مراجعة','active','2','SEED_lawyer1',NULL,           'SEED_bm');

-- ---- 6. HEARINGS (on SEED_case_1, attending lawyer1) -------------------------
-- H1 قادمة tomorrow      -> hearing_attend + agency_verification
-- H2 قادمة 3 days ago    -> hearing_unrecorded
-- H3 تمت, result, report not done -> hearing_report
-- H4 تمت, report done, not exported -> session_report_export (admin_support)
INSERT INTO hearings (id, case_id, hearing_date, hearing_time, hearing_type, court_name, status,
                      result, report_completed, session_report_exported, attending_lawyer_id) VALUES
  ('SEED_h_1','SEED_case_1', to_char(CURRENT_DATE + 1, 'YYYY-MM-DD'), '10:00','محكمة','SEED محكمة','قادمة', NULL,   false, false, 'SEED_lawyer1'),
  ('SEED_h_2','SEED_case_1', to_char(CURRENT_DATE - 3, 'YYYY-MM-DD'), '10:00','محكمة','SEED محكمة','قادمة', NULL,   false, false, 'SEED_lawyer1'),
  ('SEED_h_3','SEED_case_1', to_char(CURRENT_DATE - 1, 'YYYY-MM-DD'), '10:00','محكمة','SEED محكمة','تمت',   'حكم',  false, false, 'SEED_lawyer1'),
  ('SEED_h_4','SEED_case_1', to_char(CURRENT_DATE - 2, 'YYYY-MM-DD'), '10:00','محكمة','SEED محكمة','تمت',   'حكم',  true,  false, 'SEED_lawyer1');

-- ---- 7. MEMOS (on SEED_case_1) -----------------------------------------------
-- M1 تحرير (DRAFTING) assigned=lawyer1            -> memo_pending
-- M2 مراجعة_داخلية reviewer=lawyer1 (author lawyer2) -> review_pending (memo internal)
-- M3 لجنة_مراجعة                                   -> review_pending (committee memo, cases_review_head)
INSERT INTO memos (id, case_id, memo_type, title, status, current_stage, assigned_to,
                   internal_reviewer_id, created_by, deadline) VALUES
  ('SEED_memo_1','SEED_case_1','مذكرة_جوابية','SEED مذكرة قيد التحرير','قيد_التحرير','تحرير',         'SEED_lawyer1',NULL,         'SEED_bm', to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('SEED_memo_2','SEED_case_1','مذكرة_جوابية','SEED مذكرة بمراجعة داخلية','قيد_المراجعة','مراجعة_داخلية','SEED_lawyer2','SEED_lawyer1','SEED_bm', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('SEED_memo_3','SEED_case_1','مذكرة_جوابية','SEED مذكرة بلجنة المراجعة','قيد_المراجعة','لجنة_مراجعة','SEED_lawyer2',NULL,          'SEED_bm', to_char(CURRENT_DATE + 4,'YYYY-MM-DD'));

-- ---- 8. FIELD TASKS ----------------------------------------------------------
-- FT1 collection (title starts 'إعداد خطاب تحصيل'), overdue, assigned lawyer1 -> collection
-- FT2 generic (تنفيذ/delivery), today, assigned lawyer1                       -> field_task
-- FT3 generic, unassigned ('' pool), upcoming                                 -> field_task (managers' pool)
INSERT INTO field_tasks (id, title, task_type, case_id, assigned_to, assigned_by, status, priority, due_date) VALUES
  ('SEED_ft_1','إعداد خطاب تحصيل — SEED قضية رقم SEED-C1','متابعة_محكمة','SEED_case_1','SEED_lawyer1','SEED_bm','قيد_الانتظار','عاجل',  to_char(CURRENT_DATE - 2,'YYYY-MM-DD')),
  ('SEED_ft_2','SEED تسليم مستندات التنفيذ',               'تسليم_مستندات','SEED_case_1','SEED_lawyer1','SEED_bm','قيد_الانتظار','عالي', to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('SEED_ft_3','SEED مهمة ميدانية غير مُسندة',             'مراجعة_ميدانية',NULL,        '',            'SEED_bm','قيد_الانتظار','متوسط', to_char(CURRENT_DATE + 3,'YYYY-MM-DD'));

-- ---- 9. LEGAL DEADLINE (on SEED_case_1) -> legal_deadline --------------------
INSERT INTO legal_deadlines (id, case_id, deadline_type, title, start_date, duration_days, deadline_date, status) VALUES
  ('SEED_ld_1','SEED_case_1','objection','SEED موعد قانوني — اعتراض', to_char(CURRENT_DATE - 5,'YYYY-MM-DD'), 30, to_char(CURRENT_DATE + 6,'YYYY-MM-DD'), 'نشط');

-- ---- 10. CONTACT LOG (createdBy=lawyer1, follow-up due) -> contact_followup ---
INSERT INTO contact_logs (id, client_id, contact_type, contact_date, next_follow_up_date,
                          follow_up_status, follow_up_required, follow_up_completed, case_id, created_by) VALUES
  ('SEED_cl_1','SEED_client_1','هاتفي', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE,'YYYY-MM-DD'),
   'معلق', true, false, 'SEED_case_1', 'SEED_lawyer1');

-- ---- 11. DELEGATIONS ---------------------------------------------------------
-- DG1: ACTIVE + APPROVED + in-window, lawyer1 -> lawyer2  => when you log in as
--      SEED_lawyer2 you get the "أنت تعمل بالنيابة عن SEED محامٍ ١" banner and
--      lawyer1's tasks tagged "بالنيابة عن".
-- DG2: PENDING (approved_by NULL), lawyer1 (dept '1') -> admin  => the dept '1'
--      department_head (SEED_depthead) sees a delegation_approval task.
INSERT INTO delegations_table (id, from_user_id, to_user_id, reason, start_date, end_date,
                               status, scope, approved_by, approved_at) VALUES
  ('SEED_dg_1','SEED_lawyer1','SEED_lawyer2','إجازة', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE + 10,'YYYY-MM-DD'),
   'نشط','all_cases','SEED_bm', now()),
  ('SEED_dg_2','SEED_lawyer1','SEED_admin',  'إجازة', to_char(CURRENT_DATE,    'YYYY-MM-DD'), to_char(CURRENT_DATE + 10,'YYYY-MM-DD'),
   'نشط','all_cases', NULL, NULL);

COMMIT;

-- Done. Verify counts:  SELECT 'users' t, count(*) FROM users WHERE id LIKE 'SEED\_%'
--   UNION ALL SELECT 'cases', count(*) FROM law_cases WHERE id LIKE 'SEED\_%' ... etc.
