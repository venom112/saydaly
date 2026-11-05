# صيدلي — Saydaly

نظام إدارة الصيدليات

نظام إدارة صيدلية أونلاين: نقطة بيع، فواتير بيع وشراء، مرتجعات (بالعلبة/الشريط/القرص)، مخزون وصلاحيات انتهاء، جرد، باركود، دليل أدوية (25 ألف دواء)، عملاء وموردون، ورديات وجرد صندوق، مصروفات، تقارير أرباح شهرية وسنوية، سجل عمليات، ومستخدمون بصلاحيات.

**المعمارية:** واجهة ثابتة (`public/`) + Cloudflare Worker (`src/worker.js`) + قاعدة بيانات Cloudflare D1 (SQLite). تسجيل الدخول والجلسات وترقيم الفواتير على الخادم.

```
public/            الواجهة (HTML/CSS/JS بدون أي خطوة بناء) + دليل الأدوية public/catalog
src/worker.js      الـ API (دخول، مستخدمون، مستندات، ترقيم، تغييرات)
src/schema.js      جداول D1 (تُنشأ تلقائيا عند أول طلب) — نفسها في schema.sql
tests/             اختبارات الـ API + خادم تطوير محلي بدون حساب Cloudflare
wrangler.toml      إعدادات Cloudflare
.github/workflows  نشر تلقائي من GitHub
```

## النشر خطوة بخطوة

المطلوب: حساب Cloudflare (المجاني يكفي)، حساب GitHub، وNode.js 22 أو أحدث.

### 1) ارفع المشروع إلى GitHub
```bash
git init && git add . && git commit -m "Pharmacy system"
git branch -M main
git remote add origin https://github.com/<حسابك>/<اسم-المستودع>.git
git push -u origin main
```

### 2) أنشئ قاعدة البيانات على Cloudflare
```bash
npm install
npx wrangler login
npx wrangler d1 create pharmacy-db
```
انسخ قيمة `database_id` التي تظهر وضعها في `wrangler.toml` مكان `PUT-YOUR-D1-DATABASE-ID-HERE`، ثم:
```bash
git add wrangler.toml && git commit -m "Set D1 id" && git push
```
(الجداول تُنشأ تلقائيا عند أول طلب. لا حاجة لتشغيل SQL يدويا.)

### 3) انشر — اختر طريقة واحدة

**أ) من جهازك (الأسرع):**
```bash
npx wrangler deploy
```

**ب) نشر تلقائي من GitHub عبر GitHub Actions:** في المستودع: Settings ← Secrets and variables ← Actions، أضف:
- `CLOUDFLARE_API_TOKEN` (من Cloudflare: My Profile ← API Tokens ← قالب "Edit Cloudflare Workers"، وأضف صلاحية D1 Edit)
- `CLOUDFLARE_ACCOUNT_ID` (يظهر في الصفحة الرئيسية للحساب)

ثم كل `git push` على `main` يشغّل الاختبارات وينشر (الملف `.github/workflows/deploy.yml`).

**ج) ربط المستودع من لوحة Cloudflare:** Workers & Pages ← Create ← Import a repository، اختر المستودع، وأمر النشر `npx wrangler deploy`. بعدها كل push ينشر تلقائيا.

بعد النشر يظهر رابط مثل `https://saydaly.<حسابك>.workers.dev`.

### 4) أول دخول
- المستخدم: `admin` وكلمة المرور: `admin` ← **غيّرها فورا** من «حسابي».
- لتجنب كلمة المرور الافتراضية أصلا: قبل أول زيارة نفّذ `npx wrangler secret put ADMIN_PASSWORD` فيُنشأ المدير بها.
- من «الإعدادات ← المستخدمون والصلاحيات» أنشئ حسابات الموظفين وحدد صلاحياتهم.

### 5) نطاق خاص (اختياري)
Workers & Pages ← مشروعك ← Settings ← Domains & Routes ← Add ← Custom domain.

## التشغيل المحلي
```bash
npm run dev          # wrangler dev مع D1 محلي
npm run dev:local    # بديل بدون Wrangler: خادم Node + ملف SQLite (http://localhost:8787)
npm test             # اختبارات الـ API
```
الدخول: `admin` / `admin`.

## النسخ الاحتياطي
- من داخل النظام: «الإعدادات ← النسخ الاحتياطي» (ملف JSON اختياريا مشفّر بكلمة سر).
- من قاعدة البيانات مباشرة: `npm run db:backup` (ملف SQL كامل). و D1 توفر أيضا Time Travel للرجوع بالقاعدة حتى 30 يوما.

## تحديث دليل الأدوية تلقائيا
- مهمة GitHub Actions (`.github/workflows/update-catalog.yml`) تعمل **يوميا**: تنزّل أحدث ملف، وتتحقق منه، وإن تغيّر تحدّث `public/catalog` وتنشر النسخة الجديدة تلقائيا. وتعمل يدويا من Actions ← Update drug catalog ← Run workflow.
- المصدر الافتراضي: قاعدة [karem505/egyptian-drug-database](https://github.com/karem505/egyptian-drug-database) المفتوحة (CC0). لتغيير المصدر أضف متغير المستودع `CATALOG_SOURCE_URL` (رابط ملف CSV بنفس الأعمدة: `commercial_name_en, commercial_name_ar, scientific_name, manufacturer, drug_class, route, price_egp`).
- حمايات: لا يُحدَّث إن نقص المصدر عن 15 ألف صنف أو انخفض العدد أكثر من 15% أو غابت الأعمدة أو لم تكن أغلب الأصناف مسعّرة؛ ويفشل التنفيذ بوضوح بدل أن يفسد الدليل.
- داخل النظام: صفحة «الدليل الدوائي» تعرض تاريخ آخر تحديث وعدد الأصناف الجديدة وتغيّرات الأسعار، وتحذّر إن مرّ أكثر من 45 يوما. وزر «مقارنة أسعار أصنافي بالدليل» يعرض أصنافك التي اختلف سعرها ويحدّثها بضغطة بعد موافقتك (لا تتغير أسعارك تلقائيا).
- **تنبيه صريح:** لم أجد لدى هيئة الدواء المصرية واجهة أو ملف بيانات رسميا للأسعار يُنزَّل آليا (قوائمها الدورية المنشورة غالبا PDF وبلا أسعار). فالمصدر الافتراضي مجتمعي، وصاحبه لا يحدّثه يوميا (لديه عدد قليل من التعديلات). التحديث التلقائي يلتقط أي تعديل يصدر عنه فور صدوره، لكنه ليس «معتمدا» رسميا. إن حصلت على ملف رسمي أو مصدر تثق به، ضع رابطه في `CATALOG_SOURCE_URL`.

## الأمان — ما الذي يطبّقه الخادم وما الذي لا يطبّقه
يطبّقه الخادم فعلا:
- تسجيل دخول بكلمات سر مشفّرة (PBKDF2-SHA256)، جلسات في كوكي `HttpOnly` + `Secure` + `SameSite=Strict`، وقفل 5 دقائق بعد 5 محاولات خاطئة.
- كل واجهة الـ API تتطلب دخولا. إدارة المستخدمين والإعدادات وسجل العمليات للمدير فقط.
- سجل العمليات للإضافة فقط ويُختم باسم المستخدم والوقت من الخادم (لا يمكن تزويره أو حذفه). والفواتير والمرتجعات لا تُحذف، تُلغى فقط.
- ترقيم الفواتير من الخادم (لا يتكرر مع تعدد الأجهزة) وكشف التعارض عند تعديل نفس الصنف من جهازين.
- رؤوس أمان (CSP وغيرها) في `public/_headers`.

حدود تعرفها:
- صلاحيات الأقسام والإجراءات (مثل «كاشير لا يرى التقارير») تُطبَّق في الواجهة. موظف تقني يستطيع طلب بيانات أعمال أخرى مباشرة من الـ API. إن احتجت عزلا أشد، أضف فحص الصلاحيات حسب المجموعة في `src/worker.js`.
- عملية البيع تكتب عدة مستندات (المخزون ثم الفاتورة ثم رصيد العميل) في طلبات متتالية وليست معاملة واحدة؛ انقطاع الإنترنت في منتصفها قد يترك عملية ناقصة، وسجل العمليات يساعد في اكتشافها.
- النظام يحتاج إنترنت دائما (لا عمل بدون اتصال).

## إعدادات
| المتغير | المعنى |
|---|---|
| `SESSION_HOURS` (في wrangler.toml) | مدة الجلسة بالساعات (الافتراضي 12) |
| `ADMIN_PASSWORD` (secret) | كلمة مرور المدير عند إنشائه لأول مرة |

## English summary
Saydaly (صيدلي) — static front-end in `public/`, API in `src/worker.js` (Cloudflare Worker), data in D1. Deploy: push to GitHub → `npx wrangler d1 create pharmacy-db` → put the id in `wrangler.toml` → `npx wrangler deploy` (or use the included GitHub Action / Workers Builds). Default login `admin`/`admin` (change it, or set the `ADMIN_PASSWORD` secret before first use). Tables are created automatically on the first request.
