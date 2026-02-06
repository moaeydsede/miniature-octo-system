\
function renderTopbar({title, subtitle, role}){
  const company = loadState().company;
  const logo = company.logoDataUrl ? `<img src="${company.logoDataUrl}" class="h-9 w-9 rounded-2xl object-cover ring-1 ring-slate-200" />` :
    `<div class="h-9 w-9 rounded-2xl bg-slate-100 ring-1 ring-slate-200 grid place-items-center text-slate-500 text-xs">LOGO</div>`;
  return `
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      ${logo}
      <div>
        <div class="text-sm text-slate-500">${company.name || "اسم الشركة"}</div>
        <div class="text-xl font-bold text-slate-900">${title}</div>
        ${subtitle ? `<div class="text-sm text-slate-500 mt-1">${subtitle}</div>` : ``}
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="px-3 py-1.5 rounded-2xl bg-slate-100 text-slate-700 text-sm">${role}</span>
      <button onclick="logout()" class="px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm">خروج</button>
    </div>
  </div>
  `;
}

function logout(){
  clearSession();
  location.href = "./index.html";
}
