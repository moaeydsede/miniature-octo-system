\
(function(){
  const sess = requireRole("EMPLOYEE");
  const st = loadState();
  const emp = st.employees.find(e=>e.id===sess.employeeId);
  if(!emp){
    toast("تم حذف الموظف من النظام", false);
    logout();
    return;
  }

  document.getElementById("topbar").innerHTML = renderTopbar({
    title: "بوابة الموظف",
    subtitle: `مرحبًا ${emp.name} — عرض فقط`,
    role: "Employee"
  });

  const monthSel = document.getElementById("monthSel");
  const empView = document.getElementById("empView");

  function allowedMonths(){
    const d = new Date();
    const now = ymKey(d.getFullYear(), d.getMonth()+1);
    const prevD = new Date(d.getFullYear(), d.getMonth()-1, 1);
    const prev = ymKey(prevD.getFullYear(), prevD.getMonth()+1);
    return [now, prev];
  }

  function render(){
    const st2 = loadState(); // auto refresh from storage (same device)
    const allowed = allowedMonths();
    monthSel.innerHTML = allowed.map(ym=>{
      const [y,m] = ym.split("-").map(Number);
      return `<option value="${ym}">${y}-${pad2(m)} (${monthNameAr(m)})</option>`;
    }).join("");

    const selected = sessionStorage.getItem("EMP_MONTH") || allowed[0];
    monthSel.value = allowed.includes(selected) ? selected : allowed[0];

    const ym = monthSel.value;
    const cfg = st2.settingsByMonth[ym];
    const att = (st2.attendanceByMonth[ym]||{})[emp.id] || {};
    const adv = (st2.advancesByMonth[ym]||{})[emp.id] || 0;

    if(!cfg){
      empView.innerHTML = `
      <div class="bg-white card p-5">
        <div class="text-lg font-bold">لا توجد بيانات لهذا الشهر</div>
        <div class="text-sm text-slate-500 mt-2">اطلب من الإدارة عمل (مزامنة) لهذا الشهر.</div>
        <div class="mt-4 p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
          <div class="font-bold">استيراد ملف مزامنة</div>
          <input id="syncFile" type="file" accept=".json" class="mt-2 w-full border border-slate-200 rounded-2xl px-3 py-3 bg-white"/>
          <button id="importSync" class="mt-2 w-full px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">استيراد</button>
        </div>
      </div>`;
      document.getElementById("importSync").onclick = async ()=>{
        const f = document.getElementById("syncFile").files[0];
        if(!f) return toast("اختر ملف مزامنة", false);
        const payload = safeJSONParse(await f.text(), null);
        if(!payload || payload.v!==1) return toast("ملف غير صالح", false);
        const st3 = loadState();
        st3.company = payload.company || st3.company;
        st3.departments = payload.departments || st3.departments;
        st3.employees = (payload.employees||[]).map(e=>({ ...e, active:true }));
        st3.settingsByMonth = { ...st3.settingsByMonth, ...(payload.settingsByMonth||{}) };
        st3.attendanceByMonth = { ...st3.attendanceByMonth, ...(payload.attendanceByMonth||{}) };
        st3.advancesByMonth = { ...st3.advancesByMonth, ...(payload.advancesByMonth||{}) };
        saveState(st3);
        toast("تم استيراد المزامنة");
        location.reload();
      };
      return;
    }

    // compute
    const pay = computePayroll({ employee: emp, cfg, monthAttendance: att, advancesAmount: adv });

    // build cards per day
    const cards = [];
    for(let day=1; day<=cfg.daysInMonth; day++){
      const dateISO = `${cfg.year}-${pad2(cfg.month)}-${pad2(day)}`;
      const rec = att[dateISO] || {};
      const s = computeDaySummary({ dateISO, rec, cfg });
      cards.push(`
        <div class="p-4 rounded-2xl bg-white ring-1 ring-slate-200">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-bold">${dateISO}</div>
              <div class="text-xs text-slate-500 mt-1">${dayNameAr(dateISO)}</div>
            </div>
            <span class="px-3 py-1.5 rounded-2xl text-xs ${s.status==="EXCUSED_ABSENT"?"bg-amber-100 text-amber-700":(s.status==="ABSENT"?"bg-rose-100 text-rose-700":"bg-emerald-100 text-emerald-700")}">
              ${s.status==="EXCUSED_ABSENT"?"غياب بعذر":(s.status==="ABSENT"?"غياب":"حضور")}
            </span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="text-xs text-slate-500">الدخول</div>
              <div class="font-bold mt-1">${rec.in || "-"}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="text-xs text-slate-500">الخروج</div>
              <div class="font-bold mt-1">${rec.out || "-"}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="text-xs text-slate-500">الإضافي</div>
              <div class="font-bold mt-1">${(s.overtimeMin/60).toFixed(2)} س</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
              <div class="text-xs text-slate-500">التأخير</div>
              <div class="font-bold mt-1">${(s.lateMin/60).toFixed(2)} س</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 col-span-2">
              <div class="text-xs text-slate-500">الانصراف المبكر</div>
              <div class="font-bold mt-1">${(s.earlyMin/60).toFixed(2)} س</div>
            </div>
          </div>
          ${rec.note ? `<div class="mt-3 text-xs text-slate-500">ملاحظة: ${rec.note}</div>` : ``}
        </div>
      `);
    }

    empView.innerHTML = `
      <div class="bg-white card p-5">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="text-lg font-bold">الشهر: ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})</div>
            <div class="text-sm text-slate-500 mt-1">الدوام: ${cfg.shiftStart} → ${cfg.shiftEnd}</div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button id="btnPDF" class="px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold">تحميل صك قبض PDF</button>
            <button id="btnImportSync" class="px-4 py-3 rounded-2xl bg-slate-900 text-white font-semibold">تحديث من ملف مزامنة</button>
          </div>
        </div>

        <div class="mt-4 grid gap-2 sm:grid-cols-4 text-sm">
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="text-xs text-slate-500">قيمة الساعة</div>
            <div class="font-bold mt-1">${pay.hourlyRate.toFixed(2)}</div>
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="text-xs text-slate-500">الإضافي</div>
            <div class="font-bold mt-1">${(pay.totals.overtimeMin/60).toFixed(2)} س — ${pay.amounts.overtimePay.toFixed(2)}</div>
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="text-xs text-slate-500">التأخير</div>
            <div class="font-bold mt-1">${(pay.totals.lateMin/60).toFixed(2)} س — ${pay.amounts.lateDeduction.toFixed(2)}</div>
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="text-xs text-slate-500">الانصراف المبكر</div>
            <div class="font-bold mt-1">${(pay.totals.earlyMin/60).toFixed(2)} س — ${pay.amounts.earlyDeduction.toFixed(2)}</div>
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <div class="text-xs text-slate-500">السلف</div>
            <div class="font-bold mt-1">${pay.amounts.advances.toFixed(2)}</div>
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 sm:col-span-3">
            <div class="text-xs text-slate-500">المستحق (الصافي)</div>
            <div class="text-xl font-extrabold mt-1">${pay.amounts.net.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-3">
        ${cards.join("")}
      </div>

      <div class="mt-4 bg-white card p-5">
        <div class="font-bold">استيراد ملف مزامنة</div>
        <div class="text-sm text-slate-500 mt-1">لو الإدارة عدّلت الدوام، اطلب منها ملف مزامنة للشهر الحالي.</div>
        <div class="mt-3 flex gap-2 flex-wrap">
          <input id="syncFile2" type="file" accept=".json" class="border border-slate-200 rounded-2xl px-3 py-2 bg-white"/>
          <button id="importSync2" class="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-semibold">استيراد</button>
        </div>
      </div>
    `;

    document.getElementById("btnImportSync").onclick = ()=>document.getElementById("syncFile2").click();

    document.getElementById("importSync2").onclick = async ()=>{
      const f = document.getElementById("syncFile2").files[0];
      if(!f) return toast("اختر ملف مزامنة", false);
      const payload = safeJSONParse(await f.text(), null);
      if(!payload || payload.v!==1) return toast("ملف غير صالح", false);
      const st3 = loadState();
      st3.company = payload.company || st3.company;
      st3.departments = payload.departments || st3.departments;
      st3.employees = (payload.employees||[]).map(e=>({ ...e, active:true }));
      st3.settingsByMonth = { ...st3.settingsByMonth, ...(payload.settingsByMonth||{}) };
      st3.attendanceByMonth = { ...st3.attendanceByMonth, ...(payload.attendanceByMonth||{}) };
      st3.advancesByMonth = { ...st3.advancesByMonth, ...(payload.advancesByMonth||{}) };
      saveState(st3);
      toast("تم التحديث");
      location.reload();
    };

    document.getElementById("btnPDF").onclick = ()=>{
      generateVoucherPDFEmployee({ emp, ym });
    };
  }

  window.generateVoucherPDFEmployee = ({emp, ym})=>{
    const st = loadState();
    const cfg = st.settingsByMonth[ym];
    const monthAttendance = (st.attendanceByMonth[ym]||{})[emp.id] || {};
    const adv = (st.advancesByMonth[ym]||{})[emp.id] || 0;
    const pay = computePayroll({ employee: emp, cfg, monthAttendance, advancesAmount: adv });
    const deptName = st.departments.find(d=>d.id===emp.departmentId)?.name || "-";

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"p", unit:"pt", format:"a4" });
    const company = st.company||{name:"اسم الشركة", logoDataUrl:""};
    const margin = 40;
    let y = 48;

    doc.setFont("helvetica","bold");
    doc.setFontSize(16);
    doc.text("صك قبض شهري + كشف حضور", 297, y, { align:"center" });
    y += 18;
    doc.setFont("helvetica","normal");
    doc.setFontSize(11);
    doc.text(`${company.name || "اسم الشركة"}`, 297, y, { align:"center" });
    y += 22;

    if(company.logoDataUrl){
      try{ doc.addImage(company.logoDataUrl, "PNG", margin, 30, 48, 48); }catch(e){}
    }

    doc.setFontSize(10);
    doc.text(`اسم الموظف: ${emp.name}`, 555, 90, { align:"right" });
    doc.text(`القسم: ${deptName}`, 555, 106, { align:"right" });
    doc.text(`الشهر: ${cfg.year}-${pad2(cfg.month)} (${monthNameAr(cfg.month)})`, 555, 122, { align:"right" });

    const body = [];
    for(let day=1; day<=cfg.daysInMonth; day++){
      const dateISO = `${cfg.year}-${pad2(cfg.month)}-${pad2(day)}`;
      const rec = monthAttendance[dateISO] || {};
      const s = computeDaySummary({ dateISO, rec, cfg });
      body.push([dateISO, dayNameAr(dateISO), rec.in||"-", rec.out||"-", (s.overtimeMin/60).toFixed(2), (s.lateMin/60).toFixed(2), (s.earlyMin/60).toFixed(2)]);
    }

    doc.autoTable({
      head: [[ "التاريخ","اليوم","الدخول","الخروج","الإضافي (س)","التأخير (س)","الانصراف المبكر (س)" ]],
      body,
      startY: 150,
      styles: { font:"helvetica", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] }
    });

    y = doc.lastAutoTable.finalY + 14;
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text("المجاميع", 555, y, { align:"right" }); y+=14;
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    doc.text(`مجموع الإضافي: ${(pay.totals.overtimeMin/60).toFixed(2)} ساعة — قيمة الإضافي: ${pay.amounts.overtimePay.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`مجموع التأخير: ${(pay.totals.lateMin/60).toFixed(2)} ساعة — قيمة خصم التأخير: ${pay.amounts.lateDeduction.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`مجموع الانصراف المبكر: ${(pay.totals.earlyMin/60).toFixed(2)} ساعة — قيمة خصم الانصراف المبكر: ${pay.amounts.earlyDeduction.toFixed(2)}`, 555, y, { align:"right" }); y+=14;
    doc.text(`السلف: ${pay.amounts.advances.toFixed(2)}`, 555, y, { align:"right" }); y+=18;
    doc.setFont("helvetica","bold"); doc.setFontSize(13);
    doc.text(`المستحق (الصافي): ${pay.amounts.net.toFixed(2)}`, 555, y, { align:"right" });

    doc.save(`صك_قبض_${emp.name}_${ym}.pdf`);
  };

  // live update within same device
  monthSel.onchange = ()=>{
    sessionStorage.setItem("EMP_MONTH", monthSel.value);
    render();
  };

  render();
  // auto refresh every 10s (if same device updated)
  setInterval(()=>{ render(); }, 10000);
})();
