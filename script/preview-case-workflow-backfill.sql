-- READ ONLY. Run only after add-case-workflow.sql, when separately authorized.
-- No UPDATE statement. Transfer history is conservatively held for human review.
WITH paths(department_name, proposed_workflow, compatible_stages) AS (
 VALUES
  ('عام', 'general', ARRAY['استلام', 'استكمال_البيانات', 'دراسة', 'مراجعة_داخلية', 'إحالة_للجنة_المراجعة', 'الأخذ_بالملاحظات', 'جاهزة_للرفع', 'قيد_التدقيق_في_ناجز', 'مداولة_الصلح', 'أغلق_طلب_الصلح', 'منظورة', 'تحصيل', 'محكوم_حكم_ابتدائي', 'محكوم_حكم_نهائي', 'منظورة_استئناف', 'مشطوبة', 'مقفلة']::text[]),
  ('تجاري', 'commercial', ARRAY['استلام', 'استكمال_البيانات', 'دراسة', 'مراجعة_داخلية', 'إحالة_للجنة_المراجعة', 'الأخذ_بالملاحظات', 'جاهزة_للرفع', 'قيد_التدقيق_في_تراضي', 'مداولة_الصلح', 'أغلق_طلب_الصلح', 'قيد_التدقيق_في_ناجز', 'منظورة', 'تحصيل', 'محكوم_حكم_ابتدائي', 'محكوم_حكم_نهائي', 'منظورة_استئناف', 'مشطوبة', 'مقفلة']::text[]),
  ('عمالي', 'labor', ARRAY['استلام', 'استكمال_البيانات', 'دراسة', 'توجيه_العميل_بالتسوية', 'بانتظار_رفع_العميل_للتسوية', 'مداولة_الصلح', 'أغلق_طلب_الصلح', 'تحرير_صحيفة_الدعوى', 'مراجعة_داخلية', 'جاهزة_للرفع', 'قيد_التدقيق_في_ناجز', 'منظورة', 'تحصيل', 'محكوم_حكم_ابتدائي', 'محكوم_حكم_نهائي', 'منظورة_استئناف', 'مشطوبة', 'مقفلة']::text[]),
  ('إداري', 'administrative', ARRAY['استلام', 'استكمال_البيانات', 'دراسة', 'مراجعة_داخلية', 'إحالة_للجنة_المراجعة', 'الأخذ_بالملاحظات', 'جاهزة_للرفع', 'قيد_التدقيق_في_معين', 'منظورة', 'مداولة_الصلح', 'تحصيل', 'محكوم_حكم_ابتدائي', 'محكوم_حكم_نهائي', 'منظورة_استئناف', 'مشطوبة', 'مقفلة', 'تحرير_صيغة_التظلم']::text[])
), assessed AS (
 SELECT c.id, c.case_number, c.department_id, d.name AS department_name,
        c.case_workflow, c.case_classification, c.current_stage, c.admin_case_sub_type,
        p.proposed_workflow,
        CASE
          WHEN c.case_workflow IS NOT NULL AND c.case_workflow NOT IN ('general', 'commercial', 'labor', 'administrative') THEN 'review_invalid_explicit_workflow'
          WHEN c.case_workflow IS NOT NULL THEN 'already_explicit'
          WHEN c.department_id IS NULL THEN 'review_null_department'
          WHEN c.department_id = 'أخرى' OR d.name = 'أخرى' THEN 'review_other_department'
          WHEN p.proposed_workflow IS NULL THEN 'review_unknown_department'
          WHEN c.case_classification NOT IN ('قيد_الدراسة', 'منظورة_بالمحكمة') THEN 'review_classification'
          WHEN c.stage_history IS NOT NULL AND jsonb_typeof(c.stage_history) <> 'array' THEN 'review_malformed_history'
          WHEN EXISTS (SELECT 1 FROM public.case_activity_log a WHERE a.case_id = c.id
                       AND a.action_type IN ('department_transferred', 'jurisdiction_transferred')) THEN 'review_transfer_history'
          WHEN c.case_classification = 'منظورة_بالمحكمة' AND COALESCE(c.is_settlement_case, false)
               AND c.current_stage NOT IN ('استلام', 'مداولة_الصلح', 'تحصيل', 'مقفلة') THEN 'review_settlement_only_stage'
          WHEN c.case_classification = 'منظورة_بالمحكمة' AND NOT COALESCE(c.is_settlement_case, false)
               AND c.current_stage NOT IN ('استلام', 'استكمال_البيانات', 'دراسة', 'منظورة', 'منظورة_استئناف', 'محكوم_حكم_ابتدائي', 'محكوم_حكم_نهائي', 'تحصيل', 'مشطوبة', 'مقفلة') THEN 'review_in_court_stage'
          WHEN p.proposed_workflow = 'administrative' AND c.case_classification = 'قيد_الدراسة'
               AND c.admin_case_sub_type = 'تظلم' AND c.current_stage = 'دراسة' THEN 'review_grievance_stage'
          WHEN c.current_stage <> ALL(p.compatible_stages) THEN 'review_current_stage'
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END) h
            WHERE h->>'stage' IS NULL OR h->>'stage' <> ALL(p.compatible_stages)
               OR COALESCE(h->>'notes', '') LIKE '%تحويل%'
               OR COALESCE(h->>'notes', '') LIKE '%اختصاص%'
          ) THEN 'review_conflicting_history'
          WHEN p.proposed_workflow = 'administrative' AND NOT COALESCE(c.is_settlement_case, false)
               AND (c.current_stage = 'مداولة_الصلح' OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END) h
                 WHERE h->>'stage' = 'مداولة_الصلح')) THEN 'review_admin_settlement_history'
          WHEN p.proposed_workflow = 'administrative' AND c.admin_case_sub_type = 'تظلم'
               AND (c.current_stage IN ('قيد_التدقيق_في_معين', 'إحالة_للجنة_المراجعة', 'الأخذ_بالملاحظات')
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END) h
                               WHERE h->>'stage' IN ('قيد_التدقيق_في_معين', 'إحالة_للجنة_المراجعة', 'الأخذ_بالملاحظات'))) THEN 'review_admin_subpath_history'
          WHEN p.proposed_workflow = 'administrative' AND c.admin_case_sub_type = 'قضية'
               AND (c.current_stage = 'تحرير_صيغة_التظلم'
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END) h
                               WHERE h->>'stage' = 'تحرير_صيغة_التظلم')) THEN 'review_admin_subpath_history'
          WHEN p.proposed_workflow <> 'administrative' AND NULLIF(c.admin_case_sub_type, '') IS NOT NULL THEN 'review_admin_subtype_conflict'
          WHEN p.proposed_workflow = 'administrative' AND c.admin_case_sub_type IS NOT NULL
               AND c.admin_case_sub_type NOT IN ('تظلم', 'قضية') THEN 'review_admin_subtype'
          WHEN p.proposed_workflow = 'administrative' AND c.case_classification = 'قيد_الدراسة'
               AND c.admin_case_sub_type IS NULL AND (c.current_stage <> 'استلام' OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END) h
                 WHERE h->>'stage' <> 'استلام')) THEN 'review_unresolved_admin_path'
          ELSE 'candidate_preserves_department_behavior'
        END AS assessment
 FROM public.law_cases c
 LEFT JOIN public.departments d ON d.id = c.department_id
 LEFT JOIN paths p ON p.department_name = d.name
)
SELECT *, CASE WHEN assessment = 'candidate_preserves_department_behavior' THEN proposed_workflow ELSE NULL END AS backfill_candidate
FROM assessed
ORDER BY assessment, case_number;
