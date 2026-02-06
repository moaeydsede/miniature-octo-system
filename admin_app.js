\
(function(){
  const sess = requireRole(location.pathname.endsWith("manager.html") ? "MANAGER" : "ADMIN");
  const roleLabel = sess.role==="ADMIN" ? "Admin" : "Manager";
  document.getElementById("topbar").innerHTML = renderTopbar({
    title: sess.role==="ADMIN" ? "لوحة الإدارة" : "لوحة المدير",
    subtitle: sess.role==="ADMIN" ? "تحكم كامل — إعدادات، موظفين، دوام، رواتب، PDF، Excel" : "تسجيل دوام + أعذار + تقارير",
    role: roleLabel
  });

  const isAdmin = sess.role === "ADMIN";
  // hide tabs not allowed for manager
  const tabs = [...document.querySelectorAll(".tab")];
  if(!isAdmin){
    // manager cannot edit company/auth/departments/employees/settings/managers, only attendance/payroll/sync viewing
    const deny = new Set(["company","departments","employees","settings","managers"]);
    tabs.forEach(b=>{
      const t = b.getAttribute("data-tab");
      if(deny.has(t)) b.style.display="none";
    });
  }

  const view = document.getElementById("view");
  let currentTab = "dashboard";

  function setTab(tab){
    currentTab = tab;
    tabs.forEach(b=>{
      const t = b.getAttribute("data-tab");
      if(t===tab){
        b.className = "tab px-4 py-2 rounded-2xl bg-slate-900 text-white text-sm font-semibold";
      } else {
        b.className = "tab px-4 py-2 rounded-2xl bg-slate-100 text-slate-800 text-sm font-semibold";
      }
    });
    render();
  }

  tabs.forEach(b=>b.onclick = ()=>setTab(b.getAttribute("data-tab")));

  function getCfg(ym){
    const st = loadState();
    const cfg = st.settingsByMonth[ym];
    if(cfg) return cfg;
    // auto create if missing
    const [y,m] = ym.split("-").map(Number);
    const n = new Date(y,m,0).getDate();
    st.settingsByMonth[ym] = {
      year:y, month:m, daysInMonth:n, hoursInMonth:208,
      shiftStart:"10:00", shiftEnd:"17:00",
      lateGraceMin:0, lateMultiplier:1.5, earlyGraceMin:0, earlyMultiplier:1.0,
      overtimeStartAfterMin:0, overtimeMultiplier:1.5,
      rounding:"MINUTE"
    };
    saveState(st);
    return st.settingsByMonth[ym];
  }

  function render(){
    const st = loadState();
    const d = new Date();
    const ym = ymKey(d.getFullYear(), d.getMonth()+1);

    if(currentTab==="dashboard"){
      const empCount = st.employees.filter(e=>e.active!==false).length;
      const deptCount = st.departments.length;
      const mgrCount = (st.auth.managers||[]).length;
      const cfg = getCfg(ym);

      view.innerHTML = `
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="bg-white card p-5">
          <div class="text-sm text-slate-500">الموظفين النشطين</div>
          <div class="text-3xl font-extrabold mt-2">${empCount}</div>
        </div>
        <div class="bg-white card p-5">
          <div class="text-sm text-slate-500">الأقسام</div>
          <div class="text-3xl font-extrabold mt-2">${deptCount}</div>
        </div>
        <div class="bg-white card p-5">
          <div class="text-sm text-slate-500">المدراء</div>
          <div class="text-3xl font-extrabold mt-2">${mgrCount}</div>
        </div>
      </div>

      <div class="bg-white card p-5 mt-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="text-lg font-bold">الشهر الحالي: ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})</div>
            <div class="text-sm text-slate-500 mt-1">الأيام: ${cfg.daysInMonth} — ساعات الشهر: ${cfg.hoursInMonth} — خصم التأخير: ${cfg.lateMultiplier}</div>
          </div>
          <button class="px-4 py-3 rounded-2xl bg-slate-900 text-white font-semibold" onclick="window.open('./employee.html','_blank')">معاينة بوابة الموظف</button>
        </div>
        <div class="mt-3 text-sm text-slate-600">
          ملاحظة مهمة: بدون سيرفر، بيانات كل جهاز مستقلة. لتحديث أجهزة الموظفين استخدم: (مزامنة → تصدير ملف مزامنة) ثم الموظف يستورد الملف في بوابته.
        </div>
      </div>
      `;
      return;
    }

    if(currentTab==="company"){
      const c = st.company;
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">بيانات الشركة</div>
        <div class="grid gap-4 mt-4 sm:grid-cols-2">
          <div>
            <label class="text-sm text-slate-600">اسم الشركة</label>
            <input id="coName" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${c.name||""}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">شعار الشركة</label>
            <input id="coLogo" type="file" accept="image/*" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3 bg-white"/>
            <div class="text-xs text-slate-500 mt-2">سيظهر في صك القبض وشاشات الموظف.</div>
          </div>
        </div>
        <div class="mt-4 flex items-center gap-3">
          <button id="saveCompany" class="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">حفظ</button>
          ${c.logoDataUrl ? `<img src="${c.logoDataUrl}" class="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-200"/>` : ``}
        </div>
      </div>`;
      document.getElementById("saveCompany").onclick = async ()=>{
        const st2 = loadState();
        st2.company.name = document.getElementById("coName").value.trim() || "اسم الشركة";
        const f = document.getElementById("coLogo").files[0];
        if(f){
          st2.company.logoDataUrl = await fileToDataUrl(f);
        }
        addAudit(st2, "company_update", { name: st2.company.name, hasLogo: !!st2.company.logoDataUrl });
        saveState(st2);
        toast("تم حفظ بيانات الشركة");
        render();
      };
      return;
    }

    if(currentTab==="departments"){
      const rows = st.departments;
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="text-lg font-bold">الأقسام</div>
          <div class="flex gap-2">
            <input id="deptName" class="border border-slate-200 rounded-2xl px-3 py-2" placeholder="اسم القسم"/>
            <button id="addDept" class="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold">إضافة</button>
          </div>
        </div>

        <div class="mt-4 grid gap-2">
          ${rows.map(d=>`
            <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="font-semibold">${d.name}</div>
              <button data-id="${d.id}" class="delDept px-3 py-2 rounded-2xl bg-rose-600 text-white text-sm">حذف</button>
            </div>
          `).join("") || `<div class="text-sm text-slate-500">لا يوجد أقسام</div>`}
        </div>
      </div>`;
      document.getElementById("addDept").onclick = ()=>{
        const name = document.getElementById("deptName").value.trim();
        if(!name) return toast("اكتب اسم القسم", false);
        const st2 = loadState();
        st2.departments.push({ id: uuid(), name });
        addAudit(st2, "dept_add", { name });
        saveState(st2);
        toast("تمت إضافة القسم");
        render();
      };
      [...document.querySelectorAll(".delDept")].forEach(b=>b.onclick=()=>{
        const id=b.getAttribute("data-id");
        const st2 = loadState();
        st2.departments = st2.departments.filter(x=>x.id!==id);
        // detach employees
        st2.employees = st2.employees.map(e=>({ ...e, departmentId: e.departmentId===id ? null : e.departmentId }));
        addAudit(st2, "dept_delete", { id });
        saveState(st2);
        toast("تم حذف القسم");
        render();
      });
      return;
    }

    if(currentTab==="employees"){
      const deptMap = Object.fromEntries(st.departments.map(d=>[d.id,d.name]));
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">الموظفين</div>
        <div class="grid gap-3 mt-4 sm:grid-cols-4">
          <input id="eName" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="اسم الموظف"/>
          <input id="eCode" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="كود الموظف (اختياري)"/>
          <select id="eDept" class="border border-slate-200 rounded-2xl px-3 py-3 bg-white">
            <option value="">اختر القسم</option>
            ${st.departments.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}
          </select>
          <input id="eSalary" type="number" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="الراتب الشهري"/>
        </div>
        <div class="mt-3">
          <button id="addEmp" class="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">إضافة موظف</button>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="text-sm text-slate-500">دخول الموظف باسم الموظف فقط (عرض فقط).</div>
            <input id="empSearch" class="border border-slate-200 rounded-2xl px-3 py-2" placeholder="بحث بالاسم"/>
          </div>
          <div id="empList" class="mt-3 grid gap-2"></div>
        </div>
      </div>`;
      const list = document.getElementById("empList");
      function renderList(filter=""){
        const rows = st.employees
          .filter(e=>e.active!==false)
          .filter(e=>!filter || e.name.includes(filter));
        list.innerHTML = rows.map(e=>`
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-between gap-2">
            <div>
              <div class="font-bold">${e.name}</div>
              <div class="text-xs text-slate-500 mt-1">القسم: ${deptMap[e.departmentId]||"-"} — الراتب: ${e.monthlySalary}</div>
            </div>
            <div class="flex gap-2">
              <button class="editEmp px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm" data-id="${e.id}">تعديل</button>
              <button class="delEmp px-3 py-2 rounded-2xl bg-rose-600 text-white text-sm" data-id="${e.id}">حذف</button>
            </div>
          </div>
        `).join("") || `<div class="text-sm text-slate-500">لا يوجد موظفين</div>`;
        [...document.querySelectorAll(".delEmp")].forEach(b=>b.onclick=()=>{
          const id=b.getAttribute("data-id");
          const st2=loadState();
          st2.employees = st2.employees.map(e=> e.id===id ? ({...e, active:false}) : e);
          addAudit(st2,"emp_disable",{id});
          saveState(st2);
          toast("تم إيقاف الموظف");
          location.reload();
        });
        [...document.querySelectorAll(".editEmp")].forEach(b=>b.onclick=()=>{
          const id=b.getAttribute("data-id");
          const st2=loadState();
          const emp=st2.employees.find(x=>x.id===id);
          if(!emp) return;
          const name = prompt("اسم الموظف", emp.name) ?? emp.name;
          const salary = Number(prompt("الراتب الشهري", emp.monthlySalary) ?? emp.monthlySalary);
          const deptId = prompt("ID القسم (اختياري) — اتركه فارغ", emp.departmentId||"") ?? (emp.departmentId||"");
          emp.name = name.trim()||emp.name;
          emp.monthlySalary = Number.isFinite(salary) ? salary : emp.monthlySalary;
          emp.departmentId = deptId.trim() || null;
          addAudit(st2,"emp_edit",{id});
          saveState(st2);
          toast("تم تعديل الموظف");
          location.reload();
        });
      }
      renderList();
      document.getElementById("empSearch").oninput = (e)=>renderList(e.target.value.trim());

      document.getElementById("addEmp").onclick = ()=>{
        const name=document.getElementById("eName").value.trim();
        const code=document.getElementById("eCode").value.trim();
        const dept=document.getElementById("eDept").value || null;
        const salary=Number(document.getElementById("eSalary").value);
        if(!name) return toast("اكتب اسم الموظف", false);
        if(!Number.isFinite(salary) || salary<=0) return toast("اكتب راتب صحيح", false);
        const st2=loadState();
        st2.employees.push({ id: uuid(), name, code, departmentId: dept, monthlySalary: salary, active:true });
        addAudit(st2,"emp_add",{name});
        saveState(st2);
        toast("تم إضافة موظف");
        location.reload();
      };
      return;
    }

    if(currentTab==="attendance"){
      const d = new Date();
      const ym = ymKey(d.getFullYear(), d.getMonth()+1);
      const cfg = getCfg(ym);
      const deptMap = Object.fromEntries(st.departments.map(d=>[d.id,d.name]));
      const emps = st.employees.filter(e=>e.active!==false);

      const att = st.attendanceByMonth[ym] || {};
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="text-lg font-bold">تسجيل الدوام — ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})</div>
            <div class="text-sm text-slate-500 mt-1">الدوام: ${cfg.shiftStart} → ${cfg.shiftEnd}</div>
          </div>
          <div class="flex gap-2">
            <input id="attDate" type="date" class="border border-slate-200 rounded-2xl px-3 py-2 bg-white" value="${nowDateISO()}"/>
          </div>
        </div>

        <div class="grid gap-3 mt-4 sm:grid-cols-4">
          <select id="attEmp" class="border border-slate-200 rounded-2xl px-3 py-3 bg-white">
            ${emps.map(e=>`<option value="${e.id}">${e.name} — ${deptMap[e.departmentId]||"-"}</option>`).join("")}
          </select>
          <input id="attIn" type="time" class="border border-slate-200 rounded-2xl px-3 py-3 bg-white" value="10:00"/>
          <input id="attOut" type="time" class="border border-slate-200 rounded-2xl px-3 py-3 bg-white" value="17:00"/>
          <input id="attExtraOT" type="number" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="إضافي يدوي (دقائق) اختياري"/>
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <label class="flex items-center gap-2 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <input id="exAbs" type="checkbox" class="h-5 w-5"/>
            <span class="text-sm font-semibold">غياب بعذر</span>
          </label>
          <label class="flex items-center gap-2 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <input id="exLate" type="checkbox" class="h-5 w-5"/>
            <span class="text-sm font-semibold">تأخير بعذر</span>
          </label>
          <label class="flex items-center gap-2 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <input id="exEarly" type="checkbox" class="h-5 w-5"/>
            <span class="text-sm font-semibold">انصراف مبكر بعذر</span>
          </label>
        </div>

        <div class="mt-3">
          <input id="attNote" class="w-full border border-slate-200 rounded-2xl px-3 py-3" placeholder="ملاحظة (اختياري)"/>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button id="saveAtt" class="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">حفظ اليوم</button>
          <button id="delAtt" class="px-4 py-3 rounded-2xl bg-rose-600 text-white font-semibold">حذف اليوم</button>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="font-bold">عرض سريع</div>
            <input id="attSearch" class="border border-slate-200 rounded-2xl px-3 py-2" placeholder="بحث باسم الموظف"/>
          </div>
          <div id="attList" class="mt-3 grid gap-2"></div>
        </div>
      </div>`;

      function getRec(empId, dateISO){
        return (loadState().attendanceByMonth[ym]||{})[empId]?.[dateISO] || null;
      }
      function fillFromCurrent(){
        const empId = document.getElementById("attEmp").value;
        const dateISO = document.getElementById("attDate").value;
        const rec = getRec(empId, dateISO);
        document.getElementById("attIn").value = rec?.in || cfg.shiftStart;
        document.getElementById("attOut").value = rec?.out || cfg.shiftEnd;
        document.getElementById("exAbs").checked = !!rec?.excuseAbsence;
        document.getElementById("exLate").checked = !!rec?.excuseLate;
        document.getElementById("exEarly").checked = !!rec?.excuseEarly;
        document.getElementById("attNote").value = rec?.note || "";
        document.getElementById("attExtraOT").value = rec?.extraOvertimeMin ?? "";
      }

      document.getElementById("attEmp").onchange = fillFromCurrent;
      document.getElementById("attDate").onchange = fillFromCurrent;
      fillFromCurrent();

      document.getElementById("saveAtt").onclick = ()=>{
        const empId = document.getElementById("attEmp").value;
        const dateISO = document.getElementById("attDate").value;
        if(!dateISO) return toast("اختر تاريخ", false);
        const rec = {
          in: document.getElementById("attIn").value || "",
          out: document.getElementById("attOut").value || "",
          excuseAbsence: document.getElementById("exAbs").checked,
          excuseLate: document.getElementById("exLate").checked,
          excuseEarly: document.getElementById("exEarly").checked,
          note: document.getElementById("attNote").value.trim(),
          extraOvertimeMin: document.getElementById("attExtraOT").value === "" ? null : Number(document.getElementById("attExtraOT").value)
        };
        const st2 = loadState();
        st2.attendanceByMonth[ym] = st2.attendanceByMonth[ym] || {};
        st2.attendanceByMonth[ym][empId] = st2.attendanceByMonth[ym][empId] || {};
        st2.attendanceByMonth[ym][empId][dateISO] = rec;
        addAudit(st2,"attendance_save",{ym, empId, dateISO});
        saveState(st2);
        toast("تم حفظ اليوم");
        render(); // rerender quick list
      };

      document.getElementById("delAtt").onclick = ()=>{
        const empId = document.getElementById("attEmp").value;
        const dateISO = document.getElementById("attDate").value;
        const st2 = loadState();
        if(st2.attendanceByMonth[ym]?.[empId]?.[dateISO]){
          delete st2.attendanceByMonth[ym][empId][dateISO];
          addAudit(st2,"attendance_delete",{ym, empId, dateISO});
          saveState(st2);
          toast("تم حذف اليوم");
          render();
        } else {
          toast("لا يوجد سجل لهذا اليوم", false);
        }
      };

      function renderQuick(filter=""){
        const st3 = loadState();
        const att = st3.attendanceByMonth[ym] || {};
        const deptMap3 = Object.fromEntries(st3.departments.map(d=>[d.id,d.name]));
        const emps3 = st3.employees.filter(e=>e.active!==false).filter(e=>!filter || e.name.includes(filter));
        const list = document.getElementById("attList");
        list.innerHTML = emps3.slice(0, 30).map(e=>{
          const dates = Object.keys(att[e.id]||{}).length;
          return `
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-between gap-2">
              <div>
                <div class="font-bold">${e.name}</div>
                <div class="text-xs text-slate-500 mt-1">القسم: ${deptMap3[e.departmentId]||"-"} — أيام مسجلة هذا الشهر: ${dates}</div>
              </div>
              <button class="px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm" onclick="window.__openEmp('${e.id}')">فتح</button>
            </div>
          `;
        }).join("") || `<div class="text-sm text-slate-500">لا يوجد بيانات</div>`;
      }
      window.__openEmp = (empId)=>{
        document.getElementById("attEmp").value = empId;
        fillFromCurrent();
        toast("تم اختيار الموظف");
      };
      renderQuick();
      document.getElementById("attSearch").oninput = (e)=>renderQuick(e.target.value.trim());
      return;
    }

    if(currentTab==="settings"){
      const d=new Date();
      const ym = ymKey(d.getFullYear(), d.getMonth()+1);
      const cfg = getCfg(ym);
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">إعدادات الشهر</div>
        <div class="text-sm text-slate-500 mt-1">تحدد أيام وساعات الشهر ومعاملات الخصم والإضافي.</div>

        <div class="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label class="text-sm text-slate-600">السنة</label>
            <input id="sYear" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.year}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">الشهر</label>
            <input id="sMonth" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.month}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">أيام الشهر</label>
            <input id="sDays" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.daysInMonth}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">ساعات الشهر</label>
            <input id="sHours" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.hoursInMonth}"/>
          </div>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label class="text-sm text-slate-600">بداية الدوام</label>
            <input id="sStart" type="time" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3 bg-white" value="${cfg.shiftStart}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">نهاية الدوام</label>
            <input id="sEnd" type="time" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3 bg-white" value="${cfg.shiftEnd}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">سماح التأخير (د)</label>
            <input id="sLateGrace" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.lateGraceMin||0}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">معامل خصم التأخير</label>
            <input id="sLateMult" type="number" step="0.01" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.lateMultiplier||1.5}"/>
          </div>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label class="text-sm text-slate-600">سماح الانصراف (د)</label>
            <input id="sEarlyGrace" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.earlyGraceMin||0}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">معامل خصم الانصراف</label>
            <input id="sEarlyMult" type="number" step="0.01" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.earlyMultiplier||1.0}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">يبدأ الإضافي بعد (د)</label>
            <input id="sOtAfter" type="number" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.overtimeStartAfterMin||0}"/>
          </div>
          <div>
            <label class="text-sm text-slate-600">معامل الإضافي</label>
            <input id="sOtMult" type="number" step="0.01" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3" value="${cfg.overtimeMultiplier||1.5}"/>
          </div>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label class="text-sm text-slate-600">التقريب</label>
            <select id="sRound" class="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-3 bg-white">
              <option value="MINUTE" ${cfg.rounding==="MINUTE"?"selected":""}>دقيقة</option>
              <option value="5" ${cfg.rounding==="5"?"selected":""}>5 دقائق</option>
              <option value="15" ${cfg.rounding==="15"?"selected":""}>15 دقيقة</option>
            </select>
          </div>
          <div class="sm:col-span-2 flex items-end">
            <button id="saveSettings" class="w-full px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">حفظ إعدادات هذا الشهر</button>
          </div>
        </div>
      </div>`;

      document.getElementById("saveSettings").onclick = ()=>{
        const y = Number(document.getElementById("sYear").value);
        const m = Number(document.getElementById("sMonth").value);
        const key = ymKey(y,m);
        const st2=loadState();
        st2.settingsByMonth[key] = {
          year:y, month:m,
          daysInMonth: Number(document.getElementById("sDays").value),
          hoursInMonth: Number(document.getElementById("sHours").value),
          shiftStart: document.getElementById("sStart").value,
          shiftEnd: document.getElementById("sEnd").value,
          lateGraceMin: Number(document.getElementById("sLateGrace").value||0),
          lateMultiplier: Number(document.getElementById("sLateMult").value||1.5),
          earlyGraceMin: Number(document.getElementById("sEarlyGrace").value||0),
          earlyMultiplier: Number(document.getElementById("sEarlyMult").value||1.0),
          overtimeStartAfterMin: Number(document.getElementById("sOtAfter").value||0),
          overtimeMultiplier: Number(document.getElementById("sOtMult").value||1.5),
          rounding: document.getElementById("sRound").value
        };
        addAudit(st2,"settings_save",{key});
        saveState(st2);
        toast("تم حفظ الإعدادات");
        render();
      };
      return;
    }

    if(currentTab==="payroll"){
      const d=new Date();
      const ym = ymKey(d.getFullYear(), d.getMonth()+1);
      const cfg = getCfg(ym);
      const deptMap = Object.fromEntries(st.departments.map(d=>[d.id,d.name]));
      const emps = st.employees.filter(e=>e.active!==false);

      const adv = st.advancesByMonth[ym] || {};
      const att = st.attendanceByMonth[ym] || {};

      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="text-lg font-bold">الرواتب — ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})</div>
            <div class="text-sm text-slate-500 mt-1">خصم التأخير: ${cfg.lateMultiplier} — الإضافي: ${cfg.overtimeMultiplier}</div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button id="exportPayrollExcel" class="px-4 py-3 rounded-2xl bg-slate-900 text-white font-semibold">تصدير الرواتب Excel</button>
          </div>
        </div>

        <div class="mt-4 grid gap-2">
          ${emps.map(e=>{
            const p = computePayroll({ employee:e, cfg, monthAttendance: att[e.id]||{}, advancesAmount: adv[e.id]||0 });
            return `
            <div class="p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div class="font-extrabold text-slate-900">${e.name}</div>
                  <div class="text-xs text-slate-500 mt-1">القسم: ${deptMap[e.departmentId]||"-"} — الراتب: ${e.monthlySalary}</div>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <button class="btnVoucher px-3 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-semibold" data-id="${e.id}">صك قبض PDF</button>
                  <button class="btnEmpView px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm font-semibold" data-id="${e.id}">عرض كموظف</button>
                </div>
              </div>

              <div class="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200">
                  <div class="text-slate-500 text-xs">قيمة الساعة</div>
                  <div class="font-bold mt-1">${p.hourlyRate.toFixed(2)}</div>
                </div>
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200">
                  <div class="text-slate-500 text-xs">الإضافي</div>
                  <div class="font-bold mt-1">${(p.totals.overtimeMin/60).toFixed(2)} ساعة — ${p.amounts.overtimePay.toFixed(2)}</div>
                </div>
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200">
                  <div class="text-slate-500 text-xs">التأخير</div>
                  <div class="font-bold mt-1">${(p.totals.lateMin/60).toFixed(2)} ساعة — ${p.amounts.lateDeduction.toFixed(2)}</div>
                </div>
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200">
                  <div class="text-slate-500 text-xs">انصراف مبكر</div>
                  <div class="font-bold mt-1">${(p.totals.earlyMin/60).toFixed(2)} ساعة — ${p.amounts.earlyDeduction.toFixed(2)}</div>
                </div>
              </div>

              <div class="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200">
                  <div class="text-slate-500 text-xs">السلف</div>
                  <div class="font-bold mt-1">${(p.amounts.advances).toFixed(2)}</div>
                </div>
                <div class="p-3 rounded-2xl bg-white ring-1 ring-slate-200 sm:col-span-2">
                  <div class="text-slate-500 text-xs">المستحق (الصافي)</div>
                  <div class="text-xl font-extrabold mt-1">${p.amounts.net.toFixed(2)}</div>
                </div>
              </div>

              <div class="mt-3">
                <label class="text-xs text-slate-500">السلف لهذا الشهر (اختياري)</label>
                <div class="flex gap-2 mt-1">
                  <input class="advInput flex-1 border border-slate-200 rounded-2xl px-3 py-2" type="number" value="${adv[e.id]||0}" data-id="${e.id}"/>
                  <button class="saveAdv px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm" data-id="${e.id}">حفظ</button>
                </div>
              </div>
            </div>
            `;
          }).join("")}
        </div>
      </div>`;

      [...document.querySelectorAll(".saveAdv")].forEach(b=>b.onclick=()=>{
        const id=b.getAttribute("data-id");
        const inp = document.querySelector(`.advInput[data-id="${id}"]`);
        const val = Number(inp.value||0);
        const st2=loadState();
        st2.advancesByMonth[ym] = st2.advancesByMonth[ym] || {};
        st2.advancesByMonth[ym][id]=val;
        addAudit(st2,"advance_set",{ym, id, val});
        saveState(st2);
        toast("تم حفظ السلفة");
        render();
      });

      [...document.querySelectorAll(".btnEmpView")].forEach(b=>b.onclick=()=>{
        const id=b.getAttribute("data-id");
        // open employee view in new tab by setting session temp
        const st2=loadState();
        const emp=st2.employees.find(x=>x.id===id);
        if(!emp) return;
        setSession({ role:"EMPLOYEE", employeeId: emp.id, employeeName: emp.name });
        window.open("./employee.html","_blank");
        // restore admin session
        setSession(sess);
      });

      [...document.querySelectorAll(".btnVoucher")].forEach(b=>b.onclick=()=>{
        const id=b.getAttribute("data-id");
        const st2=loadState();
        const emp=st2.employees.find(x=>x.id===id);
        if(!emp) return;
        generateVoucherPDF({employeeId:id, ym});
      });

      document.getElementById("exportPayrollExcel").onclick = ()=>{
        exportPayrollExcel({ ym });
      };

      return;
    }

    if(currentTab==="sync"){
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">مزامنة / Excel</div>
        <div class="text-sm text-slate-500 mt-1">
          لأن النظام يعمل بدون سيرفر، كل جهاز يحتفظ ببياناته. لتحديث أجهزة الموظفين:
          <b>صدّر ملف المزامنة</b> من هنا، ثم الموظف يستورده في بوابته.
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="font-bold">ملف مزامنة الموظفين (عرض فقط)</div>
            <div class="text-sm text-slate-600 mt-1">يتضمن الشركة + الموظفين + الدوام للشهر الحالي والسابق + إعدادات الشهرين.</div>
            <div class="mt-3 flex gap-2 flex-wrap">
              <button class="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold" id="exportSync">تصدير ملف مزامنة</button>
              <input id="importSync" type="file" accept=".json" class="border border-slate-200 rounded-2xl px-3 py-2 bg-white"/>
              <button class="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-semibold" id="doImportSync">استيراد مزامنة</button>
            </div>
          </div>

          <div class="p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="font-bold">قوالب Excel</div>
            <div class="text-sm text-slate-600 mt-1">تصدير قوالب ثم تعبئتها واستيرادها.</div>
            <div class="mt-3 grid gap-2">
              <button class="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold" id="tplEmployees">تصدير قالب الموظفين</button>
              <button class="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold" id="tplAttendance">تصدير قالب الدوام (الشهر الحالي)</button>
              <div class="flex gap-2 flex-wrap">
                <input id="importExcel" type="file" accept=".xlsx,.xls" class="border border-slate-200 rounded-2xl px-3 py-2 bg-white"/>
                <button class="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-semibold" id="doImportExcel">استيراد Excel</button>
              </div>
              <div class="text-xs text-slate-500">يدعم استيراد: Employees أو Attendance حسب اسم الشيت داخل الملف.</div>
            </div>
          </div>
        </div>
      </div>`;

      document.getElementById("exportSync").onclick = ()=>{
        const st = loadState();
        const d=new Date();
        const ymNow = ymKey(d.getFullYear(), d.getMonth()+1);
        const prev = new Date(d.getFullYear(), d.getMonth()-1, 1);
        const ymPrev = ymKey(prev.getFullYear(), prev.getMonth()+1);

        const payload = {
          v: 1,
          exportedAt: new Date().toISOString(),
          company: st.company,
          employees: st.employees.filter(e=>e.active!==false).map(e=>({ id:e.id, name:e.name, code:e.code, departmentId:e.departmentId, monthlySalary:e.monthlySalary })),
          departments: st.departments,
          settingsByMonth: {
            [ymNow]: st.settingsByMonth[ymNow] || null,
            [ymPrev]: st.settingsByMonth[ymPrev] || null
          },
          attendanceByMonth: {
            [ymNow]: st.attendanceByMonth[ymNow] || {},
            [ymPrev]: st.attendanceByMonth[ymPrev] || {}
          },
          advancesByMonth: {
            [ymNow]: st.advancesByMonth[ymNow] || {},
            [ymPrev]: st.advancesByMonth[ymPrev] || {}
          }
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
        downloadFile(`sync-${ymNow}.json`, blob);
        toast("تم تصدير ملف المزامنة");
      };

      document.getElementById("doImportSync").onclick = async ()=>{
        const f = document.getElementById("importSync").files[0];
        if(!f) return toast("اختر ملف مزامنة JSON", false);
        const txt = await f.text();
        const payload = safeJSONParse(txt, null);
        if(!payload || payload.v!==1) return toast("ملف مزامنة غير صالح", false);

        const st2 = loadState();
        // merge company
        st2.company = payload.company || st2.company;
        // merge departments/employees/settings/attendance for given months (safe replace)
        st2.departments = payload.departments || st2.departments;
        // preserve existing IDs; replace employees list (active)
        st2.employees = (payload.employees||[]).map(e=>({ ...e, active:true }));
        st2.settingsByMonth = { ...st2.settingsByMonth, ...(payload.settingsByMonth||{}) };
        st2.attendanceByMonth = { ...st2.attendanceByMonth, ...(payload.attendanceByMonth||{}) };
        st2.advancesByMonth = { ...st2.advancesByMonth, ...(payload.advancesByMonth||{}) };

        addAudit(st2,"sync_import",{at: payload.exportedAt});
        saveState(st2);
        toast("تم استيراد المزامنة");
        render();
      };

      document.getElementById("tplEmployees").onclick = ()=>{
        const st = loadState();
        const ws = XLSX.utils.aoa_to_sheet([
          ["Employees"],
          ["name","code","department","monthlySalary","active"],
          ...st.employees.map(e=>[
            e.name,
            e.code||"",
            (st.departments.find(d=>d.id===e.departmentId)?.name)||"",
            e.monthlySalary,
            e.active!==false ? 1 : 0
          ])
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
        downloadFile("employees_template.xlsx", new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        toast("تم تصدير قالب الموظفين");
      };

      document.getElementById("tplAttendance").onclick = ()=>{
        const st = loadState();
        const d=new Date();
        const ym = ymKey(d.getFullYear(), d.getMonth()+1);
        const cfg = getCfg(ym);
        const rows = [["Attendance"], ["ym","employeeName","date","in","out","excuseAbsence","excuseLate","excuseEarly","extraOvertimeMin","note"]];
        const att = st.attendanceByMonth[ym] || {};
        for(const emp of st.employees.filter(e=>e.active!==false)){
          const m = att[emp.id] || {};
          for(let day=1; day<=cfg.daysInMonth; day++){
            const dateISO = `${cfg.year}-${pad2(cfg.month)}-${pad2(day)}`;
            const rec = m[dateISO] || {};
            rows.push([ym, emp.name, dateISO, rec.in||"", rec.out||"", rec.excuseAbsence?1:0, rec.excuseLate?1:0, rec.excuseEarly?1:0, rec.extraOvertimeMin??"", rec.note||""]);
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");
        const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
        downloadFile(`attendance_${ym}.xlsx`, new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        toast("تم تصدير قالب الدوام");
      };

      document.getElementById("doImportExcel").onclick = async ()=>{
        const f = document.getElementById("importExcel").files[0];
        if(!f) return toast("اختر ملف Excel", false);
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type:"array" });
        const st2 = loadState();

        if(wb.Sheets["Employees"]){
          const ws = wb.Sheets["Employees"];
          const data = XLSX.utils.sheet_to_json(ws, { header:1 });
          // find header row
          let headerRowIndex = data.findIndex(r => r && r[0]==="name");
          if(headerRowIndex<0) headerRowIndex = 1;
          const rows = data.slice(headerRowIndex+1).filter(r=>r && r[0]);
          // map departments by name
          const deptByName = Object.fromEntries(st2.departments.map(d=>[d.name,d.id]));
          const newEmps = rows.map(r=>{
            const name = String(r[0]).trim();
            const code = String(r[1]||"").trim();
            const deptName = String(r[2]||"").trim();
            const salary = Number(r[3]||0);
            const active = Number(r[4]??1)!==0;
            const deptId = deptByName[deptName] || null;
            return { id: uuid(), name, code, departmentId: deptId, monthlySalary: salary, active };
          });
          st2.employees = newEmps;
          addAudit(st2,"excel_import_employees",{count:newEmps.length});
          saveState(st2);
          toast("تم استيراد الموظفين من Excel");
        }

        if(wb.Sheets["Attendance"]){
          const ws = wb.Sheets["Attendance"];
          const rows = XLSX.utils.sheet_to_json(ws, { header:1 }).slice(1); // skip title
          // header at next line
          const header = rows[0];
          const idx = (name)=>header.indexOf(name);
          const ymIdx = idx("ym");
          const nameIdx = idx("employeeName");
          const dateIdx = idx("date");
          const inIdx = idx("in");
          const outIdx = idx("out");
          const exAIdx = idx("excuseAbsence");
          const exLIdx = idx("excuseLate");
          const exEIdx = idx("excuseEarly");
          const otIdx = idx("extraOvertimeMin");
          const noteIdx = idx("note");

          const empByName = Object.fromEntries(st2.employees.map(e=>[e.name,e]));
          for(const r of rows.slice(1)){
            if(!r || !r[dateIdx]) continue;
            const ym = String(r[ymIdx]||"").trim();
            const empName = String(r[nameIdx]||"").trim();
            const dateISO = String(r[dateIdx]||"").trim();
            if(!ym || !empName || !dateISO) continue;
            const emp = empByName[empName];
            if(!emp) continue;

            st2.attendanceByMonth[ym] = st2.attendanceByMonth[ym] || {};
            st2.attendanceByMonth[ym][emp.id] = st2.attendanceByMonth[ym][emp.id] || {};
            st2.attendanceByMonth[ym][emp.id][dateISO] = {
              in: String(r[inIdx]||"").trim(),
              out: String(r[outIdx]||"").trim(),
              excuseAbsence: Number(r[exAIdx]||0)!==0,
              excuseLate: Number(r[exLIdx]||0)!==0,
              excuseEarly: Number(r[exEIdx]||0)!==0,
              extraOvertimeMin: (r[otIdx]===""||r[otIdx]==null) ? null : Number(r[otIdx]),
              note: String(r[noteIdx]||"").trim()
            };
          }
          addAudit(st2,"excel_import_attendance",{});
          saveState(st2);
          toast("تم استيراد الدوام من Excel");
        }

        render();
      };

      return;
    }

    if(currentTab==="managers"){
      if(!isAdmin){
        view.innerHTML = `<div class="bg-white card p-5"><div class="font-bold">غير مسموح</div></div>`;
        return;
      }
      const mgrs = st.auth.managers||[];
      view.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">المدراء</div>
        <div class="text-sm text-slate-500 mt-1">يمكنهم تسجيل الدوام وعرض التقارير. (لا يغيرون بيانات الشركة أو الموظفين)</div>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <input id="mName" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="اسم المدير"/>
          <input id="mUser" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="اسم المستخدم"/>
          <input id="mPass" type="password" class="border border-slate-200 rounded-2xl px-3 py-3" placeholder="كلمة السر"/>
        </div>
        <div class="mt-3">
          <button id="addMgr" class="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">إضافة مدير</button>
        </div>

        <div class="mt-5 grid gap-2">
          ${mgrs.map(m=>`
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-between">
              <div>
                <div class="font-bold">${m.name||"مدير"}</div>
                <div class="text-xs text-slate-500 mt-1">User: ${m.username}</div>
              </div>
              <button class="delMgr px-3 py-2 rounded-2xl bg-rose-600 text-white text-sm" data-u="${m.username}">حذف</button>
            </div>
          `).join("") || `<div class="text-sm text-slate-500">لا يوجد مدراء</div>`}
        </div>
      </div>`;
      document.getElementById("addMgr").onclick = ()=>{
        const name=document.getElementById("mName").value.trim();
        const username=document.getElementById("mUser").value.trim();
        const password=document.getElementById("mPass").value;
        if(!username || !password) return toast("اكتب اسم مستخدم وكلمة سر", false);
        const st2=loadState();
        st2.auth.managers = st2.auth.managers || [];
        if(st2.auth.managers.some(x=>x.username===username)) return toast("اسم المستخدم مستخدم", false);
        st2.auth.managers.push({ name, username, password });
        addAudit(st2,"manager_add",{username});
        saveState(st2);
        toast("تمت إضافة مدير");
        render();
      };
      [...document.querySelectorAll(".delMgr")].forEach(b=>b.onclick=()=>{
        const u=b.getAttribute("data-u");
        const st2=loadState();
        st2.auth.managers = (st2.auth.managers||[]).filter(x=>x.username!==u);
        addAudit(st2,"manager_delete",{u});
        saveState(st2);
        toast("تم حذف المدير");
        render();
      });
      return;
    }

    view.innerHTML = `<div class="bg-white card p-5"><div class="font-bold">قيد التطوير</div></div>`;
  }

  // Excel payroll export and PDF voucher generator
  window.exportPayrollExcel = ({ym})=>{
    const st = loadState();
    const cfg = st.settingsByMonth[ym];
    if(!cfg) return toast("إعدادات الشهر غير موجودة", false);
    const deptMap = Object.fromEntries(st.departments.map(d=>[d.id,d.name]));
    const att = st.attendanceByMonth[ym] || {};
    const adv = st.advancesByMonth[ym] || {};
    const rows = [
      ["Payroll"],
      ["ym","employeeName","department","monthlySalary","hourlyRate","overtimeHours","overtimePay","lateHours","lateDeduction","earlyHours","earlyDeduction","advances","net"]
    ];
    for(const e of st.employees.filter(e=>e.active!==false)){
      const p = computePayroll({ employee:e, cfg, monthAttendance: att[e.id]||{}, advancesAmount: adv[e.id]||0 });
      rows.push([
        ym,
        e.name,
        deptMap[e.departmentId]||"",
        e.monthlySalary,
        p.hourlyRate,
        (p.totals.overtimeMin/60),
        p.amounts.overtimePay,
        (p.totals.lateMin/60),
        p.amounts.lateDeduction,
        (p.totals.earlyMin/60),
        p.amounts.earlyDeduction,
        p.amounts.advances,
        p.amounts.net
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
    downloadFile(`payroll_${ym}.xlsx`, new Blob([out], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    toast("تم تصدير الرواتب Excel");
  };

  window.generateVoucherPDF = ({employeeId, ym})=>{
    const st = loadState();
    const cfg = st.settingsByMonth[ym];
    const emp = st.employees.find(e=>e.id===employeeId);
    if(!cfg || !emp) return toast("بيانات غير كاملة", false);

    const deptName = st.departments.find(d=>d.id===emp.departmentId)?.name || "-";
    const monthAttendance = (st.attendanceByMonth[ym]||{})[emp.id] || {};
    const adv = (st.advancesByMonth[ym]||{})[emp.id] || 0;
    const pay = computePayroll({ employee: emp, cfg, monthAttendance, advancesAmount: adv });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"p", unit:"pt", format:"a4" });

    const company = st.company||{name:"اسم الشركة", logoDataUrl:""};
    const margin = 40;
    let y = 48;

    // Header
    doc.setFont("helvetica","bold");
    doc.setFontSize(16);
    doc.text("صك قبض شهري + كشف حضور", 297, y, { align:"center" });
    y += 18;

    doc.setFont("helvetica","normal");
    doc.setFontSize(11);
    doc.text(`${company.name || "اسم الشركة"}`, 297, y, { align:"center" });
    y += 22;

    // Logo (optional)
    if(company.logoDataUrl){
      try{
        doc.addImage(company.logoDataUrl, "PNG", margin, 30, 48, 48);
      }catch(e){}
    }

    doc.setFontSize(10);
    doc.text(`اسم الموظف: ${emp.name}`, 555, 90, { align:"right" });
    doc.text(`القسم: ${deptName}`, 555, 106, { align:"right" });
    doc.text(`الشهر: ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})`, 555, 122, { align:"right" });

    // Build daily table for cfg.daysInMonth
    const body = [];
    for(let day=1; day<=cfg.daysInMonth; day++){
      const dateISO = `${cfg.year}-${pad2(cfg.month)}-${pad2(day)}`;
      const rec = monthAttendance[dateISO] || {};
      const s = computeDaySummary({ dateISO, rec, cfg });

      body.push([
        dateISO,
        dayNameAr(dateISO),
        rec.in || "-",
        rec.out || "-",
        (s.overtimeMin/60).toFixed(2),
        (s.lateMin/60).toFixed(2),
        (s.earlyMin/60).toFixed(2)
      ]);
    }

    doc.autoTable({
      head: [[ "التاريخ","اليوم","الدخول","الخروج","الإضافي (س)","التأخير (س)","الانصراف المبكر (س)" ]],
      body,
      startY: 150,
      styles: { font:"helvetica", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] }, // slate-900
      didDrawPage: () => {}
    });

    y = doc.lastAutoTable.finalY + 14;
    doc.setFont("helvetica","bold");
    doc.setFontSize(11);
    doc.text("المجاميع", 555, y, { align:"right" });
    y += 14;

    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.text(`مجموع الإضافي: ${(pay.totals.overtimeMin/60).toFixed(2)} ساعة — قيمة الإضافي: ${pay.amounts.overtimePay.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`مجموع التأخير: ${(pay.totals.lateMin/60).toFixed(2)} ساعة — قيمة خصم التأخير: ${pay.amounts.lateDeduction.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`مجموع الانصراف المبكر: ${(pay.totals.earlyMin/60).toFixed(2)} ساعة — قيمة خصم الانصراف المبكر: ${pay.amounts.earlyDeduction.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`السلف: ${pay.amounts.advances.toFixed(2)}`, 555, y, { align:"right" }); y+=18;

    doc.setFont("helvetica","bold");
    doc.setFontSize(13);
    doc.text(`المستحق (الصافي): ${pay.amounts.net.toFixed(2)}`, 555, y, { align:"right" }); y+=26;

    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.text("توقيع الموظف: ____________________", 555, y, { align:"right" }); y+=16;
    doc.text("توقيع الإدارة: ____________________", 555, y, { align:"right" }); y+=16;

    doc.save(`voucher_${emp.name}_${ym}.pdf`);
  };

  setTab("dashboard");
})();
