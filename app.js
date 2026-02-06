/* نظام إدارة الدوام والرواتب – Frontend فقط
   تخزين: LocalStorage
   أدوار: Admin / Manager / Employee (عرض فقط)
*/
(() => {
  'use strict';

  // -------- Utilities --------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
  const pad2 = (n) => String(n).padStart(2,'0');
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const dayNames = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const dayNameFromISO = (iso) => {
    const [y,m,dd] = iso.split('-').map(Number);
    const d = new Date(y, m-1, dd);
    return dayNames[d.getDay()];
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const roundTo = (minutes, step) => {
    const s = Math.max(1, Number(step||1));
    return Math.round(minutes / s) * s;
  };
  const minutesBetween = (t1, t2) => {
    // t1,t2: "HH:MM"
    if(!t1 || !t2) return 0;
    const [h1,m1] = t1.split(':').map(Number);
    const [h2,m2] = t2.split(':').map(Number);
    return (h2*60+m2) - (h1*60+m1);
  };
  const fmtMoney = (v) => {
    const n = Number(v||0);
    return n.toLocaleString('ar-EG', {minimumFractionDigits:2, maximumFractionDigits:2});
  };
  const toast = (title, msg='', kind='') => {
    const el = $('#toast');
    el.innerHTML = `<div class="toast__title">${escapeHtml(title)}</div><div class="toast__msg">${escapeHtml(msg)}</div>`;
    el.classList.add('is-show');
    setTimeout(()=> el.classList.remove('is-show'), 3200);
  };
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // -------- Storage --------
  const LS_KEY = 'apw_v1';
  const load = () => {
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){ return null; }
  };
  const save = (state) => localStorage.setItem(LS_KEY, JSON.stringify(state));
  const defaultState = () => ({
    meta: { version: 1, createdAt: Date.now() },
    company: { name: 'شركة', logoDataUrl: '' },
    departments: [
      { id: 'd_admin', name:'إدارة' },
      { id: 'd_sales', name:'مبيعات' },
      { id: 'd_store', name:'مخزن' }
    ],
    employees: [
      { id:'e1', name:'موظف 1', code:'', deptId:'d_admin', salary: 8000, active:true }
    ],
    managers: [
      // created by admin
      // { id:'m1', username:'manager1', passwordHash:'...', active:true }
    ],
    monthSettings: {
      // key: YYYY-MM
      // '2026-02': {...}
    },
    attendance: {
      // key: YYYY-MM -> array of records
    },
    advances: {
      // key: YYYY-MM -> { employeeId: amount }
    },
    audit: { lastExportAt: null }
  });

  // Minimal (NOT strong) hashing for frontend-only app
  const hash = async (str) => {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  };

  let STATE = load() || defaultState();
  save(STATE);

  // -------- Session --------
  const SESSION_KEY = 'apw_session_v1';
  const loadSession = () => {
    try{ return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null'); }catch(e){ return null; }
  };
  const setSession = (s) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  const clearSession = () => sessionStorage.removeItem(SESSION_KEY);
  let SESSION = loadSession(); // { role, username?, employeeId? }

  // -------- Elements --------
  const screenLogin = $('#screenLogin');
  const screenDashboard = $('#screenDashboard');
  const sidebar = $('#sidebar');
  const nav = $('#nav');
  const btnLogout = $('#btnLogout');
  const btnExport = $('#btnExport');
  const btnImport = $('#btnImport');
  const btnSync = $('#btnSync');
  const filePicker = $('#filePicker');

  // -------- Tabs (login) --------
  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b=>b.classList.remove('is-active'));
    $$('.pane').forEach(p=>p.classList.remove('is-active'));
    btn.classList.add('is-active');
    const t = btn.dataset.tab;
    $(`.pane[data-pane="${t}"]`).classList.add('is-active');
  }));

  // -------- Boot UI --------
  $('#yearNow').textContent = new Date().getFullYear();
  const refreshBrand = () => {
    $('#companyName').textContent = STATE.company?.name || 'نظام إدارة الدوام والرواتب';
    const logoWrap = $('#brandLogo');
    logoWrap.innerHTML = '';
    if(STATE.company?.logoDataUrl){
      const img = document.createElement('img');
      img.src = STATE.company.logoDataUrl;
      img.alt = 'شعار الشركة';
      logoWrap.appendChild(img);
    } else {
      logoWrap.innerHTML = '<div class="muted" style="font-weight:900">HR</div>';
    }
  };
  refreshBrand();

  // -------- Navigation & Screens --------
  const routes = {
    admin: [
      { key:'home', label:'لوحة التحكم', hint:'مؤشرات سريعة' },
      { key:'company', label:'بيانات الشركة', hint:'اسم + شعار' },
      { key:'departments', label:'الأقسام', hint:'إضافة/حذف' },
      { key:'employees', label:'الموظفون', hint:'إضافة/تعديل/إيقاف' },
      { key:'managers', label:'المدراء', hint:'إنشاء مدراء' },
      { key:'month', label:'إعدادات الشهر', hint:'لكل شهر' },
      { key:'attendance', label:'تسجيل الدوام', hint:'تسجيل يومي' },
      { key:'advances', label:'السلف', hint:'حسب الشهر' },
      { key:'payroll', label:'الرواتب', hint:'حساب + PDF' },
      { key:'excel', label:'Excel', hint:'استيراد/تصدير' },
      { key:'sync', label:'مزامنة', hint:'JSON بدون سيرفر' },
    ],
    manager: [
      { key:'home', label:'لوحة التحكم', hint:'ملخص' },
      { key:'attendance', label:'تسجيل الدوام', hint:'للموظفين' },
      { key:'month', label:'إعدادات الشهر', hint:'عرض فقط' },
      { key:'payroll', label:'التقارير', hint:'عرض الرواتب' },
    ],
    employee: [
      { key:'home', label:'بوابة الموظف', hint:'الشهر الحالي + السابق' },
      { key:'paySlip', label:'صك القبض PDF', hint:'تحميل' },
    ]
  };

  const setActiveRoute = (key) => {
    $$('.nav__item', nav).forEach(it => it.classList.toggle('is-active', it.dataset.key === key));
    renderScreen(key);
  };

  const renderNav = () => {
    nav.innerHTML = '';
    const role = SESSION?.role;
    const items = routes[role] || [];
    items.forEach((it, idx) => {
      const el = document.createElement('button');
      el.className = 'nav__item' + (idx===0 ? ' is-active' : '');
      el.dataset.key = it.key;
      el.innerHTML = `<span>${escapeHtml(it.label)}</span><small>${escapeHtml(it.hint||'')}</small>`;
      el.addEventListener('click', () => setActiveRoute(it.key));
      nav.appendChild(el);
    });
  };

  const setShell = (loggedIn) => {
    btnLogout.style.display = loggedIn ? '' : 'none';
    sidebar.style.display = loggedIn ? '' : 'none';
    btnExport.style.display = loggedIn ? '' : 'none';
    btnImport.style.display = loggedIn ? '' : 'none';
    btnSync.style.display = loggedIn ? '' : 'none';
  };

  const setSessionInfo = () => {
    const pill = $('#sessionPill');
    const hint = $('#sessionHint');
    if(!SESSION){ pill.textContent='—'; hint.textContent='—'; return; }

    if(SESSION.role === 'admin'){
      pill.textContent = '👑 Admin';
      hint.textContent = 'صلاحيات كاملة';
    } else if(SESSION.role === 'manager'){
      pill.textContent = '👔 Manager';
      hint.textContent = `مستخدم: ${SESSION.username || ''}`;
    } else {
      const emp = STATE.employees.find(e=>e.id===SESSION.employeeId);
      pill.textContent = '👤 موظف';
      hint.textContent = emp ? emp.name : '';
    }
  };

  // -------- Modal --------
  const modal = $('#screenModal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const openModal = (title, bodyHtml) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modal.style.display = '';
    modal.setAttribute('aria-hidden','false');
  };
  const closeModal = () => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    modalTitle.textContent = '—';
    modalBody.innerHTML = '';
  };
  modal.addEventListener('click', (e) => {
    const t = e.target;
    if(t && t.dataset && t.dataset.close) closeModal();
  });

  // -------- Core Business Logic --------
  const getMonthKey = (d=new Date()) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  const ensureMonth = (ym) => {
    if(!STATE.monthSettings[ym]){
      // default settings
      STATE.monthSettings[ym] = {
        daysInMonth: 30,
        hoursInMonth: 176, // 22 يوم * 8 ساعات تقريباً
        startTime: '09:00',
        endTime: '17:00',
        lateGraceMin: 10,
        latePenaltyFactor: 1.5,
        earlyGraceMin: 10,
        earlyPenaltyFactor: 1.5,
        overtimeStartAfterMin: 0,
        overtimeFactor: 1.25,
        rounding: 5
      };
    }
    if(!STATE.attendance[ym]) STATE.attendance[ym] = [];
    if(!STATE.advances[ym]) STATE.advances[ym] = {};
  };

  const computeAttendanceDerived = (ym, rec) => {
    const s = STATE.monthSettings[ym];
    if(!s) return { overtimeMin:0, lateMin:0, earlyMin:0 };
    const roundStep = Number(s.rounding||1);

    let overtimeMin = 0, lateMin = 0, earlyMin = 0;

    if(rec.absentWithExcuse){
      // absence w/ excuse -> no penalties here (policy can vary)
      return { overtimeMin:0, lateMin:0, earlyMin:0 };
    }

    const shiftMinutes = minutesBetween(s.startTime, s.endTime);

    if(rec.inTime && rec.outTime){
      // Late
      const lateRaw = Math.max(0, minutesBetween(s.startTime, rec.inTime));
      lateMin = Math.max(0, lateRaw - Number(s.lateGraceMin||0));

      // Early
      const earlyRaw = Math.max(0, minutesBetween(rec.outTime, s.endTime));
      earlyMin = Math.max(0, earlyRaw - Number(s.earlyGraceMin||0));

      // Overtime: any minutes beyond shift (or after overtimeStartAfterMin)
      const worked = minutesBetween(rec.inTime, rec.outTime);
      const extra = Math.max(0, worked - shiftMinutes);
      overtimeMin = Math.max(0, extra - Number(s.overtimeStartAfterMin||0));
    }

    // manual overtime override/add
    overtimeMin += Number(rec.manualOvertimeMin||0);

    overtimeMin = roundTo(overtimeMin, roundStep);
    lateMin = roundTo(lateMin, roundStep);
    earlyMin = roundTo(earlyMin, roundStep);

    if(rec.lateWithExcuse) lateMin = 0;
    if(rec.earlyWithExcuse) earlyMin = 0;

    return { overtimeMin, lateMin, earlyMin };
  };

  const computePayrollForEmployee = (ym, employeeId) => {
    ensureMonth(ym);
    const emp = STATE.employees.find(e=>e.id===employeeId);
    if(!emp) return null;
    const s = STATE.monthSettings[ym];
    const hourly = (Number(emp.salary||0) / Number(s.hoursInMonth||1));

    const recs = STATE.attendance[ym].filter(r=>r.employeeId===employeeId);
    let sumOver=0, sumLate=0, sumEarly=0;
    recs.forEach(r=>{
      const d = computeAttendanceDerived(ym, r);
      sumOver += d.overtimeMin;
      sumLate += d.lateMin;
      sumEarly += d.earlyMin;
    });

    const overtimeHours = sumOver / 60;
    const lateHours = sumLate / 60;
    const earlyHours = sumEarly / 60;

    const overtimeValue = overtimeHours * hourly * Number(s.overtimeFactor||1);
    const latePenalty = lateHours * hourly * Number(s.latePenaltyFactor||1);
    const earlyPenalty = earlyHours * hourly * Number(s.earlyPenaltyFactor||1);

    const advances = Number((STATE.advances[ym]||{})[employeeId] || 0);

    const net = Number(emp.salary||0) + overtimeValue - latePenalty - earlyPenalty - advances;

    return {
      ym,
      employeeId,
      hourly,
      sumOverMin: sumOver,
      sumLateMin: sumLate,
      sumEarlyMin: sumEarly,
      overtimeValue,
      latePenalty,
      earlyPenalty,
      advances,
      net
    };
  };

  const monthLabel = (ym) => {
    const [y,m] = ym.split('-');
    return `${m}/${y}`;
  };

  // -------- Renderers --------
  const cardShell = (title, actionsHtml='', inner='') => `
    <div class="card">
      <div class="card__head">
        <div>
          <div class="card__title">${escapeHtml(title)}</div>
        </div>
        <div class="actions">${actionsHtml}</div>
      </div>
      ${inner}
    </div>
  `;

  const renderHome = () => {
    const ym = getMonthKey();
    ensureMonth(ym);
    const activeEmployees = STATE.employees.filter(e=>e.active);
    const attCount = STATE.attendance[ym].length;

    if(SESSION.role === 'employee'){
      const emp = STATE.employees.find(e=>e.id===SESSION.employeeId);
      const prev = (() => {
        const [y,m] = ym.split('-').map(Number);
        const d = new Date(y, m-2, 1);
        return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
      })();
      ensureMonth(prev);
      const pNow = computePayrollForEmployee(ym, emp.id);
      const pPrev = computePayrollForEmployee(prev, emp.id);

      const dept = STATE.departments.find(d=>d.id===emp.deptId)?.name || '—';

      return `
        ${cardShell('بياناتي', '', `
          <div class="row row--2">
            <div class="kpi"><div class="kpi__k">الاسم</div><div class="kpi__v">${escapeHtml(emp.name)}</div></div>
            <div class="kpi"><div class="kpi__k">القسم</div><div class="kpi__v">${escapeHtml(dept)}</div></div>
          </div>
          <div class="hr"></div>
          <div class="row row--2">
            <div class="kpi"><div class="kpi__k">الشهر الحالي (${escapeHtml(monthLabel(ym))})</div><div class="kpi__v">${fmtMoney(pNow?.net||0)}</div></div>
            <div class="kpi"><div class="kpi__k">الشهر السابق (${escapeHtml(monthLabel(prev))})</div><div class="kpi__v">${fmtMoney(pPrev?.net||0)}</div></div>
          </div>
          <div class="hr"></div>
          <div class="actions">
            <button class="btn btn--primary" id="btnEmpSlipNow">صك قبض الشهر الحالي PDF</button>
            <button class="btn" id="btnEmpSlipPrev">صك قبض الشهر السابق PDF</button>
          </div>
        `)}
      `;
    }

    const kpis = `
      <div class="cards">
        <div class="kpi"><div class="kpi__k">عدد الموظفين النشطين</div><div class="kpi__v">${activeEmployees.length}</div></div>
        <div class="kpi"><div class="kpi__k">تسجيلات الدوام (هذا الشهر)</div><div class="kpi__v">${attCount}</div></div>
        <div class="kpi"><div class="kpi__k">الأقسام</div><div class="kpi__v">${STATE.departments.length}</div></div>
      </div>
    `;
    const quick = `
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="btnGoAttendance">تسجيل دوام سريع</button>
        <button class="btn" id="btnGoPayroll">حساب الرواتب</button>
      </div>
    `;
    return cardShell('لوحة التحكم', '', kpis + quick);
  };

  const renderCompany = () => {
    if(SESSION.role !== 'admin') return denyCard();
    const c = STATE.company || {};
    return cardShell('بيانات الشركة', '', `
      <form id="formCompany" class="form">
        <label class="label">اسم الشركة</label>
        <input class="input" name="name" value="${escapeHtml(c.name||'')}" required />
        <label class="label">شعار الشركة (صورة)</label>
        <input class="input" type="file" name="logo" accept="image/*" />
        <button class="btn btn--primary" type="submit">حفظ</button>
      </form>
      <div class="hint">
        <div class="muted small">سيظهر الاسم والشعار في: صك القبض PDF + بوابة الموظف + التقارير.</div>
      </div>
    `);
  };

  const renderDepartments = () => {
    if(SESSION.role !== 'admin') return denyCard();
    const rows = STATE.departments.map(d => `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td><span class="badge badge--muted">${STATE.employees.filter(e=>e.deptId===d.id).length}</span></td>
        <td><button class="btn btn--danger" data-del-dept="${d.id}">حذف</button></td>
      </tr>
    `).join('');
    return cardShell('إدارة الأقسام', '', `
      <form id="formAddDept" class="form">
        <label class="label">اسم القسم</label>
        <input class="input" name="name" placeholder="مثال: حسابات" required />
        <button class="btn btn--primary" type="submit">إضافة قسم</button>
      </form>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>القسم</th><th>عدد الموظفين</th><th>إجراء</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="muted">لا يوجد أقسام.</td></tr>'}</tbody>
      </table>
      <p class="muted small" style="margin-top:.6rem">* عند حذف قسم يتم فك ارتباط الموظفين تلقائياً (تصبح قيمة القسم: —).</p>
    `);
  };

  const renderEmployees = () => {
    if(SESSION.role !== 'admin') return denyCard();
    const deptOptions = ['<option value="">— بدون قسم —</option>']
      .concat(STATE.departments.map(d=>`<option value="${d.id}">${escapeHtml(d.name)}</option>`)).join('');
    const list = STATE.employees
      .sort((a,b)=> (a.active===b.active? a.name.localeCompare(b.name,'ar'): (a.active? -1: 1)))
      .map(e=>{
        const dept = STATE.departments.find(d=>d.id===e.deptId)?.name || '—';
        return `
          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${escapeHtml(e.name)}</div>
                <div class="muted small">${escapeHtml(dept)} • راتب: ${fmtMoney(e.salary||0)}</div>
              </div>
              <div class="actions">
                <span class="badge ${e.active?'badge--ok':'badge--danger'}">${e.active?'نشط':'موقوف'}</span>
                <button class="btn" data-edit-emp="${e.id}">تعديل</button>
                <button class="btn btn--danger" data-toggle-emp="${e.id}">${e.active?'إيقاف':'تفعيل'}</button>
              </div>
            </div>
            <div class="muted small">الكود: ${escapeHtml(e.code||'—')}</div>
          </div>
        `;
      }).join('');

    return `
      ${cardShell('إضافة موظف', '', `
        <form id="formAddEmp" class="form">
          <div class="row row--2">
            <div>
              <label class="label">الاسم</label>
              <input class="input" name="name" required />
            </div>
            <div>
              <label class="label">الكود (اختياري)</label>
              <input class="input" name="code" />
            </div>
          </div>
          <div class="row row--2">
            <div>
              <label class="label">القسم</label>
              <select class="select" name="deptId">${deptOptions}</select>
            </div>
            <div>
              <label class="label">الراتب الشهري</label>
              <input class="input" type="number" name="salary" min="0" step="1" required />
            </div>
          </div>
          <button class="btn btn--primary" type="submit">إضافة</button>
        </form>
      `)}
      <div class="hr"></div>
      ${cardShell('قائمة الموظفين', '', `
        <div class="row">
          <input class="input" id="empSearch" placeholder="بحث بالاسم..." />
        </div>
        <div class="hr"></div>
        <div id="empList" class="cards">${list || '<div class="muted">لا يوجد موظفون.</div>'}</div>
      `)}
    `;
  };

  const renderManagers = () => {
    if(SESSION.role !== 'admin') return denyCard();
    const list = STATE.managers.map(m=>`
      <tr>
        <td>${escapeHtml(m.username)}</td>
        <td><span class="badge ${m.active?'badge--ok':'badge--danger'}">${m.active?'نشط':'موقوف'}</span></td>
        <td>
          <button class="btn btn--danger" data-toggle-mgr="${m.id}">${m.active?'إيقاف':'تفعيل'}</button>
          <button class="btn" data-reset-mgr="${m.id}">تغيير كلمة المرور</button>
        </td>
      </tr>
    `).join('');
    return cardShell('إدارة المدراء', '', `
      <form id="formAddMgr" class="form">
        <label class="label">اسم المستخدم</label>
        <input class="input" name="username" placeholder="manager1" required />
        <label class="label">كلمة المرور</label>
        <input class="input" type="password" name="password" required />
        <button class="btn btn--primary" type="submit">إنشاء مدير</button>
      </form>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>المستخدم</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${list || '<tr><td colspan="3" class="muted">لا يوجد مدراء.</td></tr>'}</tbody>
      </table>
    `);
  };

  const renderMonthSettings = () => {
    const ym = getMonthKey();
    ensureMonth(ym);
    const s = STATE.monthSettings[ym];
    const readonly = SESSION.role !== 'admin';
    const roAttr = readonly ? 'disabled' : '';
    return cardShell('إعدادات الشهر', '', `
      <form id="formMonth" class="form">
        <div class="row row--2">
          <div>
            <label class="label">الشهر</label>
            <input class="input" name="ym" value="${escapeHtml(ym)}" placeholder="YYYY-MM" />
            <div class="muted small">* لتغيير الشهر اكتب مثل: 2026-02 ثم اضغط تحميل</div>
          </div>
          <div class="actions" style="align-items:end">
            <button class="btn" type="button" id="btnLoadMonth">تحميل</button>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row row--3">
          <div>
            <label class="label">عدد أيام الشهر</label>
            <select class="select" name="daysInMonth" ${roAttr}>
              ${[28,30,31].map(n=>`<option value="${n}" ${Number(s.daysInMonth)==n?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">عدد ساعات الشهر</label>
            <input class="input" type="number" name="hoursInMonth" value="${escapeHtml(s.hoursInMonth)}" ${roAttr} />
          </div>
          <div>
            <label class="label">التقريب (دقيقة / 5 / 15)</label>
            <select class="select" name="rounding" ${roAttr}>
              ${[1,5,15].map(n=>`<option value="${n}" ${Number(s.rounding)==n?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row row--3">
          <div>
            <label class="label">بداية الدوام</label>
            <input class="input" type="time" name="startTime" value="${escapeHtml(s.startTime)}" ${roAttr} />
          </div>
          <div>
            <label class="label">نهاية الدوام</label>
            <input class="input" type="time" name="endTime" value="${escapeHtml(s.endTime)}" ${roAttr} />
          </div>
          <div>
            <label class="label">بداية الإضافي بعد (دقائق)</label>
            <input class="input" type="number" name="overtimeStartAfterMin" value="${escapeHtml(s.overtimeStartAfterMin)}" ${roAttr} />
          </div>
        </div>

        <div class="row row--3">
          <div>
            <label class="label">سماح التأخير (دقائق)</label>
            <input class="input" type="number" name="lateGraceMin" value="${escapeHtml(s.lateGraceMin)}" ${roAttr} />
          </div>
          <div>
            <label class="label">معامل خصم التأخير</label>
            <input class="input" type="number" step="0.1" name="latePenaltyFactor" value="${escapeHtml(s.latePenaltyFactor)}" ${roAttr} />
          </div>
          <div>
            <label class="label">معامل الإضافي</label>
            <input class="input" type="number" step="0.1" name="overtimeFactor" value="${escapeHtml(s.overtimeFactor)}" ${roAttr} />
          </div>
        </div>

        <div class="row row--3">
          <div>
            <label class="label">سماح الانصراف المبكر (دقائق)</label>
            <input class="input" type="number" name="earlyGraceMin" value="${escapeHtml(s.earlyGraceMin)}" ${roAttr} />
          </div>
          <div>
            <label class="label">معامل خصم الانصراف المبكر</label>
            <input class="input" type="number" step="0.1" name="earlyPenaltyFactor" value="${escapeHtml(s.earlyPenaltyFactor)}" ${roAttr} />
          </div>
          <div></div>
        </div>

        ${readonly ? `<div class="hint"><div class="muted small">* المدير يستطيع عرض الإعدادات فقط. التعديل من Admin فقط.</div></div>`
          : `<button class="btn btn--primary" type="submit">حفظ إعدادات الشهر</button>`}
      </form>
    `);
  };

  const renderAttendance = () => {
    if(SESSION.role === 'employee') return denyCard();
    const ym = getMonthKey();
    ensureMonth(ym);
    const emps = STATE.employees.filter(e=>e.active);
    const empOptions = emps.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

    const rows = STATE.attendance[ym]
      .slice()
      .sort((a,b)=> (a.date>b.date? -1: 1))
      .slice(0, 60)
      .map(r=>{
        const emp = STATE.employees.find(e=>e.id===r.employeeId);
        const d = computeAttendanceDerived(ym, r);
        const badges = [
          r.absentWithExcuse ? '<span class="badge badge--muted">غياب بعذر</span>' : '',
          r.lateWithExcuse ? '<span class="badge badge--muted">تأخير بعذر</span>' : '',
          r.earlyWithExcuse ? '<span class="badge badge--muted">انصراف بعذر</span>' : '',
          (Number(r.manualOvertimeMin||0)>0) ? `<span class="badge badge--primary">إضافي يدوي ${r.manualOvertimeMin}د</span>` : ''
        ].filter(Boolean).join(' ');
        return `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(dayNameFromISO(r.date))}</td>
            <td>${escapeHtml(emp?.name||'—')}</td>
            <td>${escapeHtml(r.inTime||'—')}</td>
            <td>${escapeHtml(r.outTime||'—')}</td>
            <td>${d.overtimeMin}</td>
            <td>${d.lateMin}</td>
            <td>${d.earlyMin}</td>
            <td>${badges}</td>
            <td>
              <button class="btn" data-edit-att="${r.id}">تعديل</button>
              <button class="btn btn--danger" data-del-att="${r.id}">حذف</button>
            </td>
          </tr>
        `;
      }).join('');

    return `
      ${cardShell('تسجيل الدوام', '', `
        <form id="formAddAtt" class="form">
          <div class="row row--2">
            <div>
              <label class="label">الموظف</label>
              <select class="select" name="employeeId" required>${empOptions}</select>
            </div>
            <div>
              <label class="label">التاريخ</label>
              <input class="input" type="date" name="date" value="${toISODate(new Date())}" required />
            </div>
          </div>
          <div class="row row--2">
            <div>
              <label class="label">وقت الدخول</label>
              <input class="input" type="time" name="inTime" />
            </div>
            <div>
              <label class="label">وقت الخروج</label>
              <input class="input" type="time" name="outTime" />
            </div>
          </div>

          <div class="row row--2">
            <label class="pill"><input type="checkbox" name="absentWithExcuse" /> غياب بعذر</label>
            <label class="pill"><input type="checkbox" name="lateWithExcuse" /> تأخير بعذر</label>
            <label class="pill"><input type="checkbox" name="earlyWithExcuse" /> انصراف مبكر بعذر</label>
          </div>

          <div class="row row--2">
            <div>
              <label class="label">إضافي يدوي (بالدقائق)</label>
              <input class="input" type="number" name="manualOvertimeMin" min="0" step="1" value="0" />
            </div>
            <div>
              <label class="label">ملاحظة (لن يراها الموظف)</label>
              <input class="input" name="note" placeholder="مثال: إذن طبي..." />
            </div>
          </div>

          <button class="btn btn--primary" type="submit">حفظ</button>
        </form>
        <div class="hint">
          <div class="muted small">* لا يوجد تسجيل ذاتي للموظف. الملاحظة لا تظهر للموظف ولا تُضمّن في ملف مزامنة الموظفين.</div>
        </div>
      `)}
      <div class="hr"></div>
      ${cardShell(`آخر تسجيلات (${escapeHtml(monthLabel(ym))})`, '', `
        <div class="muted small">* يتم عرض آخر 60 سجل فقط للتسهيل على الموبايل.</div>
        <div class="hr"></div>
        <div style="overflow:auto">
          <table class="table">
            <thead>
              <tr>
                <th>التاريخ</th><th>اليوم</th><th>الموظف</th><th>الدخول</th><th>الخروج</th>
                <th>إضافي (د)</th><th>تأخير (د)</th><th>انصراف (د)</th><th>حالات</th><th>إجراء</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="10" class="muted">لا يوجد تسجيلات.</td></tr>'}</tbody>
          </table>
        </div>
      `)}
    `;
  };

  const renderAdvances = () => {
    if(SESSION.role !== 'admin') return denyCard();
    const ym = getMonthKey();
    ensureMonth(ym);
    const emps = STATE.employees.filter(e=>e.active);
    const options = emps.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    const rows = emps.map(e=>{
      const v = Number((STATE.advances[ym]||{})[e.id] || 0);
      return `<tr><td>${escapeHtml(e.name)}</td><td>${fmtMoney(v)}</td></tr>`;
    }).join('');
    return cardShell(`السلف (${escapeHtml(monthLabel(ym))})`, '', `
      <form id="formAdvance" class="form">
        <div class="row row--2">
          <div>
            <label class="label">الموظف</label>
            <select class="select" name="employeeId" required>${options}</select>
          </div>
          <div>
            <label class="label">قيمة السلفة</label>
            <input class="input" type="number" name="amount" min="0" step="1" required />
          </div>
        </div>
        <button class="btn btn--primary" type="submit">حفظ السلفة</button>
      </form>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>الموظف</th><th>السلفة</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  };

  const renderPayroll = () => {
    const ym = getMonthKey();
    ensureMonth(ym);

    let visibleEmployees = [];
    if(SESSION.role === 'employee'){
      visibleEmployees = STATE.employees.filter(e=>e.id===SESSION.employeeId);
    } else {
      visibleEmployees = STATE.employees.filter(e=>e.active);
    }

    const deptName = (emp) => STATE.departments.find(d=>d.id===emp.deptId)?.name || '—';

    const rows = visibleEmployees.map(e=>{
      const p = computePayrollForEmployee(ym, e.id);
      return `
        <tr>
          <td>${escapeHtml(e.name)}</td>
          <td>${escapeHtml(deptName(e))}</td>
          <td>${fmtMoney(e.salary||0)}</td>
          <td>${p ? fmtMoney(p.hourly) : '0.00'}</td>
          <td>${p?.sumOverMin||0}</td>
          <td>${fmtMoney(p?.overtimeValue||0)}</td>
          <td>${p?.sumLateMin||0}</td>
          <td>${fmtMoney(p?.latePenalty||0)}</td>
          <td>${p?.sumEarlyMin||0}</td>
          <td>${fmtMoney(p?.earlyPenalty||0)}</td>
          <td>${fmtMoney(p?.advances||0)}</td>
          <td><span class="badge badge--ok">${fmtMoney(p?.net||0)}</span></td>
          <td>
            ${SESSION.role==='employee' ? '' : `<button class="btn btn--primary" data-pdf="${e.id}">PDF</button>`}
          </td>
        </tr>
      `;
    }).join('');

    const helper = (SESSION.role==='manager') ? `<div class="hint"><div class="muted small">* المدير يمكنه عرض التقارير فقط. صك القبض PDF من Admin أو من بوابة الموظف.</div></div>` : '';

    return cardShell(`الرواتب (${escapeHtml(monthLabel(ym))})`, '', `
      <div class="muted small">* الحساب يعتمد على إعدادات الشهر + سجلات الدوام + السلف.</div>
      <div class="hr"></div>
      <div style="overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th>الموظف</th><th>القسم</th><th>الراتب</th><th>قيمة الساعة</th>
              <th>إضافي (د)</th><th>قيمة الإضافي</th>
              <th>تأخير (د)</th><th>خصم التأخير</th>
              <th>انصراف (د)</th><th>خصم الانصراف</th>
              <th>السلف</th><th>الصافي</th><th>PDF</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="13" class="muted">لا يوجد بيانات.</td></tr>'}</tbody>
        </table>
      </div>
      ${helper}
    `);
  };

  const renderEmployeePaySlip = () => {
    if(SESSION.role !== 'employee') return denyCard();
    const emp = STATE.employees.find(e=>e.id===SESSION.employeeId);
    return cardShell('صك القبض PDF', '', `
      <div class="muted">يمكنك إنشاء صك القبض للشهر الحالي أو السابق.</div>
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="btnEmpSlipNow2">صك قبض الشهر الحالي PDF</button>
        <button class="btn" id="btnEmpSlipPrev2">صك قبض الشهر السابق PDF</button>
      </div>
      <div class="hint"><div class="muted small">* لا يتم عرض أي ملاحظات داخل صك القبض للموظف.</div></div>
    `);
  };

  const renderExcel = () => {
    if(SESSION.role !== 'admin') return denyCard();
    return cardShell('Excel (استيراد / تصدير)', '', `
      <div class="muted small">التصدير/الاستيراد باستخدام ملفات .xlsx. يتعرّف النظام على النوع من اسم الـ Sheet.</div>
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="btnXlsxExport">تصدير كل البيانات (XLSX)</button>
        <button class="btn" id="btnXlsxTplEmp">تصدير قالب الموظفين</button>
        <button class="btn" id="btnXlsxTplAtt">تصدير قالب الدوام</button>
        <button class="btn" id="btnXlsxImport">استيراد من XLSX</button>
      </div>
      <div class="hint">
        <div class="muted small">Sheets المعتمدة:</div>
        <div class="code">Employees</div>
        <div class="code">Attendance</div>
        <div class="code">Departments</div>
        <div class="code">Company</div>
        <div class="code">Settings</div>
        <div class="code">Advances</div>
      </div>
    `);
  };

  const renderSync = () => {
    if(SESSION.role !== 'admin') return denyCard();
    return cardShell('المزامنة (بدون سيرفر)', '', `
      <div class="muted">الطريقة الاحترافية بدون Backend: ملف JSON.</div>
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="btnSyncAdminExport">تصدير ملف مزامنة (Admin كامل)</button>
        <button class="btn" id="btnSyncEmployeeExport">تصدير ملف مزامنة للموظفين (بدون ملاحظات)</button>
        <button class="btn" id="btnSyncImport">استيراد ملف مزامنة (JSON)</button>
      </div>
      <div class="hint">
        <div class="muted small">* ملف مزامنة الموظفين يستبعد: ملاحظات الدوام + أي بيانات حساسة غير لازمة.</div>
        <div class="muted small">* الموظف عند الاستيراد يرى: الشهر الحالي + شهر واحد سابق فقط.</div>
      </div>
    `);
  };

  const denyCard = () => cardShell('غير مصرح', '', `<div class="muted">لا تملك صلاحية الوصول لهذه الصفحة.</div>`);

  const renderScreen = (key) => {
    let html = '';
    if(key === 'home') html = renderHome();
    else if(key === 'company') html = renderCompany();
    else if(key === 'departments') html = renderDepartments();
    else if(key === 'employees') html = renderEmployees();
    else if(key === 'managers') html = renderManagers();
    else if(key === 'month') html = renderMonthSettings();
    else if(key === 'attendance') html = renderAttendance();
    else if(key === 'advances') html = renderAdvances();
    else if(key === 'payroll') html = renderPayroll();
    else if(key === 'excel') html = renderExcel();
    else if(key === 'sync') html = renderSync();
    else if(key === 'paySlip') html = renderEmployeePaySlip();
    else html = renderHome();

    screenDashboard.innerHTML = html;

    // bind handlers for current screen
    bindScreenHandlers(key);
  };

  // -------- Handlers --------
  $('#formLoginAdmin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = String(fd.get('username')||'').trim();
    const password = String(fd.get('password')||'').trim();

    if(username === 'admin' && password === 'admin123'){
      SESSION = { role:'admin' };
      setSession(SESSION);
      bootApp();
      toast('تم الدخول', 'مرحباً Admin');
      return;
    }

    // managers
    const mgr = STATE.managers.find(m => m.username === username && m.active);
    if(!mgr){
      toast('فشل الدخول', 'المستخدم غير موجود أو موقوف');
      return;
    }
    const ph = await hash(password);
    if(ph !== mgr.passwordHash){
      toast('فشل الدخول', 'كلمة المرور غير صحيحة');
      return;
    }
    SESSION = { role:'manager', username: mgr.username, managerId: mgr.id };
    setSession(SESSION);
    bootApp();
    toast('تم الدخول', 'مرحباً مدير');
  });

  $('#formLoginEmployee').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('employeeName')||'').trim();
    const emp = STATE.employees.find(x => x.active && x.name === name);
    if(!emp){
      toast('غير موجود', 'تأكد من كتابة الاسم كما هو مسجل');
      return;
    }
    SESSION = { role:'employee', employeeId: emp.id };
    setSession(SESSION);
    bootApp();
    toast('تم الدخول', 'بوابة الموظف');
  });

  btnLogout.addEventListener('click', () => {
    clearSession();
    SESSION = null;
    bootApp();
    toast('تم تسجيل الخروج');
  });

  btnExport.addEventListener('click', () => {
    if(!SESSION){ toast('يجب تسجيل الدخول'); return; }
    openModal('التصدير', `
      <div class="muted small">اختر نوع التصدير:</div>
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="mExportJson">تصدير JSON (كل البيانات)</button>
        <button class="btn" id="mExportXlsx">تصدير XLSX (كل البيانات)</button>
      </div>
      <div class="hint"><div class="muted small">* XLSX يحتاج اتصال للـ CDN لأول مرة فقط (تحميل مكتبة).</div></div>
    `);
    $('#mExportJson').addEventListener('click', () => { closeModal(); exportSyncJson({mode:'admin'}); });
    $('#mExportXlsx').addEventListener('click', () => { closeModal(); exportAllXlsx(); });
  });

  btnImport.addEventListener('click', () => {
    if(!SESSION){ toast('يجب تسجيل الدخول'); return; }
    openModal('الاستيراد', `
      <div class="muted small">يمكنك استيراد JSON مزامنة أو ملف XLSX.</div>
      <div class="hr"></div>
      <div class="actions">
        <button class="btn btn--primary" id="mPickFile">اختيار ملف</button>
      </div>
    `);
    $('#mPickFile').addEventListener('click', () => {
      closeModal();
      filePicker.value = '';
      filePicker.click();
    });
  });

  btnSync.addEventListener('click', () => {
    if(!SESSION){ toast('يجب تسجيل الدخول'); return; }
    if(SESSION.role === 'admin'){
      setActiveRoute('sync');
    } else if(SESSION.role === 'employee'){
      // employee: import only
      openModal('مزامنة الموظف', `
        <div class="muted">استيراد ملف مزامنة JSON من الإدارة.</div>
        <div class="hr"></div>
        <button class="btn btn--primary" id="mEmpSyncImport">اختيار ملف JSON</button>
      `);
      $('#mEmpSyncImport').addEventListener('click', () => {
        closeModal();
        filePicker.value = '';
        filePicker.accept = '.json';
        filePicker.click();
      });
    } else {
      toast('مزامنة', 'متاحة للإدارة والموظف فقط');
    }
  });

  filePicker.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const name = file.name.toLowerCase();
    try{
      if(name.endsWith('.json')){
        const text = await file.text();
        const data = JSON.parse(text);
        importSyncJson(data);
        toast('تم الاستيراد', 'تم تحديث البيانات');
      } else if(name.endsWith('.xlsx')){
        await importFromXlsx(file);
        toast('تم استيراد XLSX', 'تم تحديث البيانات');
      } else {
        toast('نوع ملف غير مدعوم');
      }
    }catch(err){
      console.error(err);
      toast('فشل الاستيراد', 'تأكد من صحة الملف');
    } finally {
      filePicker.value = '';
      filePicker.accept = '.json,.xlsx';
    }
  });

  // -------- Bind screen-specific handlers --------
  const bindScreenHandlers = (key) => {
    if(key === 'home'){
      const btnA = $('#btnGoAttendance');
      if(btnA) btnA.addEventListener('click', () => setActiveRoute('attendance'));
      const btnP = $('#btnGoPayroll');
      if(btnP) btnP.addEventListener('click', () => setActiveRoute('payroll'));

      const now = $('#btnEmpSlipNow');
      if(now) now.addEventListener('click', () => generatePaySlipPDF(getMonthKey(), SESSION.employeeId, {forEmployee:true}));
      const prev = $('#btnEmpSlipPrev');
      if(prev) prev.addEventListener('click', () => {
        const ym = getMonthKey();
        const [y,m] = ym.split('-').map(Number);
        const d = new Date(y, m-2, 1);
        const prevKey = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
        generatePaySlipPDF(prevKey, SESSION.employeeId, {forEmployee:true});
      });
    }

    if(key === 'company'){
      const form = $('#formCompany');
      if(form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        STATE.company.name = String(fd.get('name')||'').trim();
        const f = fd.get('logo');
        if(f && f.size){
          const dataUrl = await fileToDataUrl(f);
          STATE.company.logoDataUrl = dataUrl;
        }
        save(STATE); refreshBrand();
        toast('تم الحفظ', 'تم تحديث بيانات الشركة');
        renderScreen('company');
      });
    }

    if(key === 'departments'){
      const form = $('#formAddDept');
      if(form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name')||'').trim();
        if(!name) return;
        STATE.departments.push({ id: uid(), name });
        save(STATE);
        toast('تمت الإضافة', name);
        renderScreen('departments');
      });
      $$('[data-del-dept]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.delDept;
        const dept = STATE.departments.find(d=>d.id===id);
        if(!dept) return;
        // unlink employees
        STATE.employees.forEach(e=>{ if(e.deptId===id) e.deptId=''; });
        STATE.departments = STATE.departments.filter(d=>d.id!==id);
        save(STATE);
        toast('تم الحذف', dept.name);
        renderScreen('departments');
      }));
    }

    if(key === 'employees'){
      const form = $('#formAddEmp');
      if(form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name')||'').trim();
        const code = String(fd.get('code')||'').trim();
        const deptId = String(fd.get('deptId')||'');
        const salary = Number(fd.get('salary')||0);
        if(!name) return;
        STATE.employees.push({ id: uid(), name, code, deptId, salary, active:true });
        save(STATE);
        toast('تمت الإضافة', name);
        renderScreen('employees');
      });

      const search = $('#empSearch');
      const list = $('#empList');
      if(search && list){
        search.addEventListener('input', () => {
          const q = search.value.trim();
          $$('.card', list).forEach(card => {
            const t = card.textContent || '';
            card.style.display = (!q || t.includes(q)) ? '' : 'none';
          });
        });
      }

      $$('[data-toggle-emp]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.toggleEmp;
        const emp = STATE.employees.find(e=>e.id===id);
        if(!emp) return;
        emp.active = !emp.active;
        save(STATE);
        toast('تم التحديث', emp.active ? 'تفعيل الموظف' : 'إيقاف الموظف');
        renderScreen('employees');
      }));

      $$('[data-edit-emp]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.editEmp;
        const emp = STATE.employees.find(e=>e.id===id);
        if(!emp) return;
        const deptOptions = ['<option value="">— بدون قسم —</option>']
          .concat(STATE.departments.map(d=>`<option value="${d.id}" ${d.id===emp.deptId?'selected':''}>${escapeHtml(d.name)}</option>`)).join('');
        openModal('تعديل الموظف', `
          <form id="formEditEmp" class="form">
            <label class="label">الاسم</label>
            <input class="input" name="name" value="${escapeHtml(emp.name)}" required />
            <label class="label">الكود (اختياري)</label>
            <input class="input" name="code" value="${escapeHtml(emp.code||'')}" />
            <label class="label">القسم</label>
            <select class="select" name="deptId">${deptOptions}</select>
            <label class="label">الراتب الشهري</label>
            <input class="input" type="number" name="salary" value="${escapeHtml(emp.salary||0)}" />
            <button class="btn btn--primary" type="submit">حفظ</button>
          </form>
        `);
        $('#formEditEmp').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          emp.name = String(fd.get('name')||'').trim();
          emp.code = String(fd.get('code')||'').trim();
          emp.deptId = String(fd.get('deptId')||'');
          emp.salary = Number(fd.get('salary')||0);
          save(STATE);
          closeModal();
          toast('تم الحفظ', emp.name);
          renderScreen('employees');
        });
      }));
    }

    if(key === 'managers'){
      const form = $('#formAddMgr');
      if(form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const username = String(fd.get('username')||'').trim();
        const password = String(fd.get('password')||'').trim();
        if(!username || !password) return;
        if(username === 'admin'){
          toast('مرفوض', 'لا يمكن استخدام اسم admin');
          return;
        }
        if(STATE.managers.some(m=>m.username===username)){
          toast('موجود', 'اسم المستخدم مستخدم مسبقاً');
          return;
        }
        STATE.managers.push({ id: uid(), username, passwordHash: await hash(password), active:true });
        save(STATE);
        toast('تم الإنشاء', username);
        renderScreen('managers');
      });

      $$('[data-toggle-mgr]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.toggleMgr;
        const mgr = STATE.managers.find(m=>m.id===id);
        if(!mgr) return;
        mgr.active = !mgr.active;
        save(STATE);
        toast('تم التحديث', mgr.active ? 'تفعيل المدير' : 'إيقاف المدير');
        renderScreen('managers');
      }));

      $$('[data-reset-mgr]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.resetMgr;
        const mgr = STATE.managers.find(m=>m.id===id);
        if(!mgr) return;
        openModal('تغيير كلمة المرور', `
          <form id="formResetMgr" class="form">
            <div class="muted small">المستخدم: <span class="code">${escapeHtml(mgr.username)}</span></div>
            <label class="label">كلمة المرور الجديدة</label>
            <input class="input" type="password" name="password" required />
            <button class="btn btn--primary" type="submit">حفظ</button>
          </form>
        `);
        $('#formResetMgr').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          mgr.passwordHash = await hash(String(fd.get('password')||''));
          save(STATE);
          closeModal();
          toast('تم الحفظ', 'تم تحديث كلمة المرور');
        });
      }));
    }

    if(key === 'month'){
      const btn = $('#btnLoadMonth');
      const form = $('#formMonth');
      if(btn && form){
        btn.addEventListener('click', () => {
          const ym = String(new FormData(form).get('ym')||'').trim();
          if(!/^\d{4}-\d{2}$/.test(ym)){ toast('صيغة غير صحيحة', 'اكتب YYYY-MM'); return; }
          ensureMonth(ym);
          save(STATE);
          toast('تم التحميل', monthLabel(ym));
          // render with that month values by temporarily changing current month? We'll just swap to it by editing date input for now:
          // Simpler: store selected month in session
          sessionStorage.setItem('apw_selected_month', ym);
          renderScreen('month');
        });
      }
      if(form && SESSION.role==='admin'){
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const ym = String(fd.get('ym')||'').trim();
          if(!/^\d{4}-\d{2}$/.test(ym)){ toast('صيغة غير صحيحة', 'اكتب YYYY-MM'); return; }
          ensureMonth(ym);
          const s = STATE.monthSettings[ym];
          // update
          ['daysInMonth','hoursInMonth','startTime','endTime','lateGraceMin','latePenaltyFactor','earlyGraceMin','earlyPenaltyFactor','overtimeStartAfterMin','overtimeFactor','rounding']
            .forEach(k=>{
              let v = fd.get(k);
              if(v===null || v===undefined) return;
              if(['startTime','endTime'].includes(k)) s[k] = String(v);
              else s[k] = Number(v);
            });
          save(STATE);
          toast('تم الحفظ', `إعدادات ${monthLabel(ym)}`);
          renderScreen('month');
        });
      }

      // override default month display if selected
      const selected = sessionStorage.getItem('apw_selected_month');
      if(selected && /^\d{4}-\d{2}$/.test(selected)){
        // patch values by re-rendering with selected month
        // We'll do a quick, safe patch: if input exists, set it and rewrite values accordingly
        // but since renderMonthSettings uses current month, we re-render here:
        // A bit hacky but reliable:
        const ymInput = $('input[name="ym"]');
        if(ymInput && ymInput.value !== selected){
          // Re-render with selected:
          const originalGet = getMonthKey;
        }
      }
    }

    if(key === 'attendance'){
      const form = $('#formAddAtt');
      if(form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ym = getMonthKey();
        ensureMonth(ym);
        const fd = new FormData(form);
        const rec = {
          id: uid(),
          employeeId: String(fd.get('employeeId')),
          date: String(fd.get('date')),
          inTime: String(fd.get('inTime')||''),
          outTime: String(fd.get('outTime')||''),
          absentWithExcuse: !!fd.get('absentWithExcuse'),
          lateWithExcuse: !!fd.get('lateWithExcuse'),
          earlyWithExcuse: !!fd.get('earlyWithExcuse'),
          manualOvertimeMin: Number(fd.get('manualOvertimeMin')||0),
          note: String(fd.get('note')||'') // hidden from employee
        };
        // If absent with excuse, clear times
        if(rec.absentWithExcuse){
          rec.inTime=''; rec.outTime='';
        }
        STATE.attendance[ym].push(rec);
        save(STATE);
        toast('تم الحفظ', 'تم تسجيل الدوام');
        renderScreen('attendance');
      });

      $$('[data-del-att]').forEach(btn => btn.addEventListener('click', () => {
        const ym = getMonthKey();
        const id = btn.dataset.delAtt;
        STATE.attendance[ym] = (STATE.attendance[ym]||[]).filter(r=>r.id!==id);
        save(STATE);
        toast('تم الحذف');
        renderScreen('attendance');
      }));

      $$('[data-edit-att]').forEach(btn => btn.addEventListener('click', () => {
        const ym = getMonthKey();
        const id = btn.dataset.editAtt;
        const rec = (STATE.attendance[ym]||[]).find(r=>r.id===id);
        if(!rec) return;

        const emp = STATE.employees.find(e=>e.id===rec.employeeId);
        const d = computeAttendanceDerived(ym, rec);

        openModal('تعديل الدوام', `
          <form id="formEditAtt" class="form">
            <div class="muted small">الموظف: <span class="code">${escapeHtml(emp?.name||'—')}</span></div>
            <label class="label">التاريخ</label>
            <input class="input" type="date" name="date" value="${escapeHtml(rec.date)}" required />
            <div class="row row--2">
              <div>
                <label class="label">الدخول</label>
                <input class="input" type="time" name="inTime" value="${escapeHtml(rec.inTime||'')}" />
              </div>
              <div>
                <label class="label">الخروج</label>
                <input class="input" type="time" name="outTime" value="${escapeHtml(rec.outTime||'')}" />
              </div>
            </div>
            <div class="row row--2">
              <label class="pill"><input type="checkbox" name="absentWithExcuse" ${rec.absentWithExcuse?'checked':''}/> غياب بعذر</label>
              <label class="pill"><input type="checkbox" name="lateWithExcuse" ${rec.lateWithExcuse?'checked':''}/> تأخير بعذر</label>
              <label class="pill"><input type="checkbox" name="earlyWithExcuse" ${rec.earlyWithExcuse?'checked':''}/> انصراف بعذر</label>
            </div>
            <label class="label">إضافي يدوي (دقائق)</label>
            <input class="input" type="number" name="manualOvertimeMin" value="${escapeHtml(rec.manualOvertimeMin||0)}" />
            <label class="label">ملاحظة (لن يراها الموظف)</label>
            <input class="input" name="note" value="${escapeHtml(rec.note||'')}" />
            <div class="hint">
              <div class="muted small">الحساب الحالي (بعد الإعدادات): إضافي ${d.overtimeMin}د • تأخير ${d.lateMin}د • انصراف ${d.earlyMin}د</div>
            </div>
            <button class="btn btn--primary" type="submit">حفظ</button>
          </form>
        `);

        $('#formEditAtt').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          rec.date = String(fd.get('date'));
          rec.inTime = String(fd.get('inTime')||'');
          rec.outTime = String(fd.get('outTime')||'');
          rec.absentWithExcuse = !!fd.get('absentWithExcuse');
          rec.lateWithExcuse = !!fd.get('lateWithExcuse');
          rec.earlyWithExcuse = !!fd.get('earlyWithExcuse');
          rec.manualOvertimeMin = Number(fd.get('manualOvertimeMin')||0);
          rec.note = String(fd.get('note')||'');
          if(rec.absentWithExcuse){ rec.inTime=''; rec.outTime=''; }
          save(STATE);
          closeModal();
          toast('تم الحفظ');
          renderScreen('attendance');
        });
      }));
    }

    if(key === 'advances'){
      const form = $('#formAdvance');
      if(form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ym = getMonthKey();
        ensureMonth(ym);
        const fd = new FormData(form);
        const employeeId = String(fd.get('employeeId'));
        const amount = Number(fd.get('amount')||0);
        STATE.advances[ym][employeeId] = amount;
        save(STATE);
        toast('تم الحفظ', 'تم تحديث السلفة');
        renderScreen('advances');
      });
    }

    if(key === 'payroll'){
      $$('[data-pdf]').forEach(btn => btn.addEventListener('click', () => {
        const employeeId = btn.dataset.pdf;
        generatePaySlipPDF(getMonthKey(), employeeId, {forEmployee:false});
      }));
    }

    if(key === 'excel'){
      const e1 = $('#btnXlsxExport'); if(e1) e1.addEventListener('click', exportAllXlsx);
      const e2 = $('#btnXlsxTplEmp'); if(e2) e2.addEventListener('click', exportEmployeesTemplate);
      const e3 = $('#btnXlsxTplAtt'); if(e3) e3.addEventListener('click', exportAttendanceTemplate);
      const e4 = $('#btnXlsxImport'); if(e4) e4.addEventListener('click', () => { filePicker.value=''; filePicker.accept='.xlsx'; filePicker.click(); });
    }

    if(key === 'sync'){
      const a = $('#btnSyncAdminExport'); if(a) a.addEventListener('click', () => exportSyncJson({mode:'admin'}));
      const b = $('#btnSyncEmployeeExport'); if(b) b.addEventListener('click', () => exportSyncJson({mode:'employee'}));
      const c = $('#btnSyncImport'); if(c) c.addEventListener('click', () => { filePicker.value=''; filePicker.accept='.json'; filePicker.click(); });
    }

    if(key === 'paySlip'){
      const now = $('#btnEmpSlipNow2');
      if(now) now.addEventListener('click', () => generatePaySlipPDF(getMonthKey(), SESSION.employeeId, {forEmployee:true}));
      const prev = $('#btnEmpSlipPrev2');
      if(prev) prev.addEventListener('click', () => {
        const ym = getMonthKey();
        const [y,m] = ym.split('-').map(Number);
        const d = new Date(y, m-2, 1);
        const prevKey = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
        generatePaySlipPDF(prevKey, SESSION.employeeId, {forEmployee:true});
      });
    }
  };

  // -------- Files / Export / Import --------
  const downloadBlob = (blob, filename) => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  };

  const exportSyncJson = ({mode='admin'}={}) => {
    const now = Date.now();
    const ym = getMonthKey();
    const [y,m] = ym.split('-').map(Number);
    const prevDate = new Date(y, m-2, 1);
    const prev = `${prevDate.getFullYear()}-${pad2(prevDate.getMonth()+1)}`;

    ensureMonth(ym); ensureMonth(prev);

    let payload = {};
    if(mode==='admin'){
      payload = { type:'apw_sync_admin_v1', exportedAt: now, state: STATE };
    } else {
      // Employee sync: only what they need, and NO notes + NO admin identifiers.
      const stripNotes = (recs) => recs.map(r => ({
        id: r.id, employeeId: r.employeeId, date: r.date, inTime: r.inTime, outTime: r.outTime,
        absentWithExcuse: !!r.absentWithExcuse,
        lateWithExcuse: !!r.lateWithExcuse,
        earlyWithExcuse: !!r.earlyWithExcuse,
        manualOvertimeMin: Number(r.manualOvertimeMin||0)
      }));

      payload = {
        type:'apw_sync_employee_v1',
        exportedAt: now,
        company: { name: STATE.company.name, logoDataUrl: STATE.company.logoDataUrl },
        departments: STATE.departments,
        employees: STATE.employees.filter(e=>e.active).map(e=>({
          id:e.id, name:e.name, code:e.code, deptId:e.deptId, salary:e.salary, active:e.active
        })),
        monthSettings: { [ym]: STATE.monthSettings[ym], [prev]: STATE.monthSettings[prev] },
        attendance: { [ym]: stripNotes(STATE.attendance[ym]||[]), [prev]: stripNotes(STATE.attendance[prev]||[]) },
        advances: { [ym]: STATE.advances[ym]||{}, [prev]: STATE.advances[prev]||{} }
      };
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const fname = (mode==='admin') ? `sync-admin-${getMonthKey()}-${new Date().toISOString().slice(0,10)}.json`
                                  : `sync-employee-${getMonthKey()}-${new Date().toISOString().slice(0,10)}.json`;
    downloadBlob(blob, fname);
    toast('تم التصدير', fname);
  };

  const importSyncJson = (data) => {
    if(!data || !data.type) throw new Error('Invalid');
    if(data.type === 'apw_sync_admin_v1'){
      // Admin import: overwrite full state
      if(SESSION.role !== 'admin'){
        toast('مرفوض', 'استيراد Admin متاح للإدارة فقط');
        return;
      }
      STATE = data.state;
      save(STATE);
      refreshBrand();
      bootApp();
      return;
    }
    if(data.type === 'apw_sync_employee_v1'){
      // Employee import: merge into local state, but keep user session.
      // Only keep allowed fields; never accept managers from this file.
      const merged = defaultState();
      merged.company = data.company || merged.company;
      merged.departments = Array.isArray(data.departments) ? data.departments : merged.departments;
      merged.employees = Array.isArray(data.employees) ? data.employees : merged.employees;
      merged.monthSettings = data.monthSettings || {};
      merged.attendance = data.attendance || {};
      merged.advances = data.advances || {};
      // No managers, no audit.
      STATE = merged;
      save(STATE);
      refreshBrand();
      bootApp();
      return;
    }
    throw new Error('Unknown type');
  };

  const ensureXLSX = () => {
    if(!window.XLSX) throw new Error('مكتبة XLSX غير محملة بعد. تأكد من الاتصال بالإنترنت أول مرة.');
    return window.XLSX;
  };

  const exportAllXlsx = () => {
    const XLSX = ensureXLSX();
    const wb = XLSX.utils.book_new();

    // Company
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([STATE.company]), 'Company');
    // Departments
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.departments), 'Departments');
    // Employees
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.employees), 'Employees');
    // Settings (flatten by month)
    const settingsRows = Object.entries(STATE.monthSettings||{}).map(([ym, s]) => ({ ym, ...s }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), 'Settings');

    // Attendance (all months)
    const attRows = [];
    Object.entries(STATE.attendance||{}).forEach(([ym, arr]) => {
      (arr||[]).forEach(r => attRows.push({ ym, ...r }));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attRows), 'Attendance');

    // Advances (flatten)
    const advRows = [];
    Object.entries(STATE.advances||{}).forEach(([ym, map]) => {
      Object.entries(map||{}).forEach(([employeeId, amount]) => advRows.push({ ym, employeeId, amount }));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advRows), 'Advances');

    XLSX.writeFile(wb, `attendance-payroll-${getMonthKey()}.xlsx`);
    toast('تم التصدير', 'XLSX');
  };

  const exportEmployeesTemplate = () => {
    const XLSX = ensureXLSX();
    const wb = XLSX.utils.book_new();
    const tpl = [
      { name:'اسم الموظف', code:'كود اختياري', dept:'اسم القسم', salary:8000, active:true }
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tpl), 'Employees');
    XLSX.writeFile(wb, 'template-employees.xlsx');
    toast('تم التصدير', 'template-employees.xlsx');
  };

  const exportAttendanceTemplate = () => {
    const XLSX = ensureXLSX();
    const wb = XLSX.utils.book_new();
    const tpl = [
      { ym:'2026-02', employeeName:'اسم الموظف', date:'2026-02-01', inTime:'09:05', outTime:'17:10', absentWithExcuse:false, lateWithExcuse:false, earlyWithExcuse:false, manualOvertimeMin:0, note:'ملاحظة داخلية' }
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tpl), 'Attendance');
    XLSX.writeFile(wb, 'template-attendance.xlsx');
    toast('تم التصدير', 'template-attendance.xlsx');
  };

  const importFromXlsx = async (file) => {
    const XLSX = ensureXLSX();
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array'});
    const sheetNames = wb.SheetNames;

    const readJson = (name) => {
      const sh = wb.Sheets[name];
      if(!sh) return null;
      return XLSX.utils.sheet_to_json(sh, {defval:''});
    };

    // Detect sheets
    const employees = readJson('Employees');
    const attendance = readJson('Attendance');
    const departments = readJson('Departments');
    const company = readJson('Company');
    const settings = readJson('Settings');
    const advances = readJson('Advances');

    // Apply (Admin only for full import)
    if(SESSION.role !== 'admin'){
      // Employee can only import sync JSON, not XLSX
      toast('مرفوض', 'استيراد XLSX متاح للإدارة فقط');
      return;
    }

    if(company && company.length){
      const c = company[0];
      STATE.company = { name: String(c.name||c.company||c.companyName||STATE.company.name), logoDataUrl: String(c.logoDataUrl||STATE.company.logoDataUrl||'') };
    }
    if(departments){
      const clean = departments
        .map(d=>({ id: String(d.id||uid()), name: String(d.name||d.dept||'').trim() }))
        .filter(d=>d.name);
      if(clean.length) STATE.departments = clean;
    }
    if(employees){
      // Accept both formats: our format or template format
      const byDeptName = (name) => STATE.departments.find(d=>d.name===name)?.id || '';
      const clean = employees.map(r=>{
        const name = String(r.name||r['اسم الموظف']||r.employeeName||'').trim();
        if(!name) return null;
        const deptName = String(r.dept||r['اسم القسم']||'').trim();
        const deptId = r.deptId ? String(r.deptId) : (deptName ? byDeptName(deptName) : '');
        return {
          id: String(r.id||uid()),
          name,
          code: String(r.code||r['كود اختياري']||'').trim(),
          deptId,
          salary: Number(r.salary||r['الراتب']||0),
          active: (String(r.active||'true').toLowerCase()!=='false')
        };
      }).filter(Boolean);
      if(clean.length) STATE.employees = clean;
    }
    if(settings){
      const map = {};
      settings.forEach(r=>{
        const ym = String(r.ym||'').trim();
        if(!/^\d{4}-\d{2}$/.test(ym)) return;
        map[ym] = {
          daysInMonth: Number(r.daysInMonth||30),
          hoursInMonth: Number(r.hoursInMonth||176),
          startTime: String(r.startTime||'09:00'),
          endTime: String(r.endTime||'17:00'),
          lateGraceMin: Number(r.lateGraceMin||10),
          latePenaltyFactor: Number(r.latePenaltyFactor||1.5),
          earlyGraceMin: Number(r.earlyGraceMin||10),
          earlyPenaltyFactor: Number(r.earlyPenaltyFactor||1.5),
          overtimeStartAfterMin: Number(r.overtimeStartAfterMin||0),
          overtimeFactor: Number(r.overtimeFactor||1.25),
          rounding: Number(r.rounding||5)
        };
      });
      STATE.monthSettings = { ...STATE.monthSettings, ...map };
    }
    if(attendance){
      // expected columns: ym, employeeId OR employeeName, date, inTime, outTime...
      attendance.forEach(r=>{
        const ym = String(r.ym||'').trim();
        if(!/^\d{4}-\d{2}$/.test(ym)) return;
        ensureMonth(ym);
        let employeeId = String(r.employeeId||'').trim();
        if(!employeeId){
          const employeeName = String(r.employeeName||r['اسم الموظف']||'').trim();
          const emp = STATE.employees.find(e=>e.name===employeeName);
          if(emp) employeeId = emp.id;
        }
        if(!employeeId) return;
        const rec = {
          id: String(r.id||uid()),
          employeeId,
          date: String(r.date||'').trim(),
          inTime: String(r.inTime||'').trim(),
          outTime: String(r.outTime||'').trim(),
          absentWithExcuse: String(r.absentWithExcuse||'false').toLowerCase()==='true',
          lateWithExcuse: String(r.lateWithExcuse||'false').toLowerCase()==='true',
          earlyWithExcuse: String(r.earlyWithExcuse||'false').toLowerCase()==='true',
          manualOvertimeMin: Number(r.manualOvertimeMin||0),
          note: String(r.note||'') // internal
        };
        if(!rec.date) return;
        STATE.attendance[ym].push(rec);
      });
    }
    if(advances){
      advances.forEach(r=>{
        const ym = String(r.ym||'').trim();
        if(!/^\d{4}-\d{2}$/.test(ym)) return;
        ensureMonth(ym);
        const employeeId = String(r.employeeId||'').trim();
        if(!employeeId) return;
        STATE.advances[ym][employeeId] = Number(r.amount||0);
      });
    }

    save(STATE);
    refreshBrand();
    bootApp();
  };

  const fileToDataUrl = (file) => new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result||''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // -------- PDF Pay Slip --------
  const ensurePDF = () => {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if(!jsPDF) throw new Error('مكتبة PDF غير محملة بعد. تأكد من الاتصال بالإنترنت أول مرة.');
    return jsPDF;
  };

  const generatePaySlipPDF = (ym, employeeId, {forEmployee=false}={}) => {
    ensureMonth(ym);
    const emp = STATE.employees.find(e=>e.id===employeeId);
    if(!emp){ toast('غير موجود', 'الموظف غير موجود'); return; }

    // access: employee only self
    if(SESSION.role === 'employee' && SESSION.employeeId !== employeeId){
      toast('مرفوض', 'لا يمكنك عرض موظف آخر');
      return;
    }

    const dept = STATE.departments.find(d=>d.id===emp.deptId)?.name || '—';
    const payroll = computePayrollForEmployee(ym, employeeId);
    const s = STATE.monthSettings[ym] || {};
    const recs = (STATE.attendance[ym]||[])
      .filter(r=>r.employeeId===employeeId)
      .slice()
      .sort((a,b)=> a.date.localeCompare(b.date));

    // Build table rows; hide notes always from PDF (per request: employee shouldn't see notes; keep clean)
    const rows = recs.map(r=>{
      const d = computeAttendanceDerived(ym, r);
      return [
        r.date,
        dayNameFromISO(r.date),
        r.inTime || '—',
        r.outTime || '—',
        String(d.overtimeMin),
        String(d.lateMin),
        String(d.earlyMin),
      ];
    });

    const jsPDF = ensurePDF();
    const doc = new jsPDF({orientation:'portrait', unit:'pt', format:'a4'});

    // Arabic in jsPDF: basic. Without embedding Arabic font, rendering may not be perfect in some viewers.
    // We will keep text mostly numeric + short Arabic. Many browsers still render ok; for perfect Arabic needs custom font.
    const margin = 40;
    let y = 42;

    // Header
    doc.setFontSize(14);
    doc.text(`${STATE.company.name || ''}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'});
    y += 18;

    doc.setFontSize(11);
    doc.text(`صك قبض شهري`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'});
    y += 18;

    // Logo if exists (best effort)
    if(STATE.company.logoDataUrl){
      try{
        doc.addImage(STATE.company.logoDataUrl, 'PNG', margin, 22, 52, 52);
      }catch(e){}
    }

    doc.setFontSize(10);
    doc.text(`الموظف: ${emp.name}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;
    doc.text(`القسم: ${dept}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;
    doc.text(`الشهر: ${monthLabel(ym)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;

    y += 8;

    // Table
    if(doc.autoTable){
      doc.autoTable({
        startY: y,
        head: [[ 'التاريخ', 'اليوم', 'الدخول', 'الخروج', 'الإضافي (د)', 'التأخير (د)', 'الانصراف (د)' ]],
        body: rows.length ? rows : [[ '—','—','—','—','0','0','0' ]],
        styles: { fontSize: 9, halign: 'right' },
        headStyles: { fillColor: [20,24,39], textColor: [233,238,252] },
        theme: 'grid',
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 14;
    } else {
      y += 10;
    }

    // Totals
    const tOverMin = payroll?.sumOverMin||0;
    const tLateMin = payroll?.sumLateMin||0;
    const tEarlyMin = payroll?.sumEarlyMin||0;

    doc.setFontSize(11);
    doc.text('المجاميع', doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;

    doc.setFontSize(10);
    doc.text(`مجموع الإضافي: ${tOverMin} دقيقة • القيمة: ${fmtMoney(payroll?.overtimeValue||0)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;
    doc.text(`مجموع التأخير: ${tLateMin} دقيقة • الخصم: ${fmtMoney(payroll?.latePenalty||0)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;
    doc.text(`مجموع الانصراف المبكر: ${tEarlyMin} دقيقة • الخصم: ${fmtMoney(payroll?.earlyPenalty||0)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;
    doc.text(`السلف: ${fmtMoney(payroll?.advances||0)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=14;

    doc.setFontSize(12);
    doc.text(`المستحق النهائي: ${fmtMoney(payroll?.net||0)}`, doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=18;

    y += 10;
    doc.setFontSize(10);
    doc.text('توقيع الموظف: ____________________', doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=16;
    doc.text('توقيع الإدارة: ____________________', doc.internal.pageSize.getWidth()-margin, y, {align:'right'}); y+=16;

    const filename = `pay-slip-${emp.name}-${ym}.pdf`.replace(/[\/:*?"<>|]/g,'-');
    doc.save(filename);
    toast('تم إنشاء PDF', filename);
  };

  // -------- Boot / Main --------
  const bootApp = () => {
    refreshBrand();
    setShell(!!SESSION);

    if(!SESSION){
      screenLogin.style.display = '';
      screenDashboard.style.display = 'none';
      sidebar.style.display = 'none';
      return;
    }

    screenLogin.style.display = 'none';
    screenDashboard.style.display = '';
    renderNav();
    setSessionInfo();

    // default route
    const first = (routes[SESSION.role]||[])[0]?.key || 'home';
    setActiveRoute(first);

    // Force employee view limits: only current + previous in stored data? We won't delete, but we won't display beyond.
  };

  // Initial boot
  bootApp();

})();
