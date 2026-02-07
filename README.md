# نظام إدارة الدوام والرواتب – نسخة ويب (Frontend فقط)

مشروع **Static بالكامل** يعمل 100% بدون سيرفر ومناسب للنشر على **GitHub Pages**.

## الملفات داخل المشروع
- `index.html` شاشة الدخول (Admin/Manager + Employee)
- `admin.html` لوحة الإدارة (Admin)
- `manager.html` لوحة المدير (Manager)
- `employee.html` بوابة الموظف (عرض فقط)
- `README.md` هذا الملف

> **لا يوجد assets** — كل CSS و JavaScript داخل نفس ملفات HTML.  
> التخزين عبر **LocalStorage** (كل جهاز = بياناته الخاصة).

## بيانات الدخول
### Admin (ثابت)
- Username: `admin`
- Password: `admin123`

### Manager (افتراضي جاهز)
- Username: `manager`
- Password: `manager123`

> يمكن إضافة/تعديل/حذف المدراء من لوحة Admin.

## النشر على GitHub Pages
1) أنشئ Repository جديد على GitHub  
2) ارفع الملفات كلها إلى جذر الريبو (Root)  
3) من **Settings → Pages**:
   - Source: Deploy from a branch
   - Branch: `main` / Root
4) افتح رابط Pages الناتج

## ملاحظات مهمة
- Employee يدخل باسم الموظف **كما هو مسجّل حرفيًا** داخل النظام وبحالة **نشط**.
- PDF يتم عبر نافذة طباعة: Print → Save as PDF.

