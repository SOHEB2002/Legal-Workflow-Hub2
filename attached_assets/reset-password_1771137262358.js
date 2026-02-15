// سكربت إعادة تعيين كلمة المرور - شغله في Replit Shell بالأمر:
// node reset-password.js

const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetPassword() {
  // ============ غير هذه القيم حسب حاجتك ============
  const USERNAME = "manager";          // اسم المستخدم
  const NEW_PASSWORD = "123456";        // كلمة المرور الجديدة
  // ==================================================

  try {
    // 1. شوف المستخدم الحالي
    const userResult = await pool.query(
      "SELECT id, username, password, is_active FROM users WHERE username = $1",
      [USERNAME]
    );

    if (userResult.rows.length === 0) {
      console.log("❌ المستخدم غير موجود:", USERNAME);
      console.log("\nالمستخدمين الموجودين:");
      const all = await pool.query("SELECT username, name, role, is_active FROM users");
      all.rows.forEach(u => console.log(`  - ${u.username} (${u.name}) [${u.role}] active=${u.is_active}`));
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log("✅ تم العثور على المستخدم:", user.username);
    console.log("   الحالة:", user.is_active ? "فعال" : "⚠️ غير فعال!");

    // 2. فحص كلمة المرور الحالية
    const currentHash = user.password;
    console.log("\n📋 فحص كلمة المرور الحالية:");
    console.log("   تبدأ بـ $2b$:", currentHash.startsWith("$2b$"));
    console.log("   الطول:", currentHash.length);

    // 3. جرب كلمات المرور المحتملة
    const possiblePasswords = [NEW_PASSWORD, "Awn@2024!Secure", process.env.DEFAULT_USER_PASSWORD].filter(Boolean);
    for (const pw of possiblePasswords) {
      const match = await bcrypt.compare(pw, currentHash);
      console.log(`   تطابق "${pw}": ${match ? "✅ نعم!" : "❌ لا"}`);
    }

    // 4. فحص لو الهاش مشفر مرتين (double hash)
    if (currentHash.startsWith("$2b$")) {
      const isDoubleHashed = await bcrypt.compare(currentHash.substring(0, 60), currentHash);
      if (isDoubleHashed) {
        console.log("   ⚠️ كلمة المرور مشفرة مرتين (double hashed)!");
      }
    }

    // 5. إعادة تعيين كلمة المرور
    console.log("\n🔄 جاري إعادة تعيين كلمة المرور...");
    const newHash = await bcrypt.hash(NEW_PASSWORD, 12);
    await pool.query(
      "UPDATE users SET password = $1, must_change_password = true, updated_at = NOW() WHERE id = $2",
      [newHash, user.id]
    );

    // 6. تحقق من النتيجة
    const verify = await pool.query("SELECT password FROM users WHERE id = $1", [user.id]);
    const verifyMatch = await bcrypt.compare(NEW_PASSWORD, verify.rows[0].password);
    console.log("✅ تم إعادة التعيين بنجاح:", verifyMatch);
    console.log(`\n🔑 سجل الآن بـ:\n   اسم المستخدم: ${USERNAME}\n   كلمة المرور: ${NEW_PASSWORD}`);

  } catch (err) {
    console.error("❌ خطأ:", err.message);
  } finally {
    await pool.end();
  }
}

resetPassword();
