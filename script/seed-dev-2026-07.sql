-- ============================================================================
-- seed-dev-2026-07.sql — DEV-ONLY regeneration of the five workflow entities,
-- rebuilt for the 2026-07 feature set (judgment lifecycle, صك receipt, appeal
-- path, settlement numbers, contract/consultation follow-up cycles).
--
-- Run AFTER script/dev-reset-wipe.sql, from the Replit Shell, DEV ONLY:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-dev-2026-07.sql
--
-- SUPERSEDES the payload of seed-e2e-tasks.sql / seed-preview-tasks.sql, which
-- predate every 2026-07 feature: they contain ZERO occurrences of
-- محكوم_حكم_ابتدائي / منظورة_استئناف / مداولة_الصلح / mohr_number / taradi_number /
-- judgment_deed_received_date / client_role / stage_history / closure_reason.
-- Those scripts stay in the repo — seed-e2e-tasks.sql is still the right tool
-- for exhaustive مهامي task-feed coverage. This one is the workflow dataset.
--
-- ASSERTS, NEVER CREATES: departments 1-5 and the original 14 users must
-- already exist. The script aborts with a readable message if any is missing,
-- rather than failing later on a foreign key.
--
-- ADDS (additive, idempotent — section 1b): four users that did not exist and
-- without which most of the 2026-07 permission work is untestable —
-- department_head for depts 3 / 4 / 5, plus an employee in dept 3 so labor
-- cases carry a lawyer from their OWN department.
--
-- CLIENTS are additive-only (INSERT ... ON CONFLICT DO NOTHING) — the wipe keeps
-- the `clients` table, so this only guarantees the FK targets exist.
--
-- ALL ids are 'T_'-prefixed, so script/seed-preview-cleanup.sql still undoes
-- this seed row-for-row. One transaction; hard heliumdb guard.
--
-- ⚠ NOT re-runnable on top of itself without a wipe first: the inserts are
-- plain INSERTs into tables the wipe empties. Run wipe → seed, always.
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

-- ---- 1. PREREQUISITE ASSERTIONS -------------------------------------------
-- Departments: id AND name must both match. The labor gating keys on the NAME
-- being exactly 'عمالي' (not the id), so a renamed row is as broken as a
-- missing one.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(v.id || '=' || v.name, ', ')
    INTO missing
  FROM (VALUES ('1','عام'),('2','تجاري'),('3','عمالي'),('4','إداري'),
               ('5','العقود والمشاريع')) AS v(id, name)
  WHERE NOT EXISTS (
    SELECT 1 FROM departments d WHERE d.id = v.id AND d.name = v.name
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'SEED ABORTED: missing/renamed departments -> %. Expected exactly: 1=عام, 2=تجاري, 3=عمالي, 4=إداري, 5=العقود والمشاريع.',
      missing;
  END IF;
END $$;

-- Users: asserted, never created (owner decision). seed-preview-tasks.sql is
-- what creates them if they are ever gone.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(v.id, ', ')
    INTO missing
  FROM (VALUES ('1'),('T_u_ahmed'),('T_u_khaled'),('T_u_sara'),('T_u_fahd'),
               ('T_u_maha'),('T_u_noura'),('T_u_yousef'),('T_u_abdullah'),
               ('T_u_hessa'),('T_u_turki'),('T_u_reem'),('T_u_majed'),
               ('T_u_layla')) AS v(id)
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = v.id);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'SEED ABORTED: missing users -> %. Run script/seed-preview-tasks.sql section 1 first (this script never creates users).',
      missing;
  END IF;
END $$;

-- The two manually-applied 2026-07-27 column pairs. Drizzle selects declared
-- columns explicitly, so if these are absent EVERY read of the table errors —
-- not just the new feature. Fail here with a clear message instead.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(v.t || '.' || v.c, ', ')
    INTO missing
  FROM (VALUES ('law_cases','judgment_deed_received_date'),
               ('law_cases','objection_window_days'),
               ('contracts','follow_up_count'),
               ('contracts','follow_up_started_at')) AS v(t, c)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_name = v.t AND ic.column_name = v.c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'SEED ABORTED: missing columns -> %. Run the ALTER TABLE ... ADD COLUMN statements from CLAUDE.md on this DB first.',
      missing;
  END IF;
END $$;

-- ---- 1b. ADDITIVE USERS — dept 3/4/5 heads + a labor lawyer ---------------
-- WHY: departments 3 (عمالي), 4 (إداري) and 5 (العقود والمشاريع) had NO
-- department_head, which made most of the 2026-07 work untestable —
-- C3/C4 MOHR permissions (canActOnMohrSettlement), dept-scoped skip-committee
-- on all four entities, and the labor settlement gates all resolve
-- department_head against the ENTITY's own department. With no such user, those
-- branches could never evaluate true on a labor/admin/contract row.
--
-- 🔑 HOW THE DEPT-HEAD GATE RESOLVES (verified, see the report):
--    users.role = 'department_head' AND users.department_id = <entity's dept>
--    NOT departments.head_id — the codebase explicitly distrusts that column
--    ("only partially seeded and can disagree", storage.getDepartmentHeads).
--    So THESE ROWS are what make the gates work; the head_id update below is
--    cosmetic only.
--
-- ADDITIVE + IDEMPOTENT (ON CONFLICT DO NOTHING) and consistent with the
-- existing 14: the password hash is COPIED from the manager (id='1'), so these
-- users log in with the SAME password as the manager account.
-- Usernames: hind, faisal, lama, saleh.
INSERT INTO users (id, username, password, name, role, department_id, is_active,
                   can_be_assigned_cases, can_be_assigned_consultations,
                   must_change_password, task_specialties)
-- task_specialties is explicitly cast — it is a jsonb column and these four are
-- not admin_support, so they hold no specialty.
SELECT v.id, v.username, (SELECT password FROM users WHERE id = '1'),
       v.name, v.role, v.dept, true, true, true, false, NULL::jsonb
FROM (VALUES
  ('T_u_hind',  'hind',  'هند الشمراني','department_head','3'),  -- عمالي
  ('T_u_faisal','faisal','فيصل العمري', 'department_head','4'),  -- إداري
  ('T_u_lama',  'lama',  'لمى الحمدان', 'department_head','5'),  -- العقود والمشاريع
  ('T_u_saleh', 'saleh', 'صالح القرني', 'employee',       '3')   -- عمالي lawyer
) AS v(id, username, name, role, dept)
ON CONFLICT (id) DO NOTHING;

-- Guard against a PARTIAL pre-existing state: if one of these ids was absent
-- but its USERNAME was already taken by a different row, the insert above is a
-- silent no-op (ON CONFLICT keys on id, not username) and the gates would stay
-- broken. Fail loudly instead.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(v.id, ', ')
    INTO missing
  FROM (VALUES ('T_u_hind'),('T_u_faisal'),('T_u_lama'),('T_u_saleh')) AS v(id)
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = v.id);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'SEED ABORTED: could not create users -> %. A different row probably already holds one of the usernames (hind/faisal/lama/saleh), which is UNIQUE.',
      missing;
  END IF;
END $$;

-- ---- 1c. departments.head_id — COSMETIC ONLY, safe to delete --------------
-- ⚠ NOT required by any permission gate (see 1b). departments.head_id is read
-- in exactly three places, none of them authorization:
--   • the deactivation warning "رئيس N قسم" (routes.ts)
--   • the deactivation/deletion cleanup that nulls or reassigns it
--   • storage.deleteUser
-- Set here purely so 3/4/5 stop being the "partially seeded" half of the
-- inconsistency the code complains about, and so deactivating one of the new
-- heads warns properly. Departments is a KEEP table, so this is the ONLY line
-- in either script that writes to it — scoped to 3/4/5, and only when the
-- column is currently NULL, so an existing head is never overwritten.
-- DELETE THIS STATEMENT if you would rather leave head_id untouched.
UPDATE departments SET head_id = v.head
FROM (VALUES ('3','T_u_hind'),('4','T_u_faisal'),('5','T_u_lama')) AS v(id, head)
WHERE departments.id = v.id AND departments.head_id IS NULL;

-- ---- 2. SESSION-LOCAL HELPERS ---------------------------------------------
-- Created in pg_temp so they vanish when the psql session ends: no DDL is left
-- behind in the database, and nothing needs dropping.
--   d(n)  -> a 'YYYY-MM-DD' date string n days from today (negative = past)
--   sh(...) -> ONE stage_history entry, matching CaseStageTransition exactly
--              { stage, timestamp, userId, userName, notes }
CREATE FUNCTION pg_temp.d(days int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(CURRENT_DATE + days, 'YYYY-MM-DD');
$$;

CREATE FUNCTION pg_temp.sh(stage text, days_ago int, uid text, uname text,
                           note text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'stage',     stage,
    'timestamp', to_char((CURRENT_DATE - days_ago)::timestamp + interval '9 hours',
                         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'userId',    uid,
    'userName',  uname,
    'notes',     note
  );
$$;

-- ---- 3. CLIENTS (additive — the wipe KEEPS clients) ------------------------
INSERT INTO clients (id, client_type, individual_name, company_name, phone, created_by) VALUES
  ('T_cl_1', 'فرد',  'محمد العنزي',       NULL,                   '0551000001','1'),
  ('T_cl_2', 'شركة', NULL,                'مؤسسة البناء الحديث',   '0551000002','1'),
  ('T_cl_3', 'فرد',  'عبدالعزيز المطيري', NULL,                   '0551000003','1'),
  ('T_cl_4', 'شركة', NULL,                'شركة الأفق التجارية',   '0551000004','1'),
  ('T_cl_5', 'فرد',  'منى السهلي',        NULL,                   '0551000005','1'),
  ('T_cl_6', 'فرد',  'سلطان الرشيد',      NULL,                   '0551000006','1'),
  ('T_cl_7', 'شركة', NULL,                'مجموعة النخبة',         '0551000007','1'),
  ('T_cl_8', 'فرد',  'هند البقمي',        NULL,                   '0551000008','1'),
  ('T_cl_9', 'فرد',  'بدر الحارثي',       NULL,                   '0551000009','1'),
  ('T_cl_10','شركة', NULL,                'شركة المدى للمقاولات',  '0551000010','1'),
  ('T_cl_11','فرد',  'ريما الخالدي',      NULL,                   '0551000011','1'),
  ('T_cl_12','فرد',  'ناصر الدوسري',      NULL,                   '0551000012','1'),
  ('T_cl_13','شركة', NULL,                'شركة الواحة الطبية',    '0551000013','1'),
  ('T_cl_14','فرد',  'أمل الشمري',        NULL,                   '0551000014','1'),
  ('T_cl_15','فرد',  'خالد المطرفي',      NULL,                   '0551000015','1')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. CASES — 30 rows, EVERY one with a realistic stage_history.
--
-- WHY stage_history matters (this is the whole point of the refresh): the old
-- seed left it '[]', which silently breaks two derived behaviours —
--   • deriveCurrentCaseNumber decides "reached settlement" by looking for
--     مداولة_الصلح IN stage_history. Without it a post-settlement case shows the
--     BASE case_number instead of its MOHR/Taradi number.
--   • the terminal-stage progress bar derives "last stage actually reached"
--     from stage_history; with an empty array an off-path case collapses onto
--     استلام (the 3fcd4e3 bug, reproduced from DATA instead of code).
--
-- ⚠ PLATFORM NUMBERS NEVER GO IN case_number. taradi/mohr/najiz/court are
-- varchar(100); case_number is varchar(50) NOT NULL UNIQUE. Each lives in its
-- own column and the accessor derives what to display.
--
-- ⚠ client_role is NULL on every قيد_الدراسة case ON PURPOSE — that is what the
-- app itself writes (cases.tsx force-nulls it at creation, and
-- getClientRoleLabel hard-returns "مدعي" for under-study cases). Seeding a
-- defendant role there would be data the product can never produce. Both roles
-- ARE covered, on the منظورة_بالمحكمة cases where they are real.
--
-- ⚠ The corrupt T-1008…T-1011 rows from the old seed (in-court cases parked on
-- under-study/committee stages) are deliberately NOT regenerated.
-- ============================================================================

-- ---- 4a. DEPT 1 (عام) — general path -------------------------------------
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       internal_reviewer_id, priority, case_classification, client_role,
                       active_memo_count, created_by) VALUES
  ('T_case_01','T-2001','T_cl_6','عام','استلام','استلام',
     jsonb_build_array(pg_temp.sh('استلام',3,'1','مدير الفرع','استلام القضية')),
     '1','[]',NULL,NULL,NULL,'متوسط','قيد_الدراسة',NULL,0,'1'),

  ('T_case_02','T-2002','T_cl_3','عام','دراسة','دراسة',
     jsonb_build_array(pg_temp.sh('استلام',20,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',15,'T_u_ahmed','أحمد العتيبي','بدء الدراسة')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed',NULL,'عالي','قيد_الدراسة',NULL,1,'1'),

  ('T_case_03','T-2003','T_cl_8','عام','تحرير_المذكرة','مراجعة_داخلية',
     jsonb_build_array(pg_temp.sh('استلام',30,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',26,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',18,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('مراجعة_داخلية',6,'T_u_khaled','خالد الشهري','إحالة للمراجع')),
     '1','["T_u_khaled"]','T_u_khaled','T_u_khaled','T_u_ahmed','عالي','قيد_الدراسة',NULL,2,'1'),

  -- committee stage → skip-committee is testable here (branch_manager /
  -- department_head of dept 1 / assigned lawyer).
  ('T_case_04','T-2004','T_cl_11','عام','لجنة_المراجعة','إحالة_للجنة_المراجعة',
     jsonb_build_array(pg_temp.sh('استلام',34,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',30,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',22,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('مراجعة_داخلية',12,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('إحالة_للجنة_المراجعة',4,'T_u_sara','سارة الدوسري')),
     '1','["T_u_sara"]','T_u_sara','T_u_sara','T_u_ahmed','عاجل','قيد_الدراسة',NULL,1,'1'),

  -- sitting in ناجز review → the D3 recurring "متابعة ناجز" scheduler reminder
  -- keys on the LAST قيد_التدقيق_في_ناجز entry in stage_history, so the history
  -- below is what makes that job fire.
  ('T_case_05','T-2005','T_cl_9','عام','جاهز_للرفع','قيد_التدقيق_في_ناجز',
     jsonb_build_array(pg_temp.sh('استلام',48,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',44,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',36,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('مراجعة_داخلية',28,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('إحالة_للجنة_المراجعة',20,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('جاهزة_للرفع',12,'T_u_abdullah','عبدالله المالكي','اعتماد اللجنة'),
                       pg_temp.sh('قيد_التدقيق_في_ناجز',8,'T_u_ahmed','أحمد العتيبي')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed',NULL,'عالي','قيد_الدراسة',NULL,0,'1');

UPDATE law_cases SET najiz_number = 'NJZ-2026-000501' WHERE id = 'T_case_05';

-- ---- 4b. DEPT 2 (تجاري) — Taradi settlement path --------------------------
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, taradi_number, taradi_status,
                       active_memo_count, created_by) VALUES
  ('T_case_06','T-2006','T_cl_2','تجاري','جاهز_للرفع','قيد_التدقيق_في_تراضي',
     jsonb_build_array(pg_temp.sh('استلام',40,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',36,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',28,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('مراجعة_داخلية',20,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('جاهزة_للرفع',10,'T_u_abdullah','عبدالله المالكي'),
                       pg_temp.sh('قيد_التدقيق_في_تراضي',5,'T_u_fahd','فهد الغامدي')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','عالي','قيد_الدراسة',NULL,
     'TRD-2026-100077','مقيدة_في_تراضي',1,'1'),

  -- AT مداولة_الصلح with its Taradi number → the settlement number must be the
  -- DISPLAYED number here.
  ('T_case_07','T-2007','T_cl_4','تجاري','جاهز_للرفع','مداولة_الصلح',
     jsonb_build_array(pg_temp.sh('استلام',60,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',55,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',45,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('جاهزة_للرفع',30,'T_u_abdullah','عبدالله المالكي'),
                       pg_temp.sh('قيد_التدقيق_في_تراضي',20,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('مداولة_الصلح',9,'T_u_fahd','فهد الغامدي','بدء جلسات الصلح')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','عاجل','قيد_الدراسة',NULL,
     'TRD-2026-100078','مقيدة_في_تراضي',0,'1'),

  -- PAST مداولة_الصلح, now back on a pre-court stage. THE key derivation test:
  -- stage_history contains مداولة_الصلح and no court number exists, so the
  -- accessor must STILL display the Taradi number, not the base case_number.
  ('T_case_08','T-2008','T_cl_7','تجاري','جاهز_للرفع','جاهزة_للرفع',
     jsonb_build_array(pg_temp.sh('استلام',75,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',70,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',60,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('قيد_التدقيق_في_تراضي',45,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('مداولة_الصلح',30,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('أغلق_طلب_الصلح',18,'T_u_maha','مها الزهراني','لم يتم الصلح'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',14,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('مراجعة_داخلية',8,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('جاهزة_للرفع',2,'T_u_abdullah','عبدالله المالكي')),
     '2','["T_u_maha"]','T_u_maha','T_u_maha','عالي','قيد_الدراسة',NULL,
     'TRD-2026-100079','لم_يتم_صلح',0,'1');

-- DEFENDANT settlement failure → auto-closed with no choice dialog (7666a9c).
-- The settlement record survives closure for the PART-B reopen.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, is_settlement_case,
                       taradi_number, closure_reason, closed_at, active_memo_count, created_by) VALUES
  ('T_case_09','T-2009','T_cl_10','تجاري','مغلق','مقفلة',
     jsonb_build_array(pg_temp.sh('استلام',50,'1','مدير الفرع'),
                       pg_temp.sh('مداولة_الصلح',35,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('مقفلة',7,'T_u_fahd','فهد الغامدي','لم يتم الصلح — مدعى عليه')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','متوسط','منظورة_بالمحكمة','مدعى_عليه',true,
     'TRD-2026-100080','لم_يتم_الصلح',(CURRENT_DATE - 7)::timestamp,0,'1');

-- ---- 4c. DEPT 3 (عمالي) — MOHR settlement path ----------------------------
-- Every labor case carries T_u_saleh (صالح القرني), an employee IN DEPARTMENT 3,
-- so the case is dept-consistent end to end: the assigned-lawyer gate and the
-- department_head gate (T_u_hind, also dept 3) both resolve against the same
-- department the case belongs to. That is what makes C3/C4 MOHR permissions and
-- the labor settlement gates actually testable — see section 1b.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, mohr_number, mohr_status,
                       active_memo_count, created_by) VALUES
  -- D1 client-settlement-direction task fires from this stage (1faf618).
  ('T_case_10','T-2010','T_cl_12','عمالي','دراسة','توجيه_العميل_بالتسوية',
     jsonb_build_array(pg_temp.sh('استلام',14,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',10,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('توجيه_العميل_بالتسوية',4,'T_u_saleh','صالح القرني')),
     '3','["T_u_saleh"]','T_u_saleh','T_u_saleh','عالي','قيد_الدراسة',NULL,NULL,NULL,0,'1'),

  -- DELIBERATELY task-silent (owner decision) — waiting on the client.
  ('T_case_11','T-2011','T_cl_14','عمالي','دراسة','بانتظار_رفع_العميل_للتسوية',
     jsonb_build_array(pg_temp.sh('استلام',22,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',18,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('توجيه_العميل_بالتسوية',12,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('بانتظار_رفع_العميل_للتسوية',6,'T_u_saleh','صالح القرني')),
     '3','["T_u_saleh"]','T_u_saleh','T_u_saleh','متوسط','قيد_الدراسة',NULL,NULL,NULL,0,'1'),

  -- AT مداولة_الصلح with a MOHR number → the mandatory mohr_number prompt has
  -- been satisfied; this is the labor mirror of T_case_07.
  ('T_case_12','T-2012','T_cl_15','عمالي','دراسة','مداولة_الصلح',
     jsonb_build_array(pg_temp.sh('استلام',30,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',26,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('توجيه_العميل_بالتسوية',20,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('بانتظار_رفع_العميل_للتسوية',14,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('مداولة_الصلح',5,'T_u_saleh','صالح القرني','جلسة تسوية مهر')),
     '3','["T_u_saleh"]','T_u_saleh','T_u_saleh','عاجل','قيد_الدراسة',NULL,
     'MHR-2026-500311','توجيه_تسوية_ودية',0,'1'),

  -- PAST مداولة_الصلح → mohr_number must WIN over any taradi number and over
  -- the base case_number (mohr is checked first in the settlement branch).
  ('T_case_13','T-2013','T_cl_5','عمالي','جاهز_للرفع','جاهزة_للرفع',
     jsonb_build_array(pg_temp.sh('استلام',70,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',65,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('مداولة_الصلح',40,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('أغلق_طلب_الصلح',25,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',18,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('مراجعة_داخلية',10,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('جاهزة_للرفع',3,'T_u_abdullah','عبدالله المالكي')),
     '3','["T_u_saleh"]','T_u_saleh','T_u_saleh','عالي','قيد_الدراسة',NULL,
     'MHR-2026-500312','انتهت_التسوية',0,'1'),

  -- تحصيل = the SETTLEMENT-SUCCESS terminal (L4). Off every path array, so the
  -- progress bar must render the prep run completed + a terminal badge and NOT
  -- collapse onto استلام. Needs the مداولة_الصلح history entry to do that.
  ('T_case_14','T-2014','T_cl_13','عمالي','مغلق','تحصيل',
     jsonb_build_array(pg_temp.sh('استلام',90,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',85,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('توجيه_العميل_بالتسوية',75,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('مداولة_الصلح',60,'T_u_saleh','صالح القرني'),
                       pg_temp.sh('تحصيل',20,'T_u_saleh','صالح القرني','تم الصلح')),
     '3','["T_u_saleh"]','T_u_saleh','T_u_saleh','متوسط','قيد_الدراسة',NULL,
     'MHR-2026-500313','انتهت_التسوية',0,'1');

-- ---- 4d. DEPT 4 (إداري) — grievance path ----------------------------------
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, grievance_required, grievance_date,
                       active_memo_count, created_by) VALUES
  ('T_case_15','T-2015','T_cl_1','إداري','تحرير_المذكرة','تحرير_صيغة_التظلم',
     jsonb_build_array(pg_temp.sh('استلام',18,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',14,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('تحرير_صيغة_التظلم',5,'T_u_sara','سارة الدوسري')),
     '4','["T_u_sara"]','T_u_sara','T_u_sara','عالي','قيد_الدراسة',NULL,true,pg_temp.d(-14),0,'1'),

  ('T_case_16','T-2016','T_cl_3','إداري','مرفوع','انتظار_رد_التظلم',
     jsonb_build_array(pg_temp.sh('استلام',45,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',40,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('تحرير_صيغة_التظلم',30,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('مراجعة_داخلية_للتظلم',22,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('تقديم_التظلم',15,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('انتظار_رد_التظلم',15,'T_u_khaled','خالد الشهري')),
     '4','["T_u_khaled"]','T_u_khaled','T_u_khaled','متوسط','قيد_الدراسة',NULL,true,pg_temp.d(-40),0,'1');

-- ---- 4e. IN COURT + THE JUDGMENT LIFECYCLE --------------------------------
-- T_case_17 and T_case_18 deliberately share client T_cl_1 AND lawyer أحمد, and
-- both have a hearing at +2 days → they reproduce the agency-verify GROUPING
-- (one combined task, not two).
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, court_name, court_case_number,
                       najiz_number, memo_required, active_memo_count, created_by) VALUES
  ('T_case_17','T-2017','T_cl_1','تجاري','مرفوع','منظورة',
     jsonb_build_array(pg_temp.sh('استلام',80,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',75,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('تحرير_صحيفة_الدعوى',65,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('جاهزة_للرفع',50,'T_u_abdullah','عبدالله المالكي'),
                       pg_temp.sh('قيد_التدقيق_في_ناجز',42,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('منظورة',35,'T_u_ahmed','أحمد العتيبي','قيد النظر أمام المحكمة')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed','عالي','منظورة_بالمحكمة','مدعي',
     'المحكمة التجارية بالرياض','CRT-2026-880021','NJZ-2026-000502',false,0,'1'),

  -- DEFENDANT in court, with a live جوابية memo → lights the generic
  -- "مذكرة جارية" badge (group 3).
  ('T_case_18','T-2018','T_cl_1','عام','تحرير_المذكرة','منظورة',
     jsonb_build_array(pg_temp.sh('استلام',65,'1','مدير الفرع'),
                       pg_temp.sh('استكمال_البيانات',60,'1','مدير الفرع'),
                       pg_temp.sh('تحرير_مذكرة_جوابية',50,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('منظورة',30,'T_u_ahmed','أحمد العتيبي')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed','عاجل','منظورة_بالمحكمة','مدعى_عليه',
     'المحكمة العامة بالرياض','CRT-2026-880022',NULL,true,1,'1');

-- محكوم_حكم_ابتدائي — the two صك states, side by side.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, court_name, court_case_number,
                       judgment_deed_received_date, objection_window_days,
                       active_memo_count, created_by) VALUES
  -- (a) صك NOT received → judgment_deed_received_date IS NULL, which IS the
  --     derived "بانتظار استلام الصك" badge. No stored flag, self-clearing.
  ('T_case_19','T-2019','T_cl_9','تجاري','مرفوع','محكوم_حكم_ابتدائي',
     jsonb_build_array(pg_temp.sh('استلام',120,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',90,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('محكوم_حكم_ابتدائي',6,'T_u_fahd','فهد الغامدي','حكم ابتدائي ضدنا')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','عاجل','منظورة_بالمحكمة','مدعي',
     'المحكمة التجارية بالرياض','CRT-2026-880023',NULL,NULL,0,'1'),

  -- (b) صك RECEIVED + 30-day window + a live لائحة اعتراضية memo → this is the
  --     case that lights the NEW "لائحة اعتراضية" row badge (147679c) NEXT TO
  --     "بانتظار استلام الصك" being OFF.
  ('T_case_20','T-2020','T_cl_2','تجاري','مرفوع','محكوم_حكم_ابتدائي',
     jsonb_build_array(pg_temp.sh('استلام',150,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',110,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('محكوم_حكم_ابتدائي',20,'T_u_maha','مها الزهراني','حكم ابتدائي ضدنا')),
     '2','["T_u_maha"]','T_u_maha','T_u_maha','عاجل','منظورة_بالمحكمة','مدعي',
     'المحكمة التجارية بالرياض','CRT-2026-880024',pg_temp.d(-12),30,1,'1'),

  -- (c) القضاء المستعجل → the 10-day objection window variant.
  ('T_case_21','T-2021','T_cl_8','عام','مرفوع','محكوم_حكم_ابتدائي',
     jsonb_build_array(pg_temp.sh('استلام',100,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',70,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('محكوم_حكم_ابتدائي',9,'T_u_sara','سارة الدوسري','حكم جزئي')),
     '1','["T_u_sara"]','T_u_sara','T_u_sara','عاجل','منظورة_بالمحكمة','مدعى_عليه',
     'دائرة القضاء المستعجل','CRT-2026-880025',pg_temp.d(-5),10,1,'1');

-- منظورة_استئناف — reached by FILING the لائحة اعتراضية (a234c7b). Previously
-- an unreachable stage; now it has a case sitting on it.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       appeal_lawyer_id, priority, case_classification, client_role,
                       court_name, court_case_number, judgment_deed_received_date,
                       objection_window_days, active_memo_count, created_by) VALUES
  ('T_case_22','T-2022','T_cl_4','تجاري','مرفوع','منظورة_استئناف',
     jsonb_build_array(pg_temp.sh('استلام',200,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',160,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('محكوم_حكم_ابتدائي',60,'T_u_fahd','فهد الغامدي','حكم ابتدائي ضدنا'),
                       pg_temp.sh('منظورة_استئناف',25,'T_u_fahd','فهد الغامدي','رفع لائحة اعتراضية')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','T_u_maha','عاجل','منظورة_بالمحكمة','مدعي',
     'محكمة الاستئناف بالرياض','CRT-2026-880026',pg_temp.d(-55),30,0,'1');

-- محكوم_حكم_نهائي — the case RESTS here (b41553a). No auto-move to تحصيل/مقفلة.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, court_name, court_case_number,
                       active_memo_count, created_by) VALUES
  -- لصالحنا → BOTH a collection AND an execution field task pending (below).
  ('T_case_23','T-2023','T_cl_7','تجاري','مرفوع','محكوم_حكم_نهائي',
     jsonb_build_array(pg_temp.sh('استلام',220,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',180,'T_u_maha','مها الزهراني'),
                       pg_temp.sh('محكوم_حكم_نهائي',10,'T_u_maha','مها الزهراني','حكم نهائي لصالحنا')),
     '2','["T_u_maha"]','T_u_maha','T_u_maha','عاجل','منظورة_بالمحكمة','مدعي',
     'المحكمة التجارية بالرياض','CRT-2026-880027',0,'1'),

  -- جزئي → collection ONLY, no execution. Also the case that proves جزئي is
  -- counted in stats (b41553a changed the win-rate denominator).
  ('T_case_24','T-2024','T_cl_11','عام','مرفوع','محكوم_حكم_نهائي',
     jsonb_build_array(pg_temp.sh('استلام',190,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',150,'T_u_khaled','خالد الشهري'),
                       pg_temp.sh('محكوم_حكم_نهائي',14,'T_u_khaled','خالد الشهري','حكم نهائي جزئي')),
     '1','["T_u_khaled"]','T_u_khaled','T_u_khaled','عالي','منظورة_بالمحكمة','مدعي',
     'المحكمة العامة بالرياض','CRT-2026-880028',1,'1');

-- Closed cases — the two distinct judgment closure reasons + a struck-off one.
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, court_name, court_case_number,
                       closure_reason, closed_at, is_archived, archived_at, archive_reason,
                       struck_off_date, struck_off_reopen_deadline, execution_request_number,
                       active_memo_count, created_by) VALUES
  -- ضدنا + final → auto-close (ClosureReason.JUDGMENT_AGAINST).
  ('T_case_25','T-2025','T_cl_6','عام','مغلق','مقفلة',
     jsonb_build_array(pg_temp.sh('استلام',260,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',210,'T_u_sara','سارة الدوسري'),
                       pg_temp.sh('محكوم_حكم_نهائي',40,'T_u_sara','سارة الدوسري','حكم نهائي ضدنا'),
                       pg_temp.sh('مقفلة',40,'system','النظام','إغلاق تلقائي — حكم نهائي ضدنا')),
     '1','["T_u_sara"]','T_u_sara','T_u_sara','متوسط','منظورة_بالمحكمة','مدعي',
     'المحكمة العامة بالرياض','CRT-2026-880029',
     'حكم_نهائي_ضدنا',(CURRENT_DATE - 40)::timestamp,false,NULL,NULL,NULL,NULL,NULL,0,'1'),

  -- All post-judgment tasks done → ClosureReason.COLLECTION_COMPLETED, and
  -- ARCHIVED as well (a case auto-archives without leaving مقفلة, so the reopen
  -- endpoint must clear both sets of fields).
  ('T_case_26','T-2026','T_cl_10','تجاري','مغلق','مقفلة',
     jsonb_build_array(pg_temp.sh('استلام',400,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',350,'T_u_fahd','فهد الغامدي'),
                       pg_temp.sh('محكوم_حكم_نهائي',260,'T_u_fahd','فهد الغامدي','حكم نهائي لصالحنا'),
                       pg_temp.sh('مقفلة',200,'system','النظام','اكتمال التحصيل والتنفيذ')),
     '2','["T_u_fahd"]','T_u_fahd','T_u_fahd','منخفض','منظورة_بالمحكمة','مدعي',
     'المحكمة التجارية بالرياض','CRT-2026-880030',
     -- archive_reason is FREE TEXT (varchar(50), no enum). This is the exact
     -- string the auto-archive scheduler writes (scheduler.ts).
     'تم_التحصيل',(CURRENT_DATE - 200)::timestamp,true,(CURRENT_DATE - 20)::timestamp,
     'أرشفة تلقائية - مضى 6 أشهر على الإغلاق',
     NULL,NULL,'EXE-2026-770014',0,'1'),

  -- مشطوبة with a live re-registration deadline.
  ('T_case_27','T-2027','T_cl_14','عام','مرفوع','مشطوبة',
     jsonb_build_array(pg_temp.sh('استلام',140,'1','مدير الفرع'),
                       pg_temp.sh('منظورة',100,'T_u_ahmed','أحمد العتيبي'),
                       pg_temp.sh('مشطوبة',12,'T_u_ahmed','أحمد العتيبي','شطب لعدم الحضور')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed','عاجل','منظورة_بالمحكمة','مدعي',
     'المحكمة العامة بالرياض','CRT-2026-880031',
     NULL,NULL,false,NULL,NULL,pg_temp.d(-12),pg_temp.d(48),NULL,0,'1');

-- ---- 4f. EDGE / STATE cases ------------------------------------------------
INSERT INTO law_cases (id, case_number, client_id, case_type, status, current_stage, stage_history,
                       department_id, assigned_lawyers, primary_lawyer_id, responsible_lawyer_id,
                       priority, case_classification, client_role, awaiting_completion, saved_stage,
                       paused_at, pause_reason, paused_by, active_memo_count, created_by) VALUES
  -- Parked on the data-completion detour → data_completion_case task
  -- (admin_support). saved_stage is what resume restores.
  ('T_case_28','T-2028','T_cl_5','عام','استكمال_البيانات','استكمال_البيانات',
     jsonb_build_array(pg_temp.sh('استلام',12,'1','مدير الفرع'),
                       pg_temp.sh('استكمال_البيانات',8,'T_u_ahmed','أحمد العتيبي','نقص مستندات')),
     '1','["T_u_ahmed"]','T_u_ahmed','T_u_ahmed','متوسط','قيد_الدراسة',NULL,
     true,'دراسة',NULL,NULL,NULL,0,'1'),

  -- PAUSED (paused_at IS NOT NULL is the canonical indicator; status untouched).
  ('T_case_29','T-2029','T_cl_12','تجاري','دراسة','دراسة',
     jsonb_build_array(pg_temp.sh('استلام',26,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',20,'T_u_maha','مها الزهراني')),
     '2','["T_u_maha"]','T_u_maha','T_u_maha','منخفض','قيد_الدراسة',NULL,
     false,NULL,(CURRENT_DATE - 5)::timestamp,'بانتظار رد العميل على طلب المستندات','T_u_maha',0,'1'),

  -- ⚠ THE UNMODELLED CASE, seeded deliberately and documented: a قيد_الدراسة
  -- case whose client is in substance a DEFENDANT. client_role is NULL because
  -- that is what the app writes (cases.tsx force-nulls it for under-study
  -- cases), and getClientRoleLabel will display "مدعي" regardless. Keeping it
  -- faithful makes the gap visible instead of faking data the product cannot
  -- produce. See "Defendant-in-settlement ↔ court linkage" in CLAUDE.md.
  ('T_case_30','T-2030','T_cl_15','عام','دراسة','دراسة',
     jsonb_build_array(pg_temp.sh('استلام',16,'1','مدير الفرع'),
                       pg_temp.sh('دراسة',11,'T_u_khaled','خالد الشهري','العميل مدعى عليه فعلياً — غير ممثَّل في النموذج')),
     '1','["T_u_khaled"]','T_u_khaled','T_u_khaled','متوسط','قيد_الدراسة',NULL,
     false,NULL,NULL,NULL,NULL,0,'1');

-- ============================================================================
-- 5. HEARINGS — past (with results) and upcoming.
-- The judgment rows carry the FULL judgment model: judgment_side (the persisted
-- column), judgment_final (DERIVED server-side, never asked) and
-- objection_feasible (the tri-state answer, NULL on an appeal ruling).
-- ============================================================================
INSERT INTO hearings (id, case_id, hearing_date, hearing_time, hearing_type, court_name, status,
                      result, judgment_side, judgment_final, objection_feasible, objection_deadline,
                      opponent_response_required, attending_lawyer_id, report_completed,
                      session_report_exported, memo_required) VALUES
  -- T_case_17 / T_case_18 both at +2 days, same client + same lawyer → the
  -- agency-verify GROUPING case (ONE combined task).
  ('T_h_01','T_case_17',pg_temp.d(2), '10:00','محكمة','المحكمة التجارية بالرياض','قادمة',
     NULL,NULL,NULL,NULL,NULL,false,'T_u_ahmed',false,false,false),
  ('T_h_02','T_case_17',pg_temp.d(-20),'09:30','محكمة','المحكمة التجارية بالرياض','تمت',
     'موعد_جديد',NULL,NULL,NULL,NULL,false,'T_u_ahmed',false,false,false),
  ('T_h_03','T_case_18',pg_temp.d(2), '11:00','محكمة','المحكمة العامة بالرياض','قادمة',
     -- "مطلوب رد من الخصم" lives on the NEWEST hearing of the case — this row.
     NULL,NULL,NULL,NULL,NULL,true,'T_u_ahmed',false,false,false),
  ('T_h_04','T_case_18',pg_temp.d(-15),'09:00','محكمة','المحكمة العامة بالرياض','تمت',
     'موعد_جديد',NULL,NULL,NULL,NULL,false,'T_u_ahmed',true,false,true),

  -- (a) primary judgment, objectionable, صك NOT yet received.
  ('T_h_05','T_case_19',pg_temp.d(-6), '10:00','محكمة','المحكمة التجارية بالرياض','تمت',
     'حكم','ضدنا',false,true,NULL,false,'T_u_fahd',true,true,false),
  -- (b) primary judgment, objectionable, صك received 12 days ago (window 30).
  ('T_h_06','T_case_20',pg_temp.d(-20),'10:30','محكمة','المحكمة التجارية بالرياض','تمت',
     'حكم','ضدنا',false,true,pg_temp.d(18),false,'T_u_maha',true,true,false),
  -- (c) partial judgment in the urgent court, window 10.
  ('T_h_07','T_case_21',pg_temp.d(-9), '12:00','محكمة','دائرة القضاء المستعجل','تمت',
     -- deadline = صك receipt d(-5) + window 10 = d(5). Kept arithmetically exact
     -- so the computed value can be diffed against what the app derives.
     'حكم','جزئي',false,true,pg_temp.d(5),false,'T_u_sara',true,false,false),

  -- T_case_22: the ORIGINAL primary judgment, then the appeal session.
  ('T_h_08','T_case_22',pg_temp.d(-60),'09:00','محكمة','المحكمة التجارية بالرياض','تمت',
     'حكم','ضدنا',false,true,pg_temp.d(-25),false,'T_u_fahd',true,true,false),
  ('T_h_09','T_case_22',pg_temp.d(14),'10:00','محكمة','محكمة الاستئناف بالرياض','قادمة',
     NULL,NULL,NULL,NULL,NULL,false,'T_u_maha',false,false,false),

  -- FINAL judgments. objection_feasible is NULL on an appeal ruling (meaningless);
  -- on a first-instance ruling marked NOT objectionable it is false, and that is
  -- what makes judgment_final true.
  ('T_h_10','T_case_23',pg_temp.d(-10),'09:30','محكمة','المحكمة التجارية بالرياض','تمت',
     'حكم','لصالحنا',true,false,NULL,false,'T_u_maha',true,true,false),
  ('T_h_11','T_case_24',pg_temp.d(-14),'11:30','محكمة','المحكمة العامة بالرياض','تمت',
     'حكم','جزئي',true,false,NULL,false,'T_u_khaled',true,true,false),
  ('T_h_12','T_case_25',pg_temp.d(-40),'10:00','محكمة','المحكمة العامة بالرياض','تمت',
     'حكم','ضدنا',true,NULL,NULL,false,'T_u_sara',true,true,false),

  -- Struck off.
  ('T_h_13','T_case_27',pg_temp.d(-12),'08:30','محكمة','المحكمة العامة بالرياض','تمت',
     'شطب',NULL,NULL,NULL,NULL,false,'T_u_ahmed',true,false,false),

  -- Settlement sessions (hearing_type تسوية_ودية / تراضي, NOT محكمة).
  ('T_h_14','T_case_07',pg_temp.d(3), '13:00','تراضي','منصة تراضي','قادمة',
     NULL,NULL,NULL,NULL,NULL,false,'T_u_fahd',false,false,false),
  ('T_h_15','T_case_12',pg_temp.d(4), '13:30','تسوية_ودية','مكتب العمل','قادمة',
     NULL,NULL,NULL,NULL,NULL,false,'T_u_saleh',false,false,false),

  -- A past session with NO result recorded yet → the "record the result" task.
  ('T_h_16','T_case_05',pg_temp.d(-2), '09:00','محكمة','المحكمة العامة بالرياض','قادمة',
     NULL,NULL,NULL,NULL,NULL,false,'T_u_ahmed',false,false,false);

-- ============================================================================
-- 6. MEMOS — every MemoType, every meaningful status.
-- ⚠ SENTINEL: memos.assigned_to is NOT NULL — unassigned is '' (never NULL).
--   That asymmetry (consultations.assigned_to IS nullable) is the fa45c6f bug.
-- ============================================================================
INSERT INTO memos (id, case_id, memo_type, title, status, current_stage, assigned_to,
                   internal_reviewer_id, created_by, deadline, priority, is_auto_generated,
                   auto_generate_reason, cancellation_reason) VALUES
  ('T_memo_01','T_case_03','تحرير_دعوى','صحيفة دعوى — قضية T-2003','قيد_التحرير','تحرير',
     'T_u_khaled','T_u_ahmed','1',pg_temp.d(5),'عالي',false,'',NULL),
  ('T_memo_02','T_case_04','تحرير_دعوى','صحيفة دعوى — قضية T-2004','قيد_المراجعة','لجنة_مراجعة',
     'T_u_sara','T_u_ahmed','1',pg_temp.d(3),'عاجل',false,'',NULL),
  -- Lights the generic "مذكرة جارية" badge on the in-court defendant case.
  ('T_memo_03','T_case_18','مذكرة_جوابية','مذكرة جوابية - جلسة ' || pg_temp.d(2),'قيد_التحرير','تحرير',
     'T_u_ahmed',NULL,'system',pg_temp.d(-1),'عالي',true,'موعد_جديد_مع_رد',NULL),
  -- ⭐ Lights the NEW "لائحة اعتراضية" badge (147679c) beside a صك-received case.
  ('T_memo_04','T_case_20','لائحة_اعتراضية','لائحة اعتراضية — قضية رقم T-2020','قيد_التحرير','تحرير',
     'T_u_maha',NULL,'system',pg_temp.d(18),'عاجل',true,'حكم_ابتدائي_صك_مستلم',NULL),
  ('T_memo_05','T_case_21','لائحة_اعتراضية','لائحة اعتراضية — قضية رقم T-2021','لم_تبدأ','استلام',
     'T_u_sara',NULL,'system',pg_temp.d(5),'عاجل',true,'حكم_ابتدائي_صك_مستلم',NULL),
  -- The FILED objection that moved T_case_22 to منظورة_استئناف.
  ('T_memo_06','T_case_22','لائحة_اعتراضية','لائحة اعتراضية — قضية رقم T-2022','مرفوعة','مرفوعة',
     'T_u_fahd',NULL,'system',pg_temp.d(-25),'عاجل',true,'حكم_ابتدائي_صك_مستلم',NULL),
  ('T_memo_07','T_case_24','لائحة_نقض','لائحة نقض — قضية رقم T-2024','لم_تبدأ','استلام',
     'T_u_khaled',NULL,'1',pg_temp.d(20),'عالي',false,'',NULL),
  -- ⚠ UNASSIGNED memo → '' (the sentinel), NOT NULL.
  ('T_memo_08','T_case_02','أخرى','مذكرة إضافية — قضية T-2002','لم_تبدأ','استلام',
     '',NULL,'1',pg_temp.d(9),'متوسط',false,'',NULL),
  ('T_memo_09','T_case_05','تحرير_دعوى','صحيفة دعوى — قضية T-2005','معتمدة','جاهزة_للرفع',
     'T_u_ahmed',NULL,'1',pg_temp.d(-4),'عالي',false,'',NULL),
  -- Cancelled by the MANUAL "لا يحتاج مذكرة" flow → its reason renders in the
  -- memo-detail cancellation banner.
  ('T_memo_10','T_case_17','مذكرة_جوابية','مذكرة جوابية — قضية T-2017','ملغاة','تحرير',
     'T_u_ahmed',NULL,'1',pg_temp.d(-8),'متوسط',false,'','لا يحتاج الملف مذكرة — تم الرد شفهياً في الجلسة'),
  ('T_memo_11','T_case_03','مذكرة_جوابية','مذكرة جوابية — قضية T-2003','تحتاج_تعديل','الأخذ_بالملاحظات',
     'T_u_khaled','T_u_ahmed','1',pg_temp.d(2),'عالي',false,'',NULL),
  ('T_memo_12','T_case_08','تحرير_دعوى','صحيفة دعوى — قضية T-2008','مرفوعة','مرفوعة',
     'T_u_maha',NULL,'1',pg_temp.d(-3),'عالي',false,'',NULL),
  -- ⭐ Cancelled AUTOMATICALLY by the universal hearing-result cancellation
  --   (147679c). Wording matches exactly what cancelActiveCaseMemos now writes,
  --   so the banner text can be verified against a real cancellation.
  ('T_memo_13','T_case_19','مذكرة_جوابية','مذكرة جوابية — قضية T-2019','ملغاة','تحرير',
     'T_u_fahd',NULL,'system',pg_temp.d(-7),'عالي',true,'موعد_جديد_مع_رد',
     'أُلغيت تلقائياً بسبب صدور حكم في القضية'),
  ('T_memo_14','T_case_06','تحرير_دعوى','صحيفة دعوى — قضية T-2006','قيد_المراجعة','مراجعة_داخلية',
     'T_u_fahd','T_u_maha','1',pg_temp.d(6),'عالي',false,'',NULL);

-- memo_activity_log rows for the two cancellations, so the banner shows
-- who/when alongside the reason (the transaction cancelMemo writes both).
INSERT INTO memo_activity_log (id, memo_id, activity_type, description, metadata, performed_by, performed_at) VALUES
  ('T_mal_01','T_memo_10','cancelled',
     'تم إلغاء المذكرة — السبب: لا يحتاج الملف مذكرة — تم الرد شفهياً في الجلسة',
     '{"reason":"لا يحتاج الملف مذكرة — تم الرد شفهياً في الجلسة"}'::jsonb,
     'T_u_ahmed',(CURRENT_DATE - 8)::timestamp),
  ('T_mal_02','T_memo_13','cancelled',
     'تم إلغاء المذكرة — السبب: أُلغيت تلقائياً بسبب صدور حكم في القضية',
     '{"reason":"أُلغيت تلقائياً بسبب صدور حكم في القضية"}'::jsonb,
     'T_u_fahd',(CURRENT_DATE - 6)::timestamp);

-- ---- 6b. active_memo_count reconciliation ---------------------------------
-- The column is DENORMALIZED and nothing recomputes it on read, so it is set
-- from the memos actually inserted rather than hand-typed above. "Active" =
-- not معتمدة / مرفوعة / ملغاة — the same ACTIVE_MEMO_STATUSES the server uses.
UPDATE law_cases c
SET active_memo_count = COALESCE((
  SELECT count(*) FROM memos m
  WHERE m.case_id = c.id
    AND m.status NOT IN ('معتمدة','مرفوعة','ملغاة')
), 0)
WHERE c.id LIKE 'T\_case\_%';

-- ============================================================================
-- 7. CONTRACTS — all 8 ContractStage values + the follow-up cycles.
-- Department 5 (العقود والمشاريع) owns the module; two rows sit in depts 1/2 to
-- exercise department scoping.
-- ============================================================================
INSERT INTO contracts (id, contract_number, title, client_id, contract_type, current_stage, status,
                       department_id, assigned_to, internal_reviewer_id, priority, description,
                       awaiting_completion, saved_stage, paused_at, pause_reason, paused_by,
                       follow_up_count, follow_up_started_at, closed_at, created_by) VALUES
  ('T_ct_01','T-CT-2001','مراجعة عقد توريد معدات','T_cl_2','مراجعة_عقد','استلام','active',
     '5',NULL,NULL,NULL,'مراجعة بنود عقد التوريد السنوي',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_02','T-CT-2002','صياغة عقد شراكة','T_cl_4','صياغة_عقد','استكمال_البيانات_والمرفقات','active',
     '5','T_u_sara',NULL,'غير_عاجلة','ينقص السجل التجاري للطرف الثاني',true,'تحرير',NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_03','T-CT-2003','عقد إيجار مقر إداري','T_cl_7','صياغة_عقد','تحرير','active',
     '5','T_u_sara',NULL,'عاجلة','صياغة عقد إيجار لمدة ٣ سنوات',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_04','T-CT-2004','مراجعة عقد مقاولة','T_cl_10','مراجعة_عقد','مراجعة_داخلية','active',
     '5','T_u_khaled','T_u_ahmed','عاجلة','مراجعة داخلية قبل الإحالة للجنة',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  -- committee stage → skip-committee testable (contracts use the same 3 roles,
  -- with department_head scoped to the contract's OWN departmentId).
  ('T_ct_05','T-CT-2005','مشروع تطوير عقود الموارد البشرية','T_cl_13','مشروع','لجنة_مراجعة','active',
     '5','T_u_maha','T_u_fahd','عاجلة','حزمة عقود موظفين',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_06','T-CT-2006','عقد خدمات استشارية','T_cl_1','صياغة_عقد','الأخذ_بالملاحظات','active',
     '5','T_u_ahmed','T_u_khaled','غير_عاجلة','تعديلات اللجنة',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_07','T-CT-2007','عقد توريد برمجيات','T_cl_3','مراجعة_عقد','جاهزة_للإرسال','active',
     '5','T_u_ahmed',NULL,'غير_عاجلة','جاهز للإرسال للعميل',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  -- ⭐ CLOSED with follow_up_count = 0 → the row that is READY for a first
  --    استشارة تعقيبية (the 3-stage mini-flow, d7411e9/c26f317).
  ('T_ct_08','T-CT-2008','عقد بيع أصول','T_cl_5','مراجعة_عقد','مغلقة','closed',
     '5','T_u_sara',NULL,'غير_عاجلة','أُرسل للعميل واعتُمد',false,NULL,NULL,NULL,NULL,
     0,NULL,(CURRENT_DATE - 30)::timestamp,'1'),
  -- ⭐ Mid-FOLLOW-UP: reopened once → the list-row cycle badge (a63d222) shows.
  ('T_ct_09','T-CT-2009','عقد امتياز تجاري','T_cl_11','صياغة_عقد','تحرير','active',
     '5','T_u_khaled',NULL,'عاجلة','تعقيب العميل على بند الحصرية',false,NULL,NULL,NULL,NULL,
     1,(CURRENT_DATE - 4)::timestamp,NULL,'1'),
  ('T_ct_10','T-CT-2010','عقد استشارات قانونية','T_cl_8','مراجعة_عقد','لجنة_مراجعة','active',
     '1','T_u_ahmed','T_u_sara','عاجلة','عقد تابع لقسم عام لاختبار نطاق القسم',false,NULL,NULL,NULL,NULL,0,NULL,NULL,'1'),
  ('T_ct_11','T-CT-2011','عقد وكالة تجارية','T_cl_9','صياغة_عقد','تحرير','active',
     '2','T_u_fahd',NULL,'غير_عاجلة','موقوف بانتظار مستندات العميل',false,NULL,
     (CURRENT_DATE - 6)::timestamp,'بانتظار مستندات الطرف الثاني','T_u_fahd',0,NULL,NULL,'1'),
  -- Multi-cycle follow-up (count = 2) → badge shows the second round.
  ('T_ct_12','T-CT-2012','عقد صيانة سنوي','T_cl_14','مراجعة_عقد','مغلقة','closed',
     '5','T_u_maha',NULL,'غير_عاجلة','دورتا تعقيب مكتملتان',false,NULL,NULL,NULL,NULL,
     2,(CURRENT_DATE - 50)::timestamp,(CURRENT_DATE - 15)::timestamp,'1');

-- ============================================================================
-- 8. CONSULTATIONS — all stages, all three types, both follow-up states.
-- ⚠ SENTINEL: consultations.assigned_to IS NULLABLE — unassigned is NULL here
--   (the exact opposite of memos.assigned_to). Do not "harmonise" them.
-- ============================================================================
INSERT INTO consultations (id, consultation_number, client_id, consultation_type, current_stage, status,
                           department_id, assigned_to, internal_reviewer_id, question_summary, response,
                           category, source, priority, closure_reason, awaiting_completion, saved_stage,
                           follow_up_count, follow_up_started_at, expected_delivery_date, closed_at,
                           created_by) VALUES
  ('T_con_01','T-CON-2001','T_cl_1','مكتوبة','استلام','active',
     '1',NULL,NULL,'ما هي الإجراءات النظامية لفسخ عقد إيجار تجاري؟','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 5)::timestamp,NULL,'1'),
  ('T_con_02','T-CON-2002','T_cl_3','مكتوبة','استكمال_المرفقات_والبيانات','active',
     '1','T_u_ahmed',NULL,'استفسار عن التزامات الشريك المتضامن','','عادية','عبر_المجموعة',
     NULL,NULL,true,'دراسة',0,NULL,(CURRENT_DATE + 3)::timestamp,NULL,'1'),
  ('T_con_03','T-CON-2003','T_cl_6','مكتوبة','دراسة','active',
     '1','T_u_sara',NULL,'مدى نظامية شرط عدم المنافسة لمدة سنتين','','سريعة','على_الخاص',
     'عاجلة',NULL,false,NULL,0,NULL,(CURRENT_DATE + 1)::timestamp,NULL,'1'),
  ('T_con_04','T-CON-2004','T_cl_2','مكتوبة','تحرير','active',
     '2','T_u_fahd',NULL,'الآثار النظامية لتأخر تسليم المشروع','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 4)::timestamp,NULL,'1'),
  ('T_con_05','T-CON-2005','T_cl_4','مكتوبة','مراجعة_داخلية','active',
     '2','T_u_maha','T_u_fahd','حدود مسؤولية مجلس الإدارة','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 2)::timestamp,NULL,'1'),
  -- committee stage → skip-committee testable.
  ('T_con_06','T-CON-2006','T_cl_7','مكتوبة','لجنة_مراجعة','active',
     '2','T_u_fahd','T_u_maha','تكييف العلاقة التعاقدية مع مقدمي الخدمة','','سريعة','عبر_المجموعة',
     'عاجلة',NULL,false,NULL,0,NULL,(CURRENT_DATE + 1)::timestamp,NULL,'1'),
  ('T_con_07','T-CON-2007','T_cl_8','مكتوبة','الأخذ_بالملاحظات','active',
     '1','T_u_khaled','T_u_ahmed','صياغة بند التحكيم','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 6)::timestamp,NULL,'1'),
  ('T_con_08','T-CON-2008','T_cl_9','مكتوبة','جاهزة_للإرسال','active',
     '1','T_u_ahmed',NULL,'أثر القوة القاهرة على التزامات المورد',
     'تمت الإجابة تفصيلاً في المرفق','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE - 1)::timestamp,NULL,'1'),
  ('T_con_09','T-CON-2009','T_cl_10','مكتوبة','منجزة','closed',
     '2','T_u_maha',NULL,'شروط نقل ملكية الحصص','تم تسليم الرأي القانوني','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE - 10)::timestamp,(CURRENT_DATE - 9)::timestamp,'1'),
  ('T_con_10','T-CON-2010','T_cl_11','هاتفية','جاري_العمل','active',
     '1','T_u_sara',NULL,'استفسار هاتفي عن مهلة الاعتراض على الحكم','','عادية','على_الخاص',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 1)::timestamp,NULL,'1'),
  -- ⭐ CLOSED with follow_up_count = 0 → ready for a first استشارة تعقيبية.
  ('T_con_11','T-CON-2011','T_cl_12','هاتفية','مغلقة','closed',
     '1','T_u_khaled',NULL,'استشارة هاتفية حول عقود العمل المؤقتة','تمت الإجابة شفهياً','عادية','على_الخاص',
     NULL,'answered_verbally',false,NULL,0,NULL,(CURRENT_DATE - 20)::timestamp,(CURRENT_DATE - 20)::timestamp,'1'),
  -- ⭐ Mid-FOLLOW-UP (count = 1) → 3-stage mini-flow + list-row cycle badge.
  ('T_con_12','T-CON-2012','T_cl_13','إجرائية','جاري_العمل','active',
     '2','T_u_fahd',NULL,'متابعة إجراءات قيد العلامة التجارية','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,1,(CURRENT_DATE - 3)::timestamp,(CURRENT_DATE + 2)::timestamp,NULL,'1'),
  -- ⚠ UNASSIGNED → NULL (nullable column; the memo sentinel '' would be wrong).
  ('T_con_13','T-CON-2013','T_cl_15','مكتوبة','استلام','active',
     '3',NULL,NULL,'حقوق العامل عند إنهاء العقد لأسباب اقتصادية','','عادية','عبر_المجموعة',
     NULL,NULL,false,NULL,0,NULL,(CURRENT_DATE + 5)::timestamp,NULL,'1'),
  ('T_con_14','T-CON-2014','T_cl_14','إجرائية','مغلقة','closed',
     '4',NULL,NULL,'إجراءات التظلم أمام الجهة الإدارية','','عادية','عبر_المجموعة',
     NULL,'no_longer_needed',false,NULL,0,NULL,(CURRENT_DATE - 25)::timestamp,(CURRENT_DATE - 24)::timestamp,'1');

-- One delivery extension so that table isn't empty. Column names are
-- old_expected_delivery_date / new_expected_delivery_date / extended_by /
-- extended_at (NOT previous_/new_/requested_*).
INSERT INTO consultation_delivery_extensions
  (id, consultation_id, old_expected_delivery_date, new_expected_delivery_date,
   reason, extended_by, extended_at) VALUES
  ('T_cde_01','T_con_04',(CURRENT_DATE + 1)::timestamp,(CURRENT_DATE + 4)::timestamp,
   'بانتظار مستند إضافي من العميل','T_u_fahd',(CURRENT_DATE - 2)::timestamp);

-- ============================================================================
-- 9. FIELD TASKS — collection / execution routing + the generic kinds.
-- Assignees come from admin_support_task_assignments in the real flow; the
-- wipe KEEPS that table, so these mirror a plausible resolved assignment.
-- ============================================================================
INSERT INTO field_tasks (id, title, description, task_type, case_id, consultation_id, contract_id,
                         assigned_to, assigned_by, status, priority, due_date, completed_at) VALUES
  -- ⭐ FINAL judgment لصالحنا → collection AND execution, both pending.
  ('T_ft_01','إعداد خطاب تحصيل — قضية رقم T-2023','صدر حكم نهائي لصالحنا - يرجى إعداد خطاب تحصيل',
     'متابعة_محكمة','T_case_23',NULL,NULL,'T_u_turki','1','قيد_الانتظار','عاجل',pg_temp.d(4),NULL),
  ('T_ft_02','رفع طلب تنفيذ — قضية رقم T-2023','صدر حكم نهائي لصالحنا - يرجى رفع طلب تنفيذ في محكمة التنفيذ',
     'متابعة_محكمة','T_case_23',NULL,NULL,'T_u_turki','1','قيد_الانتظار','عاجل',pg_temp.d(4),NULL),
  -- ⭐ FINAL judgment جزئي → collection ONLY (no execution).
  ('T_ft_03','إعداد خطاب تحصيل — قضية رقم T-2024','صدر حكم نهائي جزئي - يرجى إعداد خطاب تحصيل',
     'متابعة_محكمة','T_case_24',NULL,NULL,'T_u_majed','1','قيد_الانتظار','عاجل',pg_temp.d(2),NULL),
  -- Both complete → this is WHY T_case_26 closed with تم_التحصيل.
  ('T_ft_04','إعداد خطاب تحصيل — قضية رقم T-2026','',
     'متابعة_محكمة','T_case_26',NULL,NULL,'T_u_turki','1','مكتمل','عاجل',pg_temp.d(-210),(CURRENT_DATE - 205)::timestamp),
  ('T_ft_05','رفع طلب تنفيذ — قضية رقم T-2026','',
     'متابعة_محكمة','T_case_26',NULL,NULL,'T_u_turki','1','مكتمل','عاجل',pg_temp.d(-208),(CURRENT_DATE - 201)::timestamp),
  -- The D3 recurring ناجز follow-up (matched BY TITLE SUBSTRING by the scheduler).
  ('T_ft_06','التأكد من حالة الطلب في ناجز — قضية T-2005','متابعة حالة الطلب في منصة ناجز',
     'متابعة_محكمة','T_case_05',NULL,NULL,'T_u_ahmed','1','قيد_الانتظار','عالي',pg_temp.d(1),NULL),
  -- ⚠ UNASSIGNED field task → '' (the dept/manager pool), never NULL.
  ('T_ft_07','مراجعة ميدانية لموقع المشروع','',
     'مراجعة_ميدانية','T_case_02',NULL,NULL,'','1','قيد_الانتظار','متوسط',pg_temp.d(7),NULL),
  -- General (عام) task linked to a CONTRACT.
  ('T_ft_08','تجهيز نسخ العقد للتوقيع','طباعة وتجهيز ٣ نسخ',
     'عام',NULL,NULL,'T_ct_03','T_u_majed','1','قيد_التنفيذ','متوسط',pg_temp.d(3),NULL),
  ('T_ft_09','زيارة العميل لتوقيع التسوية','',
     'زيارة_عميل','T_case_10',NULL,NULL,'T_u_saleh','1','قيد_الانتظار','عالي',pg_temp.d(5),NULL),
  ('T_ft_10','تسليم مستندات للمحكمة','',
     'تسليم_مستندات','T_case_18',NULL,NULL,'T_u_reem','1','قيد_التنفيذ','عاجل',pg_temp.d(1),NULL),
  -- Linked to a CONSULTATION.
  ('T_ft_11','استخراج صك ملكية للاستشارة','',
     'أخرى',NULL,'T_con_03',NULL,'T_u_reem','1','قيد_الانتظار','متوسط',pg_temp.d(6),NULL);

-- A general-task activity thread row (the table the old wipe scripts miss).
INSERT INTO general_task_events (id, field_task_id, actor_id, actor_name, event_type, body, created_at) VALUES
  ('T_gte_01','T_ft_08','T_u_majed','ماجد الرشيدي','started','تم البدء في التجهيز',(CURRENT_DATE - 1)::timestamp);

-- ============================================================================
-- 10. LEGAL DEADLINES — the objection windows are the point here.
-- ============================================================================
INSERT INTO legal_deadlines (id, case_id, hearing_id, deadline_type, title, start_date,
                             duration_days, deadline_date, status) VALUES
  ('T_ld_01','T_case_20','T_h_06','objection','مهلة الاعتراض على الحكم الابتدائي',
     pg_temp.d(-12),30,pg_temp.d(18),'نشط'),
  ('T_ld_02','T_case_21','T_h_07','objection','مهلة الاعتراض — قضاء مستعجل',
     pg_temp.d(-5),10,pg_temp.d(5),'نشط'),
  -- Already overdue → surfaces as an overdue legal_deadline task.
  ('T_ld_03','T_case_18','T_h_04','submission','موعد تقديم المذكرة الجوابية',
     pg_temp.d(-10),7,pg_temp.d(-3),'نشط');

-- ============================================================================
-- 11. CONTACT LOGS (regenerated after the wipe removed the stale set)
-- ============================================================================
INSERT INTO contact_logs (id, client_id, contact_type, contact_date, next_follow_up_date,
                          follow_up_status, follow_up_required, follow_up_completed, case_id, created_by) VALUES
  ('T_co_01','T_cl_1','اتصال_هاتفي',pg_temp.d(-1),pg_temp.d(0), 'بانتظار_المتابعة',true, false,'T_case_17','T_u_ahmed'),
  ('T_co_02','T_cl_12','واتساب',    pg_temp.d(-4),pg_temp.d(-1),'بانتظار_المتابعة',true, false,'T_case_10','T_u_saleh'),
  ('T_co_03','T_cl_2','زيارة_شخصية',pg_temp.d(-2),pg_temp.d(3), 'بانتظار_المتابعة',true, false,'T_case_20','T_u_maha'),
  ('T_co_04','T_cl_5','اتصال_هاتفي',pg_temp.d(-9),NULL,          'تمت_المتابعة',false,true, NULL,      'T_u_sara');

-- ============================================================================
-- 12. CASE ACTIVITY LOG — a few rows so detail timelines aren't blank.
-- action_type is FREE TEXT (no migration for new kinds), which is why the two
-- memo-cancellation types below can coexist.
-- ============================================================================
INSERT INTO case_activity_log (id, case_id, user_id, user_name, action_type, title, details,
                               previous_value, new_value, related_entity_type, related_entity_id, created_at) VALUES
  ('T_cal_01','T_case_19','T_u_fahd','فهد الغامدي','hearing_result_recorded',
     'تم تسجيل نتيجة الجلسة: حكم',NULL,NULL,NULL,'hearing','T_h_05',(CURRENT_DATE - 6)::timestamp),
  -- ⭐ The judgment-cause memo cancellation (universal block, 147679c).
  ('T_cal_02','T_case_19','T_u_fahd','فهد الغامدي','memos_cancelled_on_judgment',
     'إلغاء 1 مذكرة بعد صدور الحكم','أُلغيت تلقائياً بسبب صدور حكم في القضية — اللائحة الاعتراضية مستثناة',
     NULL,NULL,'hearing','T_h_05',(CURRENT_DATE - 6)::timestamp),
  -- ⭐ The other-result cause, so both wordings exist in the data.
  ('T_cal_03','T_case_17','T_u_ahmed','أحمد العتيبي','memos_cancelled_on_hearing_result',
     'إلغاء 1 مذكرة بعد تسجيل نتيجة الجلسة','أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة — اللائحة الاعتراضية مستثناة',
     NULL,NULL,'hearing','T_h_02',(CURRENT_DATE - 20)::timestamp),
  ('T_cal_04','T_case_20','T_u_maha','مها الزهراني','judgment_deed_received',
     'تم تسجيل استلام الصك','مهلة الاعتراض ٣٠ يوماً من تاريخ الاستلام',
     NULL,NULL,'case','T_case_20',(CURRENT_DATE - 12)::timestamp),
  ('T_cal_05','T_case_22','T_u_fahd','فهد الغامدي','stage_changed',
     'انتقلت القضية إلى منظورة استئناف برفع اللائحة الاعتراضية',NULL,
     'محكوم_حكم_ابتدائي','منظورة_استئناف','memo','T_memo_06',(CURRENT_DATE - 25)::timestamp),
  ('T_cal_06','T_case_25','system','النظام','case_closed',
     'إغلاق تلقائي — حكم نهائي ضدنا',NULL,'محكوم_حكم_نهائي','مقفلة',
     'hearing','T_h_12',(CURRENT_DATE - 40)::timestamp);

COMMIT;

-- ============================================================================
-- POST-SEED VERIFICATION
-- ============================================================================
SELECT 'law_cases'     AS entity, count(*) AS rows FROM law_cases     WHERE id LIKE 'T\_case\_%'
UNION ALL SELECT 'hearings',      count(*) FROM hearings      WHERE id LIKE 'T\_h\_%'
UNION ALL SELECT 'memos',         count(*) FROM memos         WHERE id LIKE 'T\_memo\_%'
UNION ALL SELECT 'contracts',     count(*) FROM contracts     WHERE id LIKE 'T\_ct\_%'
UNION ALL SELECT 'consultations', count(*) FROM consultations WHERE id LIKE 'T\_con\_%'
UNION ALL SELECT 'field_tasks',   count(*) FROM field_tasks   WHERE id LIKE 'T\_ft\_%'
UNION ALL SELECT 'legal_deadlines',count(*) FROM legal_deadlines WHERE id LIKE 'T\_ld\_%'
UNION ALL SELECT 'contact_logs',  count(*) FROM contact_logs  WHERE id LIKE 'T\_co\_%'
UNION ALL SELECT 'case_activity_log', count(*) FROM case_activity_log WHERE id LIKE 'T\_cal\_%'
UNION ALL SELECT 'new users',      count(*) FROM users
  WHERE id IN ('T_u_hind','T_u_faisal','T_u_lama','T_u_saleh');
-- Expect: 30 / 16 / 14 / 12 / 14 / 11 / 3 / 4 / 6 / 4

-- Dept-head coverage — the gate resolves on (role, department_id), so every
-- department that owns seeded rows must return EXACTLY ONE active head.
-- ⚠ A count of 0 means those dept-scoped gates are untestable; >1 blocks the
-- general-task dept-routing path outright (routes.ts refuses to guess).
SELECT d.id, d.name,
       count(u.id) FILTER (WHERE u.role = 'department_head' AND u.is_active) AS active_heads,
       count(u.id) FILTER (WHERE u.role = 'employee'        AND u.is_active) AS active_employees,
       d.head_id
FROM departments d
LEFT JOIN users u ON u.department_id = d.id
WHERE d.id IN ('1','2','3','4','5')
GROUP BY d.id, d.name, d.head_id
ORDER BY d.id;
-- Expect active_heads = 1 for every one of 1,2,3,4,5.

-- COVERAGE ASSERTIONS — each must return at least one row.
SELECT 'depts covered'      AS check, string_agg(DISTINCT department_id, ',' ORDER BY department_id) AS value FROM law_cases WHERE id LIKE 'T\_case\_%'
UNION ALL SELECT 'judgment stages', string_agg(DISTINCT current_stage, ', ') FROM law_cases
  WHERE current_stage IN ('منظورة','محكوم_حكم_ابتدائي','منظورة_استئناف','محكوم_حكم_نهائي','مقفلة','مشطوبة','تحصيل')
UNION ALL SELECT 'client roles',   string_agg(DISTINCT COALESCE(client_role,'(null)'), ', ') FROM law_cases WHERE id LIKE 'T\_case\_%'
UNION ALL SELECT 'settlement nums',count(*)::text FROM law_cases WHERE mohr_number IS NOT NULL OR taradi_number IS NOT NULL
UNION ALL SELECT 'awaiting deed',  count(*)::text FROM law_cases WHERE current_stage='محكوم_حكم_ابتدائي' AND judgment_deed_received_date IS NULL
UNION ALL SELECT 'deed received',  count(*)::text FROM law_cases WHERE current_stage='محكوم_حكم_ابتدائي' AND judgment_deed_received_date IS NOT NULL
UNION ALL SELECT 'active objection memos', count(*)::text FROM memos WHERE memo_type='لائحة_اعتراضية' AND status NOT IN ('معتمدة','مرفوعة','ملغاة')
UNION ALL SELECT 'cases w/ empty stage_history', count(*)::text FROM law_cases WHERE id LIKE 'T\_case\_%' AND jsonb_array_length(COALESCE(stage_history,'[]'::jsonb)) = 0;
-- The LAST line must be 0 — an empty stage_history is the bug this seed exists to fix.
