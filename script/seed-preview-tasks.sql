-- ============================================================================
-- seed-preview-tasks.sql — LARGE, realistic DEV preview dataset that lights up
-- EVERY مهامي task kind (multiple of each, spread dates) and exercises the
-- admin_support specialty (task_specialties) routing.
--
-- Run AFTER seed-preview-wipe.sql, from the Replit Shell, DEV ONLY:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-preview-tasks.sql
--
-- SAFETY: hard guard (current_database()='heliumdb'); one transaction (any
-- error rolls back). Every inserted row id is prefixed 'T_' → reversible via
-- seed-preview-cleanup.sql. DB columns are plain varchar (enums are Zod-only),
-- so feed-driving columns use the EXACT Arabic stage/status literals getMyTasks
-- matches; all FK references point at seeded rows or existing departments 1/2.
--
-- LOGIN: every seeded user copies the manager's (id='1') password hash, so log
-- in to any seeded user with the SAME password as the manager account.
-- Usernames: ahmed, khaled, sara, fahd, maha, noura, yousef, abdullah, hessa,
-- turki, reem, majed, layla.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'SEED ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- ---- 1. USERS (realistic Arabic names; all roles; both depts عام=1/تجاري=2) --
-- admin_support specialty routing test:
--   turki = ترافع        (litigation specialist)
--   reem  = استشارات      (consultations specialist)
--   majed = ترافع+استشارات (both)
--   layla = none, INACTIVE (so no specialist match -> task falls to "" pool)
INSERT INTO users (id, username, password, name, role, department_id, is_active,
                   can_be_assigned_cases, can_be_assigned_consultations, must_change_password, task_specialties)
SELECT v.id, v.username, (SELECT password FROM users WHERE id = '1'),
       v.name, v.role, v.dept, v.active, true, true, false, v.spec::jsonb
FROM (VALUES
  ('T_u_ahmed',   'ahmed',   'أحمد العتيبي',   'employee',                  '1',  true,  NULL),
  ('T_u_khaled',  'khaled',  'خالد الشهري',    'employee',                  '1',  true,  NULL),
  ('T_u_sara',    'sara',    'سارة الدوسري',   'employee',                  '1',  true,  NULL),
  ('T_u_fahd',    'fahd',    'فهد الغامدي',    'employee',                  '2',  true,  NULL),
  ('T_u_maha',    'maha',    'مها الزهراني',   'employee',                  '2',  true,  NULL),
  ('T_u_noura',   'noura',   'نورة القحطاني',  'department_head',           '1',  true,  NULL),
  ('T_u_yousef',  'yousef',  'يوسف الحربي',    'department_head',           '2',  true,  NULL),
  ('T_u_abdullah','abdullah','عبدالله المالكي','cases_review_head',         '1',  true,  NULL),
  ('T_u_hessa',   'hessa',   'حصة العنزي',     'consultations_review_head', '2',  true,  NULL),
  ('T_u_turki',   'turki',   'تركي السبيعي',   'admin_support',             NULL, true,  '["ترافع"]'),
  ('T_u_reem',    'reem',    'ريم الفيفي',     'admin_support',             NULL, true,  '["استشارات"]'),
  ('T_u_majed',   'majed',   'ماجد الرشيدي',   'admin_support',             NULL, true,  '["ترافع","استشارات"]'),
  ('T_u_layla',   'layla',   'ليلى الجهني',    'admin_support',             NULL, false, NULL)
) AS v(id, username, name, role, dept, active, spec);

-- ---- 2. CLIENTS (realistic names) -------------------------------------------
INSERT INTO clients (id, client_type, individual_name, company_name, phone, created_by) VALUES
  ('T_cl_1','فرد', 'محمد العنزي',     NULL,                  '0551000001','1'),
  ('T_cl_2','شركة',NULL,              'مؤسسة البناء الحديث',  '0551000002','1'),
  ('T_cl_3','فرد', 'عبدالعزيز المطيري',NULL,                 '0551000003','1'),
  ('T_cl_4','شركة',NULL,              'شركة الأفق التجارية',  '0551000004','1'),
  ('T_cl_5','فرد', 'منى السهلي',      NULL,                  '0551000005','1'),
  ('T_cl_6','فرد', 'سلطان الرشيد',    NULL,                  '0551000006','1'),
  ('T_cl_7','شركة',NULL,              'مجموعة النخبة',        '0551000007','1'),
  ('T_cl_8','فرد', 'هند البقمي',      NULL,                  '0551000008','1'),
  ('T_cl_9','فرد', 'بدر الحارثي',     NULL,                  '0551000009','1'),
  ('T_cl_10','شركة',NULL,             'شركة المدى للمقاولات', '0551000010','1'),
  ('T_cl_11','فرد', 'ريما الخالدي',   NULL,                  '0551000011','1'),
  ('T_cl_12','فرد', 'ناصر الدوسري',   NULL,                  '0551000012','1');

-- ---- 3. CASES ----------------------------------------------------------------
-- case_work: 1,2,3,4,5,14 (a lawyer-work stage + a primary lawyer)
-- case_unassigned: 6 (عام), 7 (تجاري)
-- case review_pending internal: 8 (reviewer أحمد), 9 (reviewer فهد)
-- case review_pending committee: 10, 11 (cases_review_head عبدالله)
-- data_completion: 12 (عام), 13 (تجاري)  [admin_support]
-- hosts: 1 & 3 (hearings/memos/...), 15 (collection field tasks), 16 (hearing)
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       internal_reviewer_id, priority, case_classification, created_by) VALUES
  ('T_case_1', 'T-1001','T_cl_1', 'تجاري','دراسة','دراسة',                          '1','["T_u_ahmed"]','T_u_ahmed', NULL,        NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_2', 'T-1002','T_cl_2', 'تجاري','تحرير_المذكرة','تحرير_صحيفة_الدعوى',      '1','["T_u_khaled"]','T_u_khaled',NULL,        NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_3', 'T-1003','T_cl_3', 'عام',  'تعديلات','الأخذ_بالملاحظات',              '1','["T_u_sara"]', 'T_u_sara',  NULL,        NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_4', 'T-1004','T_cl_4', 'تجاري','دراسة','دراسة',                          '2','["T_u_fahd"]', 'T_u_fahd',  NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_5', 'T-1005','T_cl_5', 'عام',  'تحرير_المذكرة','تحرير_مذكرة_جوابية',      '1','["T_u_sara"]', 'T_u_sara',  NULL,        NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_6', 'T-1006','T_cl_6', 'عام',  'استلام','استلام',                        '1','[]',           NULL,        NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_7', 'T-1007','T_cl_7', 'تجاري','استلام','استلام',                        '2','[]',           NULL,        NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_8', 'T-1008','T_cl_8', 'عام',  'لجنة_المراجعة','مراجعة_داخلية',           '1','["T_u_khaled"]','T_u_khaled',NULL,       'T_u_ahmed', 'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_9', 'T-1009','T_cl_9', 'تجاري','لجنة_المراجعة','مراجعة_داخلية',           '2','["T_u_maha"]', 'T_u_maha',  NULL,        'T_u_fahd',  'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_10','T-1010','T_cl_10','عام',  'لجنة_المراجعة','إحالة_للجنة_المراجعة',     '1','["T_u_khaled"]','T_u_khaled',NULL,       NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_11','T-1011','T_cl_1', 'تجاري','لجنة_المراجعة','إحالة_للجنة_المراجعة',     '1','["T_u_ahmed"]','T_u_ahmed', NULL,        NULL,        'متوسط','منظورة_بالمحكمة','1'),
  ('T_case_12','T-1012','T_cl_2', 'عام',  'استكمال_البيانات','استكمال_البيانات',     '1','[]',           'T_u_ahmed', NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_13','T-1013','T_cl_3', 'تجاري','استكمال_البيانات','استكمال_البيانات',     '2','[]',           'T_u_fahd',  NULL,        NULL,        'متوسط','قيد_الدراسة',    '1'),
  ('T_case_14','T-1014','T_cl_4', 'عام',  'دراسة','دراسة',                          '1','["T_u_sara"]', 'T_u_sara',  NULL,        NULL,        'عالي', 'منظورة_بالمحكمة','1'),
  ('T_case_15','T-1015','T_cl_5', 'تجاري','مرفوع','تحصيل',                          '1','["T_u_ahmed"]','T_u_ahmed', NULL,        NULL,        'عاجل', 'منظورة_بالمحكمة','1'),
  ('T_case_16','T-1016','T_cl_6', 'تجاري','مرفوع','منظورة',                          '2','["T_u_fahd"]', 'T_u_fahd',  NULL,        NULL,        'متوسط','منظورة_بالمحكمة','1');

-- ---- 4. CONSULTATIONS (تجاري=2 / عام=1) -------------------------------------
-- review internal: cons_1 (reviewer مها), cons_5 (reviewer أحمد)
-- committee:       cons_2 (consultations_review_head حصة)
-- consultation_closing (admin_support, استشارات class): cons_3 (منجزة), cons_4 (جاهزة_للإرسال)
INSERT INTO consultations (id, consultation_number, client_id, consultation_type, current_stage,
                           status, department_id, assigned_to, internal_reviewer_id, question_summary, created_by) VALUES
  ('T_cons_1','T-CN-1','T_cl_7', 'مكتوبة','مراجعة_داخلية','active','2','T_u_fahd','T_u_maha', 'استشارة حول عقد توريد',           '1'),
  ('T_cons_2','T-CN-2','T_cl_8', 'مكتوبة','لجنة_مراجعة','active','2','T_u_fahd',  NULL,        'استشارة عمالية حول مكافأة نهاية الخدمة','1'),
  ('T_cons_3','T-CN-3','T_cl_9', 'مكتوبة','منجزة','active','2','T_u_maha',        NULL,        'استشارة عقارية',                  '1'),
  ('T_cons_4','T-CN-4','T_cl_10','مكتوبة','جاهزة_للإرسال','active','2','T_u_maha', NULL,        'استشارة تجارية حول شراكة',        '1'),
  ('T_cons_5','T-CN-5','T_cl_11','مكتوبة','مراجعة_داخلية','active','1','T_u_khaled','T_u_ahmed','استشارة حول نزاع إيجار',          '1');

-- ---- 5. CONTRACTS (تجاري=2 / عام=1) -----------------------------------------
-- review internal: ct_1 (reviewer مها), ct_3 (reviewer أحمد)
-- committee:       ct_2 (consultations_review_head حصة)
INSERT INTO contracts (id, contract_number, title, client_id, contract_type, current_stage,
                       status, department_id, assigned_to, internal_reviewer_id, created_by) VALUES
  ('T_ct_1','T-CT-1','عقد توريد مواد','T_cl_2', 'مراجعة_عقد','مراجعة_داخلية','active','2','T_u_fahd','T_u_maha', '1'),
  ('T_ct_2','T-CT-2','عقد شراكة',      'T_cl_4', 'مراجعة_عقد','لجنة_مراجعة','active','2','T_u_fahd',  NULL,       '1'),
  ('T_ct_3','T-CT-3','عقد إيجار تجاري','T_cl_7', 'صياغة_عقد','مراجعة_داخلية','active','1','T_u_khaled','T_u_ahmed','1');

-- ---- 6. HEARINGS -------------------------------------------------------------
-- attend: h_1 (+1, أحمد) + agency, h_2 (+5, خالد), h_3 (+2, سارة) + agency
-- unrecorded: h_4 (-3, أحمد), h_5 (-5, فهد)
-- hearing_report: h_6 (أحمد), h_7 (سارة)
-- session_report_export (admin_support): h_8 (فهد case), h_9 (أحمد case)
INSERT INTO hearings (id, case_id, hearing_date, hearing_time, hearing_type, court_name, status,
                      result, report_completed, session_report_exported, attending_lawyer_id) VALUES
  ('T_h_1','T_case_1', to_char(CURRENT_DATE + 1,'YYYY-MM-DD'),'09:30','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_ahmed'),
  ('T_h_2','T_case_2', to_char(CURRENT_DATE + 5,'YYYY-MM-DD'),'11:00','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_khaled'),
  ('T_h_3','T_case_3', to_char(CURRENT_DATE + 2,'YYYY-MM-DD'),'10:00','محكمة','المحكمة العامة','قادمة',  NULL,  false,false,'T_u_sara'),
  ('T_h_4','T_case_1', to_char(CURRENT_DATE - 3,'YYYY-MM-DD'),'09:00','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_ahmed'),
  ('T_h_5','T_case_4', to_char(CURRENT_DATE - 5,'YYYY-MM-DD'),'12:00','محكمة','المحكمة التجارية','قادمة', NULL,  false,false,'T_u_fahd'),
  ('T_h_6','T_case_1', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'),'09:30','محكمة','المحكمة التجارية','تمت',   'حكم', false,false,'T_u_ahmed'),
  ('T_h_7','T_case_3', to_char(CURRENT_DATE - 2,'YYYY-MM-DD'),'10:00','محكمة','المحكمة العامة','تمت',    'حكم', false,false,'T_u_sara'),
  ('T_h_8','T_case_16',to_char(CURRENT_DATE - 2,'YYYY-MM-DD'),'10:30','محكمة','المحكمة التجارية','تمت',   'حكم', true, false,'T_u_fahd'),
  ('T_h_9','T_case_1', to_char(CURRENT_DATE - 4,'YYYY-MM-DD'),'09:00','محكمة','المحكمة التجارية','تمت',   'حكم', true, false,'T_u_ahmed');

-- ---- 7. MEMOS (memo_pending several stages + review internal + committee) ----
INSERT INTO memos (id, case_id, memo_type, title, status, current_stage, assigned_to,
                   internal_reviewer_id, created_by, deadline) VALUES
  ('T_memo_1','T_case_1','مذكرة_جوابية','مذكرة جوابية — قضية T-1001','قيد_التحرير','تحرير',       'T_u_ahmed', NULL,       '1', to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('T_memo_2','T_case_2','تحرير_دعوى', 'صحيفة دعوى — قضية T-1002','معتمدة','جاهزة_للرفع',         'T_u_khaled',NULL,       '1', to_char(CURRENT_DATE + 4,'YYYY-MM-DD')),
  ('T_memo_3','T_case_3','مذكرة_جوابية','مذكرة — أخذ بالملاحظات T-1003','قيد_المراجعة','الأخذ_بالملاحظات','T_u_sara',NULL,  '1', to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_memo_4','T_case_2','مذكرة_جوابية','مذكرة بمراجعة داخلية — T-1002','قيد_المراجعة','مراجعة_داخلية','T_u_khaled','T_u_ahmed','1', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_memo_5','T_case_2','مذكرة_جوابية','مذكرة بلجنة المراجعة — T-1002','قيد_المراجعة','لجنة_مراجعة','T_u_khaled',NULL,    '1', to_char(CURRENT_DATE + 5,'YYYY-MM-DD')),
  ('T_memo_6','T_case_14','مذكرة_جوابية','مذكرة قيد التحرير — T-1014','قيد_التحرير','تحرير',       'T_u_sara',  NULL,       '1', to_char(CURRENT_DATE,    'YYYY-MM-DD'));

-- ---- 8. FIELD TASKS (collection routing + execution + generic + unassigned) --
-- SPECIALTY ROUTING:
--   ft_1 collection -> تركي  (ترافع specialist)            [routing (a)]
--   ft_2 collection -> ""    (no/inactive specialist -> pool) [routing (c)]
--   ft_9 collection -> ماجد  (both specialties)            [ترافع routed to a both-specialist]
INSERT INTO field_tasks (id, title, task_type, case_id, assigned_to, assigned_by, status, priority, due_date) VALUES
  ('T_ft_1','إعداد خطاب تحصيل — قضية رقم T-1015','متابعة_محكمة','T_case_15','T_u_turki','1','قيد_الانتظار','عاجل', to_char(CURRENT_DATE - 2,'YYYY-MM-DD')),
  ('T_ft_2','إعداد خطاب تحصيل — قضية رقم T-1001','متابعة_محكمة','T_case_1', '',         '1','قيد_الانتظار','عاجل', to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_ft_3','متابعة تنفيذ الحكم لدى محكمة التنفيذ','متابعة_محكمة','T_case_1','T_u_ahmed','1','قيد_الانتظار','عالي', to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_ft_4','تسليم مستندات للعميل','تسليم_مستندات','T_case_2','T_u_khaled','1','قيد_الانتظار','متوسط', to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_ft_5','زيارة موقع العميل','زيارة_عميل','T_case_3','T_u_sara','1','قيد_الانتظار','عالي', to_char(CURRENT_DATE + 3,'YYYY-MM-DD')),
  ('T_ft_6','مراجعة ميدانية للمستندات','مراجعة_ميدانية','T_case_14','T_u_sara','1','قيد_الانتظار','متوسط', to_char(CURRENT_DATE - 1,'YYYY-MM-DD')),
  ('T_ft_7','مهمة ميدانية غير مُسندة','مراجعة_ميدانية',NULL,'','1','قيد_الانتظار','متوسط', to_char(CURRENT_DATE + 2,'YYYY-MM-DD')),
  ('T_ft_8','تسليم صورة الحكم','تسليم_مستندات','T_case_4','T_u_fahd','1','قيد_الانتظار','عالي', to_char(CURRENT_DATE,    'YYYY-MM-DD')),
  ('T_ft_9','إعداد خطاب تحصيل — قضية رقم T-1016','متابعة_محكمة','T_case_16','T_u_majed','1','قيد_الانتظار','عاجل', to_char(CURRENT_DATE - 3,'YYYY-MM-DD')),
  ('T_ft_10','زيارة العميل لتوقيع الوكالة','زيارة_عميل','T_case_9','T_u_maha','1','قيد_الانتظار','متوسط', to_char(CURRENT_DATE + 4,'YYYY-MM-DD'));

-- ---- 9. LEGAL DEADLINES (نشط; spread) ---------------------------------------
INSERT INTO legal_deadlines (id, case_id, deadline_type, title, start_date, duration_days, deadline_date, status) VALUES
  ('T_ld_1','T_case_1', 'objection','مهلة اعتراض على الحكم', to_char(CURRENT_DATE - 5,'YYYY-MM-DD'), 30, to_char(CURRENT_DATE + 6,'YYYY-MM-DD'), 'نشط'),
  ('T_ld_2','T_case_3', 'submission','موعد تقديم مذكرة',     to_char(CURRENT_DATE - 10,'YYYY-MM-DD'),7,  to_char(CURRENT_DATE - 2,'YYYY-MM-DD'), 'نشط'),
  ('T_ld_3','T_case_2', 'objection','مهلة استئناف',          to_char(CURRENT_DATE - 3,'YYYY-MM-DD'), 30, to_char(CURRENT_DATE + 10,'YYYY-MM-DD'),'نشط'),
  ('T_ld_4','T_case_14','submission','موعد رد على المحكمة',  to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), 5,  to_char(CURRENT_DATE,    'YYYY-MM-DD'), 'نشط');

-- ---- 10. CONTACT LOGS (follow-up required) -> contact_followup ---------------
INSERT INTO contact_logs (id, client_id, contact_type, contact_date, next_follow_up_date,
                          follow_up_status, follow_up_required, follow_up_completed, case_id, created_by) VALUES
  ('T_co_1','T_cl_1','هاتفي', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE,    'YYYY-MM-DD'),'معلق',true,false,'T_case_1', 'T_u_ahmed'),
  ('T_co_2','T_cl_3','هاتفي', to_char(CURRENT_DATE - 4,'YYYY-MM-DD'), to_char(CURRENT_DATE - 1,'YYYY-MM-DD'),'معلق',true,false,'T_case_3', 'T_u_sara'),
  ('T_co_3','T_cl_2','زيارة', to_char(CURRENT_DATE - 2,'YYYY-MM-DD'), to_char(CURRENT_DATE + 3,'YYYY-MM-DD'),'معلق',true,false,'T_case_2', 'T_u_khaled');

-- ---- 11. DELEGATIONS ---------------------------------------------------------
-- dg_1: ACTIVE + APPROVED + in-window  سارة -> مها.  سارة has many tasks
--       (cases 3/5/14, hearings 3/7, memos 3/6, field 5/6, deadlines 2/4,
--       contact 2) so logging in as مها shows the "بالنيابة عن سارة الدوسري"
--       banner and inherits that full set (tagged بالنيابة عن).
-- dg_2: PENDING (approved_by NULL) أحمد (dept عام) -> تركي  => the عام
--       department_head (نورة) sees a delegation_approval task.
INSERT INTO delegations_table (id, from_user_id, to_user_id, reason, start_date, end_date,
                               status, scope, approved_by, approved_at) VALUES
  ('T_dg_1','T_u_sara','T_u_maha','إجازة', to_char(CURRENT_DATE - 1,'YYYY-MM-DD'), to_char(CURRENT_DATE + 14,'YYYY-MM-DD'),
   'نشط','all_cases','1', now()),
  ('T_dg_2','T_u_ahmed','T_u_turki','مهمة عمل', to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE + 14,'YYYY-MM-DD'),
   'نشط','all_cases', NULL, NULL);

COMMIT;
