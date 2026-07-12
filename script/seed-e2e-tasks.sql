-- ============================================================================
-- seed-e2e-tasks.sql — LARGE end-to-end DEV dataset that lights up EVERY task
-- kind across مهامي (my-tasks), including the newest admin_support flows
-- (data_completion ×4, execution, agency verify + GROUPING, agency issuance,
-- contract_send) and every review path (internal-review + committee) for all
-- four reviewable entities (cases / consultations / contracts / memos).
--
-- RE-RUNNABLE. Run from the Replit Shell against the DEV database ONLY:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-e2e-tasks.sql
--
-- KEEPS (never touched): the 14 users, `departments`, and
-- `admin_support_task_assignments` (the manager's assignee choices). Every other
-- business table is wiped and regenerated. One transaction — any error rolls the
-- whole thing back. Hard dev guard aborts unless current_database()='heliumdb'.
--
-- PREREQUISITE: the 14 users must already exist (manager id='1' + the 13 T_u_*
-- users: ahmed, khaled, sara, fahd, maha [employees]; noura, yousef [dept_heads];
-- abdullah [cases_review_head]; hessa [consultations_review_head]; turki, reem,
-- majed, layla [admin_support]). This script references them by id.
--
-- ALL ids below are prefixed 'T_' (synthetic). All Arabic names are fake.
-- ============================================================================

BEGIN;

-- ---- 0. DEV GUARD ----------------------------------------------------------
DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'SEED ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- ---- 1. WIPE business data (KEEP users / departments / admin_support_task_assignments)
-- FK-safe order: every referencing row before the rows it points at. Users,
-- departments, and admin_support_task_assignments are intentionally NOT deleted.
DELETE FROM support_tickets;
DELETE FROM saved_filters;
DELETE FROM user_section_views;
DELETE FROM notifications;
DELETE FROM attachments;

DELETE FROM field_tasks;
DELETE FROM contact_logs;
DELETE FROM legal_deadlines;

DELETE FROM memo_note_outcomes;
DELETE FROM memo_committee_decisions;
DELETE FROM memo_reviews;
DELETE FROM memo_activity_log;
DELETE FROM memos;

DELETE FROM hearings;

DELETE FROM contract_activity_log;
DELETE FROM contract_attachments;
DELETE FROM contracts;

DELETE FROM consultation_activity_log;
DELETE FROM consultation_delivery_extensions;
DELETE FROM consultation_note_outcomes;
DELETE FROM consultation_committee_decisions;
DELETE FROM consultation_reviews;
DELETE FROM consultation_drafts;
DELETE FROM consultation_studies;
DELETE FROM consultations;

DELETE FROM case_comments;
DELETE FROM case_notes;
DELETE FROM case_activity_log;
DELETE FROM law_cases;

DELETE FROM clients;

DELETE FROM delegations_table;

-- ---- 2. CLIENTS (realistic fake names; mix فرد/شركة) -------------------------
-- T_cl_1 (محمد العنزي) is the GROUPING client: it owns cases 17 & 18, both under
-- lawyer أحمد, both with a hearing +2 days → ONE combined agency-verify task.
INSERT INTO clients (id, client_type, individual_name, company_name, phone, created_by) VALUES
  ('T_cl_1', 'فرد',  'محمد العنزي',       NULL,                    '0551000001','1'),
  ('T_cl_2', 'شركة', NULL,                'مؤسسة البناء الحديث',    '0551000002','1'),
  ('T_cl_3', 'فرد',  'عبدالعزيز المطيري', NULL,                    '0551000003','1'),
  ('T_cl_4', 'شركة', NULL,                'شركة الأفق التجارية',    '0551000004','1'),
  ('T_cl_5', 'فرد',  'منى السهلي',        NULL,                    '0551000005','1'),
  ('T_cl_6', 'فرد',  'سلطان الرشيد',      NULL,                    '0551000006','1'),
  ('T_cl_7', 'شركة', NULL,                'مجموعة النخبة',          '0551000007','1'),
  ('T_cl_8', 'فرد',  'هند البقمي',        NULL,                    '0551000008','1'),
  ('T_cl_9', 'فرد',  'بدر الحارثي',       NULL,                    '0551000009','1'),
  ('T_cl_10','شركة', NULL,                'شركة المدى للمقاولات',   '0551000010','1'),
  ('T_cl_11','فرد',  'ريما الخالدي',      NULL,                    '0551000011','1'),
  ('T_cl_12','فرد',  'ناصر الدوسري',      NULL,                    '0551000012','1'),
  ('T_cl_13','شركة', NULL,                'شركة الواحة الطبية',     '0551000013','1'),
  ('T_cl_14','فرد',  'أمل الشمري',        NULL,                    '0551000014','1'),
  ('T_cl_15','فرد',  'خالد المطرفي',      NULL,                    '0551000015','1');

-- ---- 3. CASES (~20) — status = CaseStatus, current_stage = CaseStage ---------
-- employees: ahmed/khaled/sara = dept 1 ; fahd/maha = dept 2.
--   case_work (lawyer at a work stage): 1,2,3,4,5,14
--   case_unassigned (no lawyer, dept pool → dept_head): 6 (dept1), 7 (dept2)
--   internal-review (→ designated reviewer): 8 (أحمد), 9 (فهد)
--   committee (→ cases_review_head عبدالله): 10, 11
--   data_completion_case (→ admin_support): 12 (dept1), 13 (dept2)
--   judgment host → collection + execution field tasks: 15 (تحصيل), 16 (منظورة)
--   agency GROUPING (client T_cl_1 + lawyer أحمد + hearings +2): 17, 18
--   agency single (client T_cl_5 + lawyer سارة): 19
--   صلح-style collection-only + legal deadline: 20
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       internal_reviewer_id, priority, case_classification, created_by) VALUES
  ('T_case_1', 'T-1001','T_cl_1', 'تجاري','دراسة','دراسة',                        '1','["T_u_ahmed"]', 'T_u_ahmed', 'T_u_ahmed', NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_2', 'T-1002','T_cl_2', 'تجاري','تحرير_المذكرة','تحرير_صحيفة_الدعوى',    '1','["T_u_khaled"]','T_u_khaled','T_u_khaled',NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_3', 'T-1003','T_cl_3', 'عام',  'تعديلات','الأخذ_بالملاحظات',            '1','["T_u_sara"]',  'T_u_sara',  'T_u_sara',  NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_4', 'T-1004','T_cl_4', 'تجاري','دراسة','دراسة',                        '2','["T_u_fahd"]',  'T_u_fahd',  'T_u_fahd',  NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_5', 'T-1005','T_cl_5', 'عام',  'تحرير_المذكرة','تحرير_مذكرة_جوابية',    '1','["T_u_sara"]',  'T_u_sara',  'T_u_sara',  NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_6', 'T-1006','T_cl_6', 'عام',  'استلام','استلام',                      '1','[]',            NULL,        NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_7', 'T-1007','T_cl_7', 'تجاري','استلام','استلام',                      '2','[]',            NULL,        NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_8', 'T-1008','T_cl_8', 'عام',  'لجنة_المراجعة','مراجعة_داخلية',         '1','["T_u_khaled"]','T_u_khaled','T_u_khaled','T_u_ahmed', 'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_9', 'T-1009','T_cl_9', 'تجاري','لجنة_المراجعة','مراجعة_داخلية',         '2','["T_u_maha"]',  'T_u_maha',  'T_u_maha',  'T_u_fahd',  'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_10','T-1010','T_cl_10','عام',  'لجنة_المراجعة','إحالة_للجنة_المراجعة',   '1','["T_u_khaled"]','T_u_khaled','T_u_khaled',NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_11','T-1011','T_cl_11','تجاري','لجنة_المراجعة','إحالة_للجنة_المراجعة',   '2','["T_u_maha"]',  'T_u_maha',  'T_u_maha',  NULL,        'متوسط','منظورة_بالمحكمة','1'),
  ('T_case_12','T-1012','T_cl_2', 'عام',  'استكمال_البيانات','استكمال_البيانات',   '1','[]',            'T_u_ahmed', NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_13','T-1013','T_cl_3', 'تجاري','استكمال_البيانات','استكمال_البيانات',   '2','[]',            'T_u_fahd',  NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_14','T-1014','T_cl_4', 'عام',  'دراسة','دراسة',                        '1','["T_u_sara"]',  'T_u_sara',  'T_u_sara',  NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_15','T-1015','T_cl_12','تجاري','مرفوع','تحصيل',                        '1','["T_u_ahmed"]', 'T_u_ahmed', 'T_u_ahmed', NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_16','T-1016','T_cl_6', 'تجاري','مرفوع','منظورة',                        '2','["T_u_fahd"]',  'T_u_fahd',  'T_u_fahd',  NULL,        'متوسط','منظورة_بالمحكمة','1'),
  ('T_case_17','T-1017','T_cl_1', 'تجاري','دراسة','دراسة',                        '1','["T_u_ahmed"]', 'T_u_ahmed', 'T_u_ahmed', NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_18','T-1018','T_cl_1', 'عام',  'دراسة','دراسة',                        '1','["T_u_ahmed"]', 'T_u_ahmed', 'T_u_ahmed', NULL,        'متوسط','منظورة_بالمحكمة','1'),
  ('T_case_19','T-1019','T_cl_5', 'عام',  'دراسة','دراسة',                        '1','["T_u_sara"]',  'T_u_sara',  'T_u_sara',  NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_20','T-1020','T_cl_13','تجاري','مرفوع','تحصيل',                        '2','["T_u_fahd"]',  'T_u_fahd',  'T_u_fahd',  NULL,        'عاجل', 'منظورة_بالمحكمة','1');

-- ---- 4. CONSULTATIONS (~12) — dept 1/2, type مكتوبة ------------------------
--   internal-review (→ reviewer): 1 (مها), 5 (أحمد), 9 (مها)
--   committee (→ consultations_review_head حصة): 2, 10
--   consultation_closing (→ admin_support): 3 (منجزة), 4 (جاهزة_للإرسال), 11, 12
--   data_completion_consultation (→ admin_support): 6
INSERT INTO consultations (id, consultation_number, client_id, consultation_type, current_stage,
                           status, department_id, assigned_to, internal_reviewer_id, question_summary, created_by) VALUES
  ('T_cons_1', 'T-CN-1', 'T_cl_7', 'مكتوبة','مراجعة_داخلية',           'active','2','T_u_fahd',  'T_u_maha', 'استشارة حول عقد توريد',                '1'),
  ('T_cons_2', 'T-CN-2', 'T_cl_8', 'مكتوبة','لجنة_مراجعة',             'active','2','T_u_fahd',  NULL,       'استشارة عمالية حول مكافأة نهاية الخدمة','1'),
  ('T_cons_3', 'T-CN-3', 'T_cl_9', 'مكتوبة','منجزة',                   'active','2','T_u_maha',  NULL,       'استشارة عقارية',                        '1'),
  ('T_cons_4', 'T-CN-4', 'T_cl_10','مكتوبة','جاهزة_للإرسال',            'active','2','T_u_maha',  NULL,       'استشارة تجارية حول شراكة',              '1'),
  ('T_cons_5', 'T-CN-5', 'T_cl_11','مكتوبة','مراجعة_داخلية',           'active','1','T_u_khaled','T_u_ahmed','استشارة حول نزاع إيجار',                '1'),
  ('T_cons_6', 'T-CN-6', 'T_cl_12','مكتوبة','استكمال_المرفقات_والبيانات','active','1','T_u_sara', NULL,      'استشارة بحاجة لاستكمال مرفقات',         '1'),
  ('T_cons_7', 'T-CN-7', 'T_cl_1', 'مكتوبة','دراسة',                   'active','1','T_u_ahmed', NULL,       'استشارة حول تأسيس شركة',               '1'),
  ('T_cons_8', 'T-CN-8', 'T_cl_3', 'مكتوبة','تحرير',                   'active','1','T_u_sara',  NULL,       'استشارة حول عقد عمل',                  '1'),
  ('T_cons_9', 'T-CN-9', 'T_cl_4', 'مكتوبة','مراجعة_داخلية',           'active','2','T_u_fahd',  'T_u_maha', 'استشارة حول نزاع تجاري',                '1'),
  ('T_cons_10','T-CN-10','T_cl_14','مكتوبة','لجنة_مراجعة',             'active','1','T_u_khaled', NULL,       'استشارة حول وصية',                     '1'),
  ('T_cons_11','T-CN-11','T_cl_5', 'مكتوبة','منجزة',                   'active','1','T_u_ahmed',  NULL,       'استشارة حول تظلم إداري',               '1'),
  ('T_cons_12','T-CN-12','T_cl_15','مكتوبة','جاهزة_للإرسال',            'active','2','T_u_maha',  NULL,       'استشارة حول عقد امتياز',               '1');

-- ---- 5. CONTRACTS (~10) — dept 1/2 -----------------------------------------
--   internal-review (→ reviewer): 1 (مها), 3 (أحمد), 8 (مها)
--   committee (→ consultations_review_head حصة): 2, 9
--   data_completion_contract (→ admin_support): 4
--   contract_send (→ admin_support; جاهزة_للإرسال → مغلقة): 5, 6, 10
INSERT INTO contracts (id, contract_number, title, client_id, contract_type, current_stage,
                       status, department_id, assigned_to, internal_reviewer_id, created_by) VALUES
  ('T_ct_1', 'T-CT-1', 'عقد توريد مواد',       'T_cl_2', 'مراجعة_عقد','مراجعة_داخلية',            'active','2','T_u_fahd',  'T_u_maha', '1'),
  ('T_ct_2', 'T-CT-2', 'عقد شراكة',            'T_cl_4', 'مراجعة_عقد','لجنة_مراجعة',              'active','2','T_u_fahd',  NULL,       '1'),
  ('T_ct_3', 'T-CT-3', 'عقد إيجار تجاري',      'T_cl_7', 'صياغة_عقد','مراجعة_داخلية',             'active','1','T_u_khaled','T_u_ahmed','1'),
  ('T_ct_4', 'T-CT-4', 'عقد خدمات استشارية',   'T_cl_9', 'مراجعة_عقد','استكمال_البيانات_والمرفقات','active','1','T_u_sara', NULL,       '1'),
  ('T_ct_5', 'T-CT-5', 'عقد بيع عقار',         'T_cl_10','صياغة_عقد','جاهزة_للإرسال',              'active','2','T_u_maha',  NULL,       '1'),
  ('T_ct_6', 'T-CT-6', 'عقد امتياز تجاري',     'T_cl_13','مشروع','جاهزة_للإرسال',                  'active','1','T_u_ahmed', NULL,       '1'),
  ('T_ct_7', 'T-CT-7', 'عقد عمل',              'T_cl_3', 'صياغة_عقد','تحرير',                     'active','1','T_u_khaled', NULL,       '1'),
  ('T_ct_8', 'T-CT-8', 'عقد مقاولة',           'T_cl_1', 'مراجعة_عقد','مراجعة_داخلية',            'active','2','T_u_fahd',  'T_u_maha', '1'),
  ('T_ct_9', 'T-CT-9', 'عقد توزيع',            'T_cl_14','مراجعة_عقد','لجنة_مراجعة',              'active','2','T_u_maha',  NULL,       '1'),
  ('T_ct_10','T-CT-10','عقد ترخيص علامة',      'T_cl_15','صياغة_عقد','جاهزة_للإرسال',              'active','1','T_u_sara',  NULL,       '1');

-- ---- 6. HEARINGS (~13) — attend / agency (+ grouping) / unrecorded / report / export
--   AGENCY GROUP (client محمد العنزي T_cl_1 + lawyer أحمد, both +2): h_g1 (case17) + h_g2 (case18)
--   AGENCY single (client منى T_cl_5 + lawyer سارة, +2): h_g3 (case19)
--   attend upcoming: h_a1 (+1 أحمد), h_a2 (+5 خالد)
--   unrecorded (past + قادمة): h_u1 (-3 فهد), h_u2 (-5 سارة)
--   hearing_report (result, report NOT done): h_r1 (أحمد), h_r2 (سارة)
--   session_report_export (report done, NOT exported): h_e1 (فهد case16), h_e2 (أحمد case1)
INSERT INTO hearings (id, case_id, hearing_date, hearing_time, hearing_type, court_name, status,
                      result, report_completed, session_report_exported, attending_lawyer_id) VALUES
  ('T_h_g1','T_case_17',to_char(CURRENT_DATE + 2,'YYYY-MM-DD'),'09:30','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_ahmed'),
  ('T_h_g2','T_case_18',to_char(CURRENT_DATE + 2,'YYYY-MM-DD'),'11:00','محكمة','المحكمة العامة',  'قادمة', NULL,  false,false,'T_u_ahmed'),
  ('T_h_g3','T_case_19',to_char(CURRENT_DATE + 2,'YYYY-MM-DD'),'10:00','محكمة','المحكمة العامة',  'قادمة', NULL,  false,false,'T_u_sara'),
  ('T_h_a1','T_case_1', to_char(CURRENT_DATE + 1,'YYYY-MM-DD'),'09:30','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_ahmed'),
  ('T_h_a2','T_case_2', to_char(CURRENT_DATE + 5,'YYYY-MM-DD'),'11:00','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_khaled'),
  ('T_h_u1','T_case_4', to_char(CURRENT_DATE - 3,'YYYY-MM-DD'),'12:00','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_fahd'),
  ('T_h_u2','T_case_5', to_char(CURRENT_DATE - 5,'YYYY-MM-DD'),'09:00','محكمة','المحكمة العامة',  'قادمة', NULL,  false,false,'T_u_sara'),
  ('T_h_r1','T_case_1', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'),'09:30','محكمة','المحكمة التجارية','تمت',   'حكم', false,false,'T_u_ahmed'),
  ('T_h_r2','T_case_3', to_char(CURRENT_DATE - 2,'YYYY-MM-DD'),'10:00','محكمة','المحكمة العامة',  'تمت',   'حكم', false,false,'T_u_sara'),
  ('T_h_e1','T_case_16',to_char(CURRENT_DATE - 2,'YYYY-MM-DD'),'10:30','محكمة','المحكمة التجارية','تمت',   'حكم', true, false,'T_u_fahd'),
  ('T_h_e2','T_case_1', to_char(CURRENT_DATE - 4,'YYYY-MM-DD'),'09:00','محكمة','المحكمة التجارية','تمت',   'حكم', true, false,'T_u_ahmed'),
  ('T_h_x1','T_case_15',to_char(CURRENT_DATE - 6,'YYYY-MM-DD'),'09:00','محكمة','المحكمة التجارية','تمت',   'حكم', true, true, 'T_u_ahmed'),
  ('T_h_x2','T_case_2', to_char(CURRENT_DATE + 8,'YYYY-MM-DD'),'12:30','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_khaled');

-- ---- 7. MEMOS (~10) — all case-children ------------------------------------
--   memo_pending (assigned, drafting): 1, 6, 10
--   internal-review (→ reviewer): 4 (أحمد), 8 (فهد)
--   committee (→ cases_review_head عبدالله): 5, 9
--   data_completion_memo (button latch → admin_support): 7 (awaiting_completion=true)
INSERT INTO memos (id, case_id, memo_type, title, status, current_stage, assigned_to,
                   internal_reviewer_id, awaiting_completion, created_by, deadline) VALUES
  ('T_memo_1', 'T_case_1', 'مذكرة_جوابية','مذكرة جوابية — قضية T-1001','قيد_التحرير','تحرير',        'T_u_ahmed', NULL,        false,'1', to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('T_memo_2', 'T_case_2', 'تحرير_دعوى', 'صحيفة دعوى — قضية T-1002','معتمدة','جاهزة_للرفع',           'T_u_khaled',NULL,        false,'1', to_char(CURRENT_DATE + 4,'YYYY-MM-DD')),
  ('T_memo_3', 'T_case_3', 'مذكرة_جوابية','مذكرة — أخذ بالملاحظات T-1003','قيد_المراجعة','الأخذ_بالملاحظات','T_u_sara',NULL,   false,'1', to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_memo_4', 'T_case_2', 'مذكرة_جوابية','مذكرة بمراجعة داخلية — T-1002','قيد_المراجعة','مراجعة_داخلية','T_u_khaled','T_u_ahmed',false,'1', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_memo_5', 'T_case_2', 'مذكرة_جوابية','مذكرة بلجنة المراجعة — T-1002','قيد_المراجعة','لجنة_مراجعة','T_u_khaled',NULL,      false,'1', to_char(CURRENT_DATE + 5,'YYYY-MM-DD')),
  ('T_memo_6', 'T_case_14','مذكرة_جوابية','مذكرة قيد التحرير — T-1014','قيد_التحرير','تحرير',          'T_u_sara',  NULL,        false,'1', to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_memo_7', 'T_case_1', 'مذكرة_جوابية','مذكرة بانتظار استكمال — T-1001','قيد_التحرير','تحرير',      'T_u_ahmed', NULL,        true, '1', to_char(CURRENT_DATE + 6,'YYYY-MM-DD')),
  ('T_memo_8', 'T_case_9', 'لائحة_اعتراضية','لائحة اعتراضية — T-1009','قيد_المراجعة','مراجعة_داخلية',  'T_u_maha',  'T_u_fahd',  false,'1', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_memo_9', 'T_case_9', 'مذكرة_جوابية','مذكرة بلجنة المراجعة — T-1009','قيد_المراجعة','لجنة_مراجعة','T_u_maha',  NULL,        false,'1', to_char(CURRENT_DATE + 5,'YYYY-MM-DD')),
  ('T_memo_10','T_case_5', 'مذكرة_جوابية','مذكرة قيد التحرير — T-1005','قيد_التحرير','تحرير',          'T_u_sara',  NULL,        false,'1', to_char(CURRENT_DATE + 1,'YYYY-MM-DD'));

-- ---- 8. FIELD TASKS --------------------------------------------------------
-- collection / execution / agency-issuance route LIVE via the KEPT
-- admin_support_task_assignments mapping (assigned_to is ignored for feed
-- ownership → set ''); whoever the manager mapped to each type sees them, else
-- the branch_manager's unassigned pool.
--   collection ("إعداد خطاب تحصيل%"): cases 15, 16, 20
--   execution ("رفع طلب تنفيذ%"):      cases 15, 16
--   agency issuance ("إصدار وكالة%"):  case 9
--   generic field task (assigned):     khaled
--   generic unassigned (manager pool): ""
--   general path-1 (person-direct):    assigned to khaled by ahmed
--   general path-2 (dept-routed):      routed to dept 1 → noura distributes
INSERT INTO field_tasks (id, title, task_type, case_id, assigned_to, assigned_by, status, priority,
                         routed_department_id, original_requester_id, due_date) VALUES
  ('T_ft_col1','إعداد خطاب تحصيل — قضية رقم T-1015','متابعة_محكمة','T_case_15','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE - 2,'YYYY-MM-DD')),
  ('T_ft_col2','إعداد خطاب تحصيل — قضية رقم T-1016','متابعة_محكمة','T_case_16','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_ft_col3','إعداد خطاب تحصيل — قضية رقم T-1020','متابعة_محكمة','T_case_20','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_ft_ex1', 'رفع طلب تنفيذ — قضية رقم T-1015','متابعة_محكمة','T_case_15','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE - 2,'YYYY-MM-DD')),
  ('T_ft_ex2', 'رفع طلب تنفيذ — قضية رقم T-1016','متابعة_محكمة','T_case_16','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_ft_ag1', 'إصدار وكالة — قضية رقم T-1009','متابعة_محكمة','T_case_9','','1','قيد_الانتظار','عاجل', NULL, NULL, to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('T_ft_gen1','تسليم مستندات للعميل','تسليم_مستندات','T_case_2','T_u_khaled','1','قيد_الانتظار','متوسط', NULL, NULL, to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_ft_gen2','زيارة موقع العميل','زيارة_عميل','T_case_3','T_u_sara','1','قيد_الانتظار','عالي', NULL, NULL, to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_ft_un1', 'مهمة ميدانية غير مُسندة','مراجعة_ميدانية',NULL,'','1','قيد_الانتظار','متوسط', NULL, NULL, to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('T_ft_g1p1','مهمة عامة — إعداد تقرير مالي','عام','T_case_1','T_u_khaled','T_u_ahmed','قيد_الانتظار','متوسط', NULL, 'T_u_ahmed', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_ft_g2p2','مهمة عامة موجهة لقسم — مراجعة أرشيف','عام',NULL,'','T_u_ahmed','بانتظار_التوزيع','متوسط', '1', 'T_u_ahmed', to_char(CURRENT_DATE + 4,'YYYY-MM-DD'));

-- ---- 9. LEGAL DEADLINES (نشط; some overdue → legal_deadline task) -----------
INSERT INTO legal_deadlines (id, case_id, deadline_type, title, start_date, duration_days, deadline_date, status) VALUES
  ('T_ld_1','T_case_1', 'objection', 'مهلة اعتراض على الحكم', to_char(CURRENT_DATE - 5,'YYYY-MM-DD'), 30, to_char(CURRENT_DATE + 6,'YYYY-MM-DD'), 'نشط'),
  ('T_ld_2','T_case_3', 'submission','موعد تقديم مذكرة',      to_char(CURRENT_DATE - 10,'YYYY-MM-DD'),7,  to_char(CURRENT_DATE - 2,'YYYY-MM-DD'), 'نشط'),
  ('T_ld_3','T_case_2', 'objection', 'مهلة استئناف',          to_char(CURRENT_DATE - 3,'YYYY-MM-DD'), 30, to_char(CURRENT_DATE + 10,'YYYY-MM-DD'),'نشط'),
  ('T_ld_4','T_case_20','submission','موعد رد على المحكمة',   to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), 5,  to_char(CURRENT_DATE,    'YYYY-MM-DD'), 'نشط');

-- ---- 10. CONTACT LOGS (follow-up required → contact_followup task) ----------
INSERT INTO contact_logs (id, client_id, contact_type, contact_date, next_follow_up_date,
                          follow_up_status, follow_up_required, follow_up_completed, case_id, created_by) VALUES
  ('T_co_1','T_cl_1','هاتفي', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE,    'YYYY-MM-DD'),'معلق',true,false,'T_case_1', 'T_u_ahmed'),
  ('T_co_2','T_cl_3','هاتفي', to_char(CURRENT_DATE - 4,'YYYY-MM-DD'), to_char(CURRENT_DATE - 1,'YYYY-MM-DD'),'معلق',true,false,'T_case_3', 'T_u_sara'),
  ('T_co_3','T_cl_2','زيارة', to_char(CURRENT_DATE - 2,'YYYY-MM-DD'), to_char(CURRENT_DATE + 3,'YYYY-MM-DD'),'معلق',true,false,'T_case_2', 'T_u_khaled');

-- ---- 11. DELEGATIONS -------------------------------------------------------
--   T_dg_1: ACTIVE + APPROVED (سارة → مها) — logging in as مها shows
--           "بالنيابة عن سارة الدوسري" + inherits سارة's task set.
--   T_dg_2: PENDING (approved_by NULL, أحمد dept عام → تركي) — the عام
--           department_head (نورة) sees a delegation_approval task.
INSERT INTO delegations_table (id, from_user_id, to_user_id, reason, start_date, end_date,
                               status, scope, approved_by, approved_at) VALUES
  ('T_dg_1','T_u_sara','T_u_maha','إجازة',   to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE + 14,'YYYY-MM-DD'),'نشط','all_cases','1', now()),
  ('T_dg_2','T_u_ahmed','T_u_turki','مهمة عمل',to_char(CURRENT_DATE,   'YYYY-MM-DD'), to_char(CURRENT_DATE + 14,'YYYY-MM-DD'),'نشط','all_cases',NULL, NULL);

COMMIT;

-- ============================================================================
-- Verify (optional):
--   SELECT (SELECT count(*) FROM users)        AS users,        -- expect 14 (unchanged)
--          (SELECT count(*) FROM departments)  AS departments,  -- unchanged (kept)
--          (SELECT count(*) FROM admin_support_task_assignments) AS assignments, -- unchanged
--          (SELECT count(*) FROM law_cases)    AS cases,        -- expect 20
--          (SELECT count(*) FROM consultations)AS consultations,-- expect 12
--          (SELECT count(*) FROM contracts)    AS contracts,    -- expect 10
--          (SELECT count(*) FROM memos)        AS memos,        -- expect 10
--          (SELECT count(*) FROM hearings)     AS hearings,     -- expect 13
--          (SELECT count(*) FROM field_tasks)  AS field_tasks;  -- expect 11
-- ============================================================================
