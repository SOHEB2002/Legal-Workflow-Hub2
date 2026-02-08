# تعليمات تحديث Legal Workflow Hub
## Instructions for Replit Agent

### ملخص التحديثات / Summary of Updates
This update adds a comprehensive hearing workflow system, security improvements (bcrypt + JWT), and database performance indexes to the Legal Workflow Hub application.

---

## Step 1: Replace/Add These Files (بالترتيب)

### ملفات جديدة (New Files - Create these):
1. **`server/auth.ts`** — JWT + bcrypt authentication module (NEW FILE)
2. **`server/migrate-indexes.sql`** — Database performance indexes (NEW FILE)

### ملفات محدّثة (Updated Files - Replace existing):
3. **`shared/schema.ts`** — Added new hearing workflow fields (judgmentSide, judgmentFinal, objectionFeasible, objectionDeadline, objectionStatus, hearingReport, recommendations, nextSteps, contactCompleted, reportCompleted, adminTasksCreated, opponentMemos, hearingMinutes)
4. **`server/storage.ts`** — Updated createHearing with all new field defaults + bcrypt password hashing in createUser and initializeDefaultData
5. **`server/routes.ts`** — Added 3 new API endpoints: POST /api/hearings/:id/result, POST /api/hearings/:id/report, POST /api/hearings/:id/close
6. **`server/index.ts`** — Added import for authMiddleware from "./auth"
7. **`client/src/lib/hearings-context.tsx`** — Complete rewrite: changed from localStorage to API-based using apiRequest/fetch. New methods: submitResult, submitReport, closeHearing
8. **`client/src/pages/hearings.tsx`** — Complete rewrite with advanced workflow UI: result dialog (تأجيل/حكم/شطب/صلح), report dialog, details dialog with tabs, close hearing validation
9. **`package.json`** — Added dependencies: bcrypt ^5.1.1, jsonwebtoken ^9.1.2, @types/bcrypt ^5.0.2, @types/jsonwebtoken ^9.0.7

---

## Step 2: Install New Dependencies
```bash
npm install
```

## Step 3: Push Database Schema Changes
```bash
npm run db:push
```

## Step 4: Run Database Indexes Migration
```bash
# Connect to your PostgreSQL database and run:
psql $DATABASE_URL -f server/migrate-indexes.sql
```

## Step 5: Restart the Application
The app should auto-restart after file changes. If not:
```bash
npm run dev
```

---

## ⚠️ Important Notes / ملاحظات مهمة

### Password Migration (هام جداً)
After this update, passwords are hashed with bcrypt. **Existing plain-text passwords in the database will NOT work anymore.**

To fix this, you need to either:

**Option A: Reset default data** (recommended for dev/staging)
- Delete all users from the database
- Restart the app — it will recreate default users with hashed passwords

**Option B: Hash existing passwords manually**
Run this in the Replit Shell:
```bash
node -e "
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function hashPasswords() {
  const result = await pool.query('SELECT id, password FROM users');
  for (const user of result.rows) {
    // Skip if already hashed (bcrypt hashes start with \$2b\$)
    if (user.password.startsWith('\$2b\$')) continue;
    const hashed = await bcrypt.hash(user.password, 12);
    await pool.query('UPDATE users SET password = \$1 WHERE id = \$2', [hashed, user.id]);
    console.log('Hashed password for user:', user.id);
  }
  console.log('Done!');
  pool.end();
}
hashPasswords();
"
```

### JWT Secret
Set a secure JWT_SECRET environment variable in Replit Secrets:
- Key: `JWT_SECRET`
- Value: (any secure random string, e.g., generate one with `openssl rand -hex 32`)

If not set, it defaults to a development secret which is NOT secure for production.

---

## التحسينات المُنفَّذة بالتفصيل

### 1. سير عمل الجلسات (Hearing Workflow)
- **تسجيل النتيجة**: تأجيل (مع تاريخ الجلسة القادمة) / حكم (لصالحنا/ضدنا × نهائي/غير نهائي) / شطب / صلح
- **إنشاء مهام تلقائية**: عند التأجيل → مهمة متابعة يومية. عند حكم غير نهائي ضدنا → مهمة اعتراض
- **التقرير**: تقرير الجلسة + توصيات + الخطوات القادمة + تأكيد التواصل مع العميل
- **إغلاق الجلسة**: فقط بعد اكتمال التقرير والتواصل مع العميل

### 2. الأمان (Security)
- **bcrypt**: تشفير كلمات المرور بـ 12 salt rounds
- **JWT**: توثيق بـ JSON Web Token (صلاحية 24 ساعة)
- **Auth Middleware**: حماية جميع الـ API endpoints (ما عدا /api/auth/login)

### 3. الأداء (Performance)
- **13 فهرس قاعدة بيانات**: على الجداول الأكثر استخداماً (hearings, field_tasks, law_cases, consultations, notifications, contact_logs)

### 4. واجهة المستخدم (UI/UX)
- **نافذة تسجيل النتيجة المتقدمة**: حقول شرطية حسب نوع النتيجة
- **نافذة التقرير**: حقول التقرير والتوصيات وتأكيد التواصل
- **نافذة التفاصيل**: 3 تبويبات (النتيجة، التقرير، معلومات)
- **أعمدة جديدة في الجدول**: النتيجة (مع شارة) + التقرير (حالة)
- **أزرار إجراء جديدة**: تسجيل نتيجة + كتابة تقرير + عرض تفاصيل + إلغاء
