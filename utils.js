\
const LS_KEY = "HR_SYS_V1";

// ===== Storage Safe Wrapper (لمنع توقف النظام إذا كان التخزين محجوبًا) =====
const __memStore = { local: {}, session: {} };

function _safeGet(storage, key){
  try { return storage.getItem(key); } catch(e){ return __memStore[storage===localStorage?"local":"session"][key] ?? null; }
}
function _safeSet(storage, key, val){
  try { storage.setItem(key, val); } catch(e){ __memStore[storage===localStorage?"local":"session"][key] = val; }
}
function _safeRemove(storage, key){
  try { storage.removeItem(key); } catch(e){ delete __memStore[storage===localStorage?"local":"session"][key]; }
}

// Error overlay للموبايل
function showFatalError(msg){
  try{
    let box = document.getElementById("fatalError");
    if(!box){
      box = document.createElement("div");
      box.id="fatalError";
      box.style.position="fixed";
      box.style.left="12px";
      box.style.right="12px";
      box.style.bottom="12px";
      box.style.zIndex="99999";
      box.style.background="#b91c1c";
      box.style.color="#fff";
      box.style.padding="14px 14px";
      box.style.borderRadius="16px";
      box.style.boxShadow="0 12px 30px rgba(0,0,0,.18)";
      box.style.fontSize="13px";
      box.style.lineHeight="1.6";
      document.body.appendChild(box);
    }
    box.textContent = msg;
  }catch(e){}
}

window.addEventListener("error", (ev)=>{
  try{ console.error(ev.error || ev.message); }catch(e){}
  showFatalError("حدث خطأ منع تشغيل الصفحة. جرّب تحديث الصفحة. إن استمر، افتح من Chrome. ");
});
window.addEventListener("unhandledrejection", (ev)=>{
  try{ console.error(ev.reason); }catch(e){}
  showFatalError("حدث خطأ داخلي. جرّب تحديث الصفحة. ");
});

function uuid(){
  // دعم للمتصفحات التي لا تدعم uuid()
  try{
    if (crypto && typeof crypto.randomUUID === "function") return uuid();
    if (crypto && crypto.getRandomValues){
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      // RFC4122 v4
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
  }catch(e){}
  // fallback ضعيف لكن يعمل
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

window.addEventListener("error", (ev)=>{
  try{ console.error(ev.error || ev.message); }catch(e){}
});

function nowDateISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function pad2(n){ return String(n).padStart(2,"0"); }
function ymKey(year, month){ return `${year}-${pad2(month)}`; }
function parseTimeToMinutes(hhmm){
  if(!hhmm) return null;
  const [h,m]=hhmm.split(":").map(Number);
  if(Number.isNaN(h)||Number.isNaN(m)) return null;
  return h*60+m;
}
function minutesToTime(min){
  if(min==null) return "-";
  const h=Math.floor(min/60), m=Math.abs(min%60);
  return `${pad2(h)}:${pad2(m)}`;
}
function dayNameAr(dateISO){
  const d=new Date(dateISO+"T00:00:00");
  const names=["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  return names[d.getDay()];
}
function monthNameAr(m){
  const names=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return names[m-1]||"";
}
function safeJSONParse(s, fallback){
  try{ return JSON.parse(s); }catch(e){ return fallback; }
}

function defaultState(){
  const d=new Date();
  const y=d.getFullYear(), m=d.getMonth()+1;
  return {
    company: { name: "اسم الشركة", logoDataUrl: "" },
    auth: {
      admin: { username: "admin", password: "admin123" },
      managers: [] // {username,password,name}
    },
    departments: [
      { id: uuid(), name: "إدارة" },
      { id: uuid(), name: "مبيعات" },
      { id: uuid(), name: "مخزن" },
      { id: uuid(), name: "إنتاج" }
    ],
    employees: [
      { id: uuid(), name: "محمد", code: "E001", departmentId: null, monthlySalary: 6000, active: true },
      { id: uuid(), name: "أحمد", code: "E002", departmentId: null, monthlySalary: 5500, active: true }
    ],
    settingsByMonth: {
      [ymKey(y,m)]: {
        year:y, month:m,
        daysInMonth: new Date(y,m,0).getDate(),
        hoursInMonth: 208,
        shiftStart: "10:00",
        shiftEnd: "17:00",
        lateGraceMin: 0,
        lateMultiplier: 1.5,
        earlyGraceMin: 0,
        earlyMultiplier: 1.0,
        overtimeStartAfterMin: 0,
        overtimeMultiplier: 1.5,
        rounding: "MINUTE" // MINUTE|5|15
      }
    },
    advancesByMonth: {
      // ym: { employeeId: amount }
    },
    attendanceByMonth: {
      // ym: { employeeId: { dateISO: {in:"HH:mm", out:"HH:mm", excuseAbsence:false, excuseLate:false, excuseEarly:false, note:"", extraOvertimeMin:null} } }
    },
    audit: []
  };
}

function loadState(){
  const s = _safeGet(localStorage, LS_KEY);
  if(!s){
    const st = defaultState();
    saveState(st);
    return st;
  }
  const st = safeJSONParse(s, defaultState());
  // ensure minimal fields
  if(!st.company) st.company = { name:"اسم الشركة", logoDataUrl:"" };
  if(!st.auth?.admin) st.auth = { admin:{username:"admin",password:"admin123"}, managers:[] };
  if(!st.departments) st.departments = [];
  if(!st.employees) st.employees = [];
  if(!st.settingsByMonth) st.settingsByMonth = {};
  if(!st.attendanceByMonth) st.attendanceByMonth = {};
  if(!st.advancesByMonth) st.advancesByMonth = {};
  if(!st.audit) st.audit = [];
  return st;
}

function saveState(st){
  _safeSet(localStorage, LS_KEY, JSON.stringify(st));
}

function addAudit(st, action, payload){
  st.audit.unshift({ id: uuid(), at: new Date().toISOString(), action, payload });
  st.audit = st.audit.slice(0, 500);
}

function requireRole(role){
  const s = _safeGet(sessionStorage, "HR_SESSION");
  if(!s) location.href = "./index.html";
  const sess = safeJSONParse(s, null);
  if(!sess || sess.role !== role) location.href = "./index.html";
  return sess;
}

function setSession(sess){
  _safeSet(sessionStorage, "HR_SESSION", JSON.stringify(sess));
}

function clearSession(){
  _safeRemove(sessionStorage, "HR_SESSION");
}

function toast(msg, ok=true){
  const el = document.getElementById("toast");
  if(!el) { alert(msg); return; }
  el.textContent = msg;
  el.className = `fixed top-4 right-4 z-50 px-4 py-3 text-sm rounded-2xl shadow-lg ${ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`;
  el.style.display = "block";
  setTimeout(()=>{ el.style.display="none"; }, 2200);
}

function downloadFile(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function roundMinutes(min, rule){
  if(min==null) return 0;
  if(!rule || rule==="MINUTE") return min;
  const step = Number(rule);
  if(!step || step<=1) return min;
  return Math.round(min/step)*step;
}

function computeDaySummary({dateISO, rec, cfg}){
  // rec: {in,out,excuseAbsence,excuseLate,excuseEarly,extraOvertimeMin}
  const startMin = parseTimeToMinutes(cfg.shiftStart);
  const endMin = parseTimeToMinutes(cfg.shiftEnd);

  const inMin = parseTimeToMinutes(rec?.in);
  const outMin = parseTimeToMinutes(rec?.out);

  let status = "PRESENT";
  if(!inMin && !outMin) status = "ABSENT";

  if(rec?.excuseAbsence) status = "EXCUSED_ABSENT";

  let late=0, early=0, overtime=0;

  if(status==="PRESENT" && inMin!=null){
    late = Math.max(0, inMin - (startMin + (cfg.lateGraceMin||0)));
  }
  if(status==="PRESENT" && outMin!=null){
    early = Math.max(0, (endMin - (cfg.earlyGraceMin||0)) - outMin);
    const otStart = endMin + (cfg.overtimeStartAfterMin||0);
    overtime = Math.max(0, outMin - otStart);
  }

  if(rec?.excuseLate) late = 0;
  if(rec?.excuseEarly) early = 0;
  if(rec?.extraOvertimeMin!=null && rec.extraOvertimeMin!=="" && !Number.isNaN(Number(rec.extraOvertimeMin))){
    overtime = Number(rec.extraOvertimeMin);
  }

  late = roundMinutes(late, cfg.rounding);
  early = roundMinutes(early, cfg.rounding);
  overtime = roundMinutes(overtime, cfg.rounding);

  return { status, inMin, outMin, lateMin:late, earlyMin:early, overtimeMin:overtime };
}

function computePayroll({employee, cfg, monthAttendance, advancesAmount}){
  const hourly = employee.monthlySalary / cfg.hoursInMonth;
  let late=0, early=0, ot=0;
  for(const dateISO of Object.keys(monthAttendance||{})){
    const rec = monthAttendance[dateISO];
    const s = computeDaySummary({dateISO, rec, cfg});
    late += s.lateMin||0;
    early += s.earlyMin||0;
    ot += s.overtimeMin||0;
  }
  const lateDed = (late/60) * hourly * (cfg.lateMultiplier||1.5);
  const earlyDed = (early/60) * hourly * (cfg.earlyMultiplier||1.0);
  const otPay = (ot/60) * hourly * (cfg.overtimeMultiplier||1.5);
  const net = employee.monthlySalary + otPay - lateDed - earlyDed - (advancesAmount||0);

  return {
    hourlyRate: hourly,
    totals: { lateMin: late, earlyMin: early, overtimeMin: ot },
    amounts: { lateDeduction: lateDed, earlyDeduction: earlyDed, overtimePay: otPay, advances: advancesAmount||0, net }
  };
}
