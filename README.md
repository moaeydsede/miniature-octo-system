# نظام الدوام والرواتب (Static) — GitHub Pages

## الملفات
- `index.html` صفحة الدخول
- `admin.html` لوحة الإدارة
- `manager.html` لوحة المدير
- `employee.html` بوابة الموظف (عرض فقط)
- `assets/app.css` تصميم RTL احترافي
- `assets/app.js` منطق النظام (LocalStorage + حسابات + CSV + صك القبض)

## بيانات الدخول
- Admin: `admin / admin123`
- Manager: يتم إنشاؤه من لوحة Admin
- Employee: دخول باسم الموظف كما هو مسجل

## التخزين
البيانات محفوظة داخل المتصفح (`LocalStorage`).  
للحفظ والنقل بين الأجهزة استخدم Backup JSON من تبويب (استيراد/تصدير).

## صك القبض PDF
اضغط **طباعة / حفظ PDF** ثم اختر Save as PDF من المتصفح.

## GitHub Pages
Settings → Pages → Deploy from branch → `main` / root
