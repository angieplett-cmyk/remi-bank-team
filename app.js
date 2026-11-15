"use strict";
/* REMI Bank · Team Edition — shared, live classroom bank (teachers + student bankers). */
const SB_URL="https://c--d68f7d14-42d1-4c96-a074-eb7115d9110d-prod.lovable.cloud";
const SB_KEY="sb_publishable_FSjy6LiIxTJPDLDiyGLrXw_tSubY_OT";
const sb=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,storageKey:"remiTeam.auth"}});
const sbAnon=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,storageKey:"remiTeam.banker"}});
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>(n<0?"−":"")+"$"+Math.abs(Math.round(n||0)).toLocaleString("en-US");
const REMI=[{k:"R",name:"Responsible",c:"var(--R)"},{k:"E",name:"Empathy",c:"var(--E)"},{k:"M",name:"Mindfulness",c:"var(--M)"},{k:"I",name:"Integrity",c:"var(--I)"}];
const TAKE=["Fine","Withdrawal","Correction","Lost item","Late work"];
const TIERS=[["small","SMALL","Quick buys"],["medium","MEDIUM","Worth the wait"],["big","BIG","Save up! · Big rewards: once per quarter. Save smart, spend wisely!"],["top","TOP PRIZE","Special rewards"],["goal","CLASS GOALS","The whole class saves together!"]];
const fmtT=t=>new Date(t).toLocaleString("en-US",{timeZone:"America/Denver",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const reasonLabel=r=>{const x=REMI.find(z=>z.k===r);return x?x.name:(r||"")};
const errMsg=e=>String(e?.message||e||"Something went wrong").replace(/^BANKER_LOCKED:\s*/,"");

let toastTimer=null;
function toast(msg,undoFn){const t=$("#toast");t.innerHTML=`<span>${esc(msg)}</span>${undoFn?'<button id="tUndo">Undo</button>':""}`;t.classList.remove("hidden");
  clearTimeout(toastTimer);if(undoFn)$("#tUndo").onclick=async()=>{t.classList.add("hidden");await undoFn()};toastTimer=setTimeout(()=>t.classList.add("hidden"),undoFn?6000:3500)}
function modal(html,onMount){const bg=document.createElement("div");bg.className="modal-bg";bg.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(bg);
  bg.addEventListener("click",e=>{if(e.target===bg)bg.remove()});const close=()=>bg.remove();onMount&&onMount(bg,close);return close}

/* ================= STATE ================= */
const S={user:null,profile:null,isAdmin:false,homerooms:[],students:[],bal:{},items:[],tx:[],teachers:[],bankerStatus:{},view:"bank",hr:null,live:false,sel:null,showInactive:false,editStore:false,hist:{hr:"",who:"",banker:false,q:""}};
const stu=id=>S.students.find(s=>s.id===id);
const hrName=id=>(S.homerooms.find(h=>h.id===id)||{}).teacher_name||"—";
const hrColor=id=>(S.homerooms.find(h=>h.id===id)||{}).color||"#999";
const nm=s=>s?(s.last_initial==="?"?`${s.first_name} (?)`:`${s.first_name} ${s.last_initial}.`):"?";
const myHr=()=>S.homerooms.find(h=>h.owner_teacher_id===S.user?.id);
const SHARED_LABEL="Room D211 Friday Store";
const sharedHr=()=>S.homerooms.find(h=>h.is_shared_store);
const runsStore=h=>h&&(h.is_shared_store||h.store_mode==="own");
const storeHrOf=s=>{const h=S.homerooms.find(x=>x.id===s.homeroom_id);if(!h)return null;return runsStore(h)?h.id:(sharedHr()||{}).id};
const storeLabel=id=>{const h=S.homerooms.find(x=>x.id===id);if(!h)return "Store";return h.is_shared_store?SHARED_LABEL:`${h.teacher_name}'s own store`};
const canRun=id=>{const h=S.homerooms.find(x=>x.id===id);return !!h&&runsStore(h)&&(S.isAdmin||h.owner_teacher_id===S.user?.id)};
const canEditMenu=id=>{const h=S.homerooms.find(x=>x.id===id);return S.isAdmin||(!!h&&h.owner_teacher_id===S.user?.id)};
const hoursText=h=>{const t=x=>x?new Date("2000-01-01T"+x).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";return [h.store_day,h.store_open&&h.store_close?`${t(h.store_open)}–${t(h.store_close)}`:""].filter(Boolean).join(" ")};
const modeText=h=>h.is_shared_store?`Runs the ${SHARED_LABEL}${hoursText(h)?` (${hoursText(h)})`:""}`:h.store_mode==="own"?`Runs own store${hoursText(h)?` (${hoursText(h)})`:""}`:`Shops at the ${SHARED_LABEL}`;

async function loadAll(){
  const [h,s,b,i,t]=await Promise.all([
    sb.from("homerooms").select("*").order("sort"),
    sb.from("students").select("*").order("first_name").order("last_initial"),
    sb.from("student_balances").select("*"),
    sb.from("store_items").select("*").order("price").order("sort"),
    sb.from("transactions").select("*").order("created_at",{ascending:false}).limit(1000)]);
  for(const r of [h,s,b,i,t])if(r.error)throw r.error;
  S.homerooms=h.data;S.students=s.data;S.items=i.data;S.tx=t.data;S.bal={};for(const r of b.data)S.bal[r.student_id]=r.balance||0;
  const bs=await sb.rpc("homeroom_banker_status");if(!bs.error){S.bankerStatus={};for(const r of bs.data)S.bankerStatus[r.homeroom_id]=r}
  const tn=await sb.rpc("teacher_names");if(!tn.error)S.teachers=tn.data;
  const ss=await sb.rpc("store_status");S.closed={};if(!ss.error)for(const r of ss.data)S.closed[r.homeroom_id]=r.closed_reason;
  const bo=await sb.from("store_blackouts").select("*").order("day");S.blackouts=bo.error?[]:bo.data;
  if(!S.hr){const m=myHr();S.hr=m?m.id:(S.homerooms[0]||{}).id}
}
let reloadT=null;function scheduleReload(){clearTimeout(reloadT);reloadT=setTimeout(async()=>{try{await loadAll();const ae=document.activeElement;if(!(ae&&ae.id==="q"))render();else if(S.view==="bank"){$$("[data-s]").forEach(b=>{const v=b.querySelector(".b");if(v)v.textContent=money(S.bal[b.dataset.s])})}S.sheetRefresh&&S.sheetRefresh()}catch(e){console.error(e)}},250)}
let channel=null;
function subscribe(){if(channel)sb.removeChannel(channel);
  channel=sb.channel("remi-live");
  for(const tb of ["transactions","students","homerooms","store_items","store_blackouts"])channel.on("postgres_changes",{event:"*",schema:"public",table:tb},scheduleReload);
  channel.subscribe(st=>{S.live=st==="SUBSCRIBED";const d=$("#liveDot");if(d){d.classList.toggle("live",S.live);d.title=S.live?"Live":"Connecting…"}if(S.live)scheduleReload()});}

/* ================= AUTH ================= */
function authScreen(mode="in",msg=""){
  $("#app").innerHTML=`<div class="center"><div class="authbox">
   <div class="logo" style="justify-content:center;margin-bottom:14px">${REMI.map(r=>`<i style="background:${r.c}">${r.k}</i>`).join("")}&nbsp;Bank <span class="badge" style="margin-left:6px">Team</span></div>
   <div class="card">
    <div class="tabs"><button class="${mode==="in"?"on":""}" style="${mode==="in"?"background:var(--ink)":""}" data-m="in">Sign in</button><button class="${mode==="up"?"on":""}" style="${mode==="up"?"background:var(--ink)":""}" data-m="up">New teacher</button></div>
    ${msg?`<p class="badge amb" style="display:block;padding:10px;border-radius:12px">${esc(msg)}</p>`:""}
    <form id="af">
     ${mode==="up"?`<label>Your name (what teachers see, e.g. "Mrs. Nelson")</label><input name="name" required maxlength="40">`:""}
     <label>Email</label><input name="email" type="email" autocomplete="email" required>
     <label>Password</label><input name="pw" type="password" minlength="8" autocomplete="${mode==="up"?"new-password":"current-password"}" required>
     ${mode==="up"?`<label>Team invite code <span class="mut">(from Mrs. Plett — optional, skips waiting for approval)</span></label><input name="code" autocapitalize="characters">`:""}
     <button class="pri" style="width:100%;margin-top:16px">${mode==="up"?"Create account":"Sign in"}</button>
    </form>
    ${mode==="in"?`<button id="forgot" class="sm" style="margin-top:10px;background:transparent;color:var(--mut)">Forgot password?</button>`:""}
   </div>
   <button id="goBanker" class="pur" style="width:100%;margin-top:14px">🧑‍🎓 I'm a Student Banker</button>
   <p class="mut" style="text-align:center">Responsible · Empathy · Mindfulness · Integrity</p></div></div>`;
  $$("[data-m]").forEach(b=>b.onclick=()=>authScreen(b.dataset.m));
  $("#goBanker").onclick=()=>{location.hash="#banker";route()};
  if($("#forgot"))$("#forgot").onclick=async()=>{const email=$("#af").email.value.trim();if(!email)return toast("Type your email first.");
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});toast(error?errMsg(error):"Check your email for a reset link.")};
  $("#af").onsubmit=async e=>{e.preventDefault();const f=e.target;const btn=f.querySelector("button");btn.disabled=true;
    try{if(mode==="up"){const {data,error}=await sb.auth.signUp({email:f.email.value.trim(),password:f.pw.value,options:{emailRedirectTo:location.origin+location.pathname,data:{display_name:f.name.value.trim(),invite_code:f.code.value.trim()}}});
        if(error)throw error;if(!data.session)return authScreen("in","Check your email and tap the confirmation link, then sign in here.");}
      else{const {error}=await sb.auth.signInWithPassword({email:f.email.value.trim(),password:f.pw.value});if(error)throw error}
      await boot()}catch(err){btn.disabled=false;toast(errMsg(err))}}
}
async function boot(){
  if(location.hash.startsWith("#banker"))return bankerBoot();
  const {data:{session}}=await sb.auth.getSession();
  if(!session){S.user=null;return authScreen()}
  S.user=session.user;
  const [{data:p},{data:adm}]=await Promise.all([sb.from("profiles").select("*").eq("id",S.user.id).maybeSingle(),sb.rpc("is_admin")]);
  S.profile=p;S.isAdmin=!!adm;
  if(!p||!p.approved)return waitingScreen();
  await loadAll();subscribe();render();
}
function waitingScreen(){
  $("#app").innerHTML=`<div class="center"><div class="authbox card"><h2>⏳ Waiting for approval</h2><p>Hi ${esc(S.profile?.display_name||"")}! Ask Mrs. Plett to approve you on the Team page, or enter the team invite code.</p>
  <form id="rf"><input name="code" placeholder="Team invite code" autocapitalize="characters"><button class="pri" style="width:100%;margin-top:10px">Use code</button></form>
  <div class="row" style="margin-top:10px"><button id="chk">Check again</button><span class="sp"></span><button id="so">Sign out</button></div></div></div>`;
  $("#rf").onsubmit=async e=>{e.preventDefault();const {data,error}=await sb.rpc("redeem_invite",{code:e.target.code.value});if(error||!data)return toast("That code didn't work.");boot()};
  $("#chk").onclick=boot;$("#so").onclick=async()=>{await sb.auth.signOut();boot()};
}

/* ================= SHELL ================= */
const VIEWS=[["bank","🏦 Bank"],["deposit","👥 Homeroom deposit"],["store","🛍️ REMI Store"],["students","🧑‍🎓 Students"],["history","📜 History"],["settings","⚙️ Settings"],["team","👑 Team"]];
function render(){
  if(!S.user)return;
  $("#app").innerHTML=`<header><div class="logo">${REMI.map(r=>`<i style="background:${r.c}">${r.k}</i>`).join("")}</div>
   <nav>${VIEWS.filter(v=>v[0]!=="team"||S.isAdmin).map(([k,l])=>`<button data-v="${k}" class="${S.view===k?"on":""}">${l}</button>`).join("")}</nav>
   <div class="who"><span id="liveDot" class="dot ${S.live?"live":""}" title="${S.live?"Live":"Connecting…"}"></span>${S.live?"Live":"…"} · ${esc(S.profile.display_name)}<button class="sm" id="so">Sign out</button></div></header><main id="main"></main>`;
  $$("nav [data-v]").forEach(b=>b.onclick=()=>{S.view=b.dataset.v;render()});
  $("#so").onclick=async()=>{if(channel)sb.removeChannel(channel);await sb.auth.signOut();S.user=null;authScreen()};
  ({bank:vBank,deposit:vDeposit,store:vStore,students:vStudents,history:vHistory,settings:vSettings,team:vTeam}[S.view]||vBank)();
}
function hrTabs(withAll=true){return `<div class="tabs">${S.homerooms.map(h=>`<button data-hr="${h.id}" class="${S.hr===h.id?"on":""}" style="${S.hr===h.id?`background:${h.color}`:""}">${esc(h.teacher_name)}</button>`).join("")}${withAll?`<button data-hr="all" class="${S.hr==="all"?"on":""}" style="${S.hr==="all"?"background:var(--ink)":""}">All</button>`:""}</div>`}
function bindHr(){$$("[data-hr]").forEach(b=>b.onclick=()=>{S.hr=b.dataset.hr;render()})}
const activeIn=hr=>S.students.filter(s=>s.active&&(hr==="all"||s.homeroom_id===hr));

/* ================= BANK ================= */
function vBank(){const q=(S.q||"").toLowerCase();
  const list=activeIn(S.hr).filter(s=>!q||nm(s).toLowerCase().includes(q));
  const strip=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:12px">${S.homerooms.map(h=>`<div class="card" style="padding:10px 14px;border-color:${h.color}"><b style="color:${h.color}">${esc(h.teacher_name)}</b> <span class="mut">· ${activeIn(h.id).length} students</span><br><small>🛍️ ${esc(modeText(h))}</small>${runsStore(h)?`<br><small class="${S.closed?.[h.id]?"neg":"pos"}">${S.closed?.[h.id]?"Store closed · "+esc(S.closed[h.id]):"Store open now"}</small>`:""}</div>`).join("")}</div>`;
  $("#main").innerHTML=`${strip}${hrTabs()}<div class="row" style="margin-bottom:12px"><input id="q" placeholder="🔎 Type 2–3 letters of a name" value="${esc(S.q||"")}" style="max-width:420px"><span class="sp"></span><span class="mut">${list.length} students</span></div>
   <div class="grid">${list.map(s=>`<button class="tile" data-s="${s.id}"><span class="n">${esc(nm(s))}${s.is_banker?" 🏦":""}</span><span class="b">${money(S.bal[s.id])}</span>${S.hr==="all"?`<span class="hr">${esc(hrName(s.homeroom_id))}</span>`:""}</button>`).join("")||'<p class="mut">No students here yet.</p>'}</div>`;
  bindHr();const qi=$("#q");qi.oninput=()=>{S.q=qi.value;vBank();const n=$("#q");n.focus();n.setSelectionRange(n.value.length,n.value.length)};
  $$("[data-s]").forEach(b=>b.onclick=()=>studentSheet(b.dataset.s));
}
async function insertTx(rows){const {data,error}=await sb.from("transactions").insert(rows).select("id");if(error)throw error;return data.map(r=>r.id)}
async function undo(ids){const {error}=await sb.rpc("undo_transactions",{tx_ids:ids});if(error)toast(errMsg(error));else{toast("Undone ↩︎");scheduleReload()}}
function studentSheet(sid){const st={mode:"give",amt:5,reason:"R",custom:""};
  const bg=document.createElement("div");bg.className="sheet-bg";document.body.appendChild(bg);bg.onclick=e=>{if(e.target===bg){bg.remove();S.sheetRefresh=null}};
  const draw=()=>{const s=stu(sid);if(!s){bg.remove();return}const amt=st.custom?parseInt(st.custom,10)||0:st.amt;
    const hist=S.tx.filter(t=>t.student_id===sid).slice(0,10);
    bg.innerHTML=`<div class="sheet"><div class="row"><h2 style="margin:0">${esc(nm(s))}</h2><span class="badge" style="background:${hrColor(s.homeroom_id)};color:#fff">${esc(hrName(s.homeroom_id))}</span><span class="sp"></span><button class="sm" id="x">✕</button></div>
     <div class="big ${S.bal[sid]<0?"neg":"pos"}">${money(S.bal[sid])}</div>
     <div class="tabs"><button data-mode="give" style="${st.mode==="give"?"background:var(--M);color:#fff":""}">➕ Give</button><button data-mode="take" style="${st.mode==="take"?"background:var(--red);color:#fff":""}">➖ Take away</button></div>
     <div class="amts">${[1,2,5,10].map(n=>`<button data-amt="${n}" class="${!st.custom&&st.amt===n?"on":""}">${st.mode==="give"?"+":"−"}${n}</button>`).join("")}</div>
     <div class="row" style="margin:10px 0"><span class="mut">Other amount:</span><b style="font-size:1.5rem;min-width:70px">${st.custom?"$"+esc(st.custom):"—"}</b></div>
     <div class="pad">${[1,2,3,4,5,6,7,8,9,"C",0,"⌫"].map(k=>`<button data-k="${k}">${k}</button>`).join("")}</div>
     <label>Reason</label><div class="chips">${st.mode==="give"?REMI.map(r=>`<button data-r="${r.k}" class="${st.reason===r.k?"on":""}" style="background:${r.c};color:#fff">${r.k} · ${r.name}</button>`).join(""):TAKE.map(r=>`<button data-r="${r}" class="${st.reason===r?"on":""}">${r}</button>`).join("")}</div>
     <button id="go" class="${st.mode==="give"?"grn":"red"}" style="width:100%;margin-top:14px;min-height:70px;font-size:1.4rem" ${amt>0?"":"disabled"}>${st.mode==="give"?"Give":"Take"} ${money(amt)}</button>
     <h3>Recent</h3>${hist.map(txRow).join("")||'<p class="mut">No transactions yet.</p>'}</div>`;
    $("#x",bg).onclick=()=>{bg.remove();S.sheetRefresh=null};
    $$("[data-mode]",bg).forEach(b=>b.onclick=()=>{st.mode=b.dataset.mode;st.reason=st.mode==="give"?"R":"Fine";draw()});
    $$("[data-amt]",bg).forEach(b=>b.onclick=()=>{st.amt=+b.dataset.amt;st.custom="";draw()});
    $$("[data-k]",bg).forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k==="C")st.custom="";else if(k==="⌫")st.custom=st.custom.slice(0,-1);else if(st.custom.length<4)st.custom+=k;draw()});
    $$("[data-r]",bg).forEach(b=>b.onclick=()=>{st.reason=b.dataset.r;draw()});
    bindUndo(bg);
    $("#go",bg).onclick=async()=>{const a=st.custom?parseInt(st.custom,10):st.amt;if(!a)return;
      try{const ids=await insertTx([{student_id:sid,amount:st.mode==="give"?a:-a,kind:st.mode==="give"?"earn":"take",reason:st.reason}]);
        S.bal[sid]=(S.bal[sid]||0)+(st.mode==="give"?a:-a);st.custom="";draw();toast(`${st.mode==="give"?"Gave":"Took"} ${money(a)} ${st.mode==="give"?"to":"from"} ${nm(stu(sid))}`,()=>undo(ids));scheduleReload()}
      catch(e){toast(errMsg(e))}};
  };
  S.sheetRefresh=draw;draw();
}
function txRow(t){const s=stu(t.student_id);const banker=!!t.banker_name;
  return `<div class="tx ${t.undone_by?"undone":""}"><div class="sp"><b>${esc(nm(s))}</b> <span class="mut">· ${esc(t.item_name?(t.quantity>1?t.quantity+"× ":"")+t.item_name:reasonLabel(t.reason))}${t.kind==="undo"?" (undo)":""}</span><br><small class="mut">${banker?`<span class="badge pur">Banker</span> ${esc(t.banker_name)}`:esc(t.teacher_name||"")} · ${fmtT(t.created_at)}</small></div>
   <span class="a ${t.amount<0?"neg":"pos"}">${t.amount>0?"+":""}${money(t.amount)}</span>${t.kind!=="undo"&&!t.undone_by?`<button class="sm" data-undo="${t.id}">Undo</button>`:""}</div>`}
function bindUndo(root=document){$$("[data-undo]",root).forEach(b=>b.onclick=()=>{const t=S.tx.find(x=>x.id===b.dataset.undo);
  modal(`<h2>Undo this?</h2><p>${esc(nm(stu(t.student_id)))}: ${money(t.amount)} · ${esc(t.item_name||reasonLabel(t.reason))}</p><div class="row"><button class="red" id="y">Yes, undo</button><button id="n">Cancel</button></div>`,(m,close)=>{$("#y",m).onclick=async()=>{close();await undo([t.id])};$("#n",m).onclick=close})})}

/* ================= HOMEROOM DEPOSIT ================= */
function vDeposit(){if(S.hr==="all")S.hr=S.homerooms[0].id;S.dep=S.dep||{amt:5,reason:"R",off:new Set(),custom:""};const d=S.dep;
  const list=activeIn(S.hr);const on=list.filter(s=>!d.off.has(s.id));const amt=d.custom?parseInt(d.custom,10)||0:d.amt;
  $("#main").innerHTML=`${hrTabs(false)}<div class="split"><div class="card"><h2>Tap to mark absent (grey = skip)</h2><div class="row" style="margin-bottom:8px"><button class="sm" id="all">Select all</button><button class="sm" id="none">Select none</button></div>
   <div class="grid">${list.map(s=>`<button class="tile ${d.off.has(s.id)?"":"sel"}" style="${d.off.has(s.id)?"opacity:.4":""}" data-t="${s.id}"><span class="n">${esc(nm(s))}</span><span class="b">${money(S.bal[s.id])}</span></button>`).join("")}</div></div>
   <div class="card"><h2>Give everyone</h2><div class="amts">${[1,2,5,10].map(n=>`<button data-amt="${n}" class="${!d.custom&&d.amt===n?"on":""}">+${n}</button>`).join("")}</div>
   <label>Other amount</label><input id="cust" type="number" inputmode="numeric" min="1" max="500" value="${esc(d.custom)}">
   <label>Reason</label><div class="chips">${REMI.map(r=>`<button data-r="${r.k}" class="${d.reason===r.k?"on":""}" style="background:${r.c};color:#fff">${r.k} · ${r.name}</button>`).join("")}</div>
   <button id="give" class="grn" style="width:100%;min-height:76px;font-size:1.35rem;margin-top:16px" ${on.length&&amt>0?"":"disabled"}>Give ${money(amt)} to ${on.length} students</button></div></div>`;
  bindHr();$$("[data-t]").forEach(b=>b.onclick=()=>{const id=b.dataset.t;d.off.has(id)?d.off.delete(id):d.off.add(id);vDeposit()});
  $("#all").onclick=()=>{d.off.clear();vDeposit()};$("#none").onclick=()=>{list.forEach(s=>d.off.add(s.id));vDeposit()};
  $$("[data-amt]").forEach(b=>b.onclick=()=>{d.amt=+b.dataset.amt;d.custom="";vDeposit()});$("#cust").onchange=e=>{d.custom=e.target.value;vDeposit()};
  $$("[data-r]").forEach(b=>b.onclick=()=>{d.reason=b.dataset.r;vDeposit()});
  $("#give").onclick=async()=>{try{const ids=await insertTx(on.map(s=>({student_id:s.id,amount:amt,kind:"earn",reason:d.reason})));d.off.clear();
    toast(`Gave ${money(amt)} to ${ids.length} students in ${hrName(S.hr)}'s homeroom`,()=>undo(ids));scheduleReload()}catch(e){toast(errMsg(e))}};
}

/* ================= STORE ================= */
function jar(goalId,hrId){return -S.tx.filter(t=>t.kind==="goal"&&!t.undone_by&&t.item_id===goalId&&t.homeroom_id_at_time===hrId).reduce((n,t)=>n+t.amount,0)}
function itemCard(it,editing){const lim=it.per_quarter_limit?`<span class="badge">${it.per_quarter_limit===1?"Once":it.per_quarter_limit+"×"} per quarter</span> `:"";
  return `<button class="item t-${it.tier}" data-it="${it.id}" style="${it.active&&!it.sold_out?"":"opacity:.5"}"><span class="em">${esc(it.emoji||"🎁")}</span><span class="nm">${esc(it.name)}<br>${lim}${it.needs_approval?'<span class="badge amb">Teacher pre-approval</span>':""}${it.note?`<br><small class="mut">${esc(it.note)}</small>`:""}${!it.active?'<span class="badge gry">Hidden</span>':""}${it.sold_out?' <span class="badge" style="background:#FEE2E2;color:#991B1B">SOLD OUT</span>':""}</span><span class="pr">${money(it.price)}</span>${editing?"✏️":""}</button>`}
function vStore(){const stores=S.homerooms.filter(runsStore);
  if(!S.storeHr||!stores.find(h=>h.id===S.storeHr)){const m=myHr();S.storeHr=m&&runsStore(m)?m.id:(m?storeHrOf({homeroom_id:m.id}):(sharedHr()||stores[0]||{}).id)}
  const sh=S.storeHr,ed=S.editStore&&canEditMenu(sh),run=canRun(sh);
  const items=S.items.filter(i=>i.tier!=="goal"&&i.homeroom_id===sh&&(ed||i.active));const goals=S.items.filter(i=>i.tier==="goal"&&(S.editStore&&S.isAdmin||i.active));
  const served=S.homerooms.filter(h=>(runsStore(h)?h.id:(sharedHr()||{}).id)===sh).map(h=>h.teacher_name);
  const hrForGoal=S.hr==="all"?S.homerooms[0].id:S.hr;
  $("#main").innerHTML=`<div class="tabs">${stores.map(h=>`<button data-st="${h.id}" style="${sh===h.id?`background:${h.color};color:#fff`:""}">🛍️ ${esc(storeLabel(h.id))}</button>`).join("")}</div>
   <div class="row"><h2 style="margin:0">${esc(storeLabel(sh))}</h2><span class="sp"></span>${ed?`<button class="grn sm" id="addIt">➕ Add item</button>`:""}${canEditMenu(sh)?`<button class="sm ${ed?"pri":""}" id="edT">${ed?"Done editing":"✏️ Edit menu"}</button>`:""}</div>
   <p class="mut">Serves: <b>${esc(served.join(", "))}</b>${hoursText(S.homerooms.find(h=>h.id===sh)||{})?` · Hours: <b>${esc(hoursText(S.homerooms.find(h=>h.id===sh)))}</b>`:""} · ${S.closed?.[sh]?`<b class="neg">Closed now — ${esc(S.closed[sh])}</b> (teachers can override)`:'<b class="pos">Open now</b>'}. ${ed?"<b>Tap an item to edit it.</b>":run?"Tap an item to ring it up for a student.":"View only — only this store's teacher and bankers can ring up purchases."}</p>
   ${!items.length?`<div class="card"><p>No items on this menu yet.</p>${canEditMenu(sh)&&!S.homerooms.find(h=>h.id===sh)?.is_shared_store?`<button class="pri" id="copyMenu">Copy the ${SHARED_LABEL} menu to start</button>`:""}</div>`:""}
   ${TIERS.filter(t=>t[0]!=="goal").map(([k,l,sub])=>{const its=items.filter(i=>i.tier===k);if(!its.length)return "";
     return `<div class="tier"><h3>${l}</h3><span class="mut">${sub}</span></div><div class="items">${its.map(i=>itemCard(i,ed)).join("")}</div>`}).join("")}
   ${goals.length?`<div class="tier"><h3>CLASS GOALS</h3><span class="mut">The whole class saves together!</span>${S.isAdmin&&S.editStore?"":""}</div>${hrTabs(false)}<div class="items">${goals.map(g=>{const j=jar(g.id,hrForGoal),pc=Math.min(100,Math.round(j/g.price*100));
       return S.editStore&&S.isAdmin?itemCard(g,true).replace('data-it=','data-git='):`<button class="item t-goal" data-goal="${g.id}" style="flex-direction:column;align-items:stretch"><div class="row"><span class="em">${esc(g.emoji)}</span><span class="nm">${esc(g.name)}</span><span class="pr">${money(g.price)}</span></div><div class="bar"><i style="width:${pc}%"></i></div><small>${esc(hrName(hrForGoal))}'s jar: <b>${money(j)}</b> of ${money(g.price)} ${pc>=100?"🎉 Goal reached!":"· tap to chip in"}</small></button>`}).join("")}</div>`:""}`;
  bindHr();$$("[data-st]").forEach(b=>b.onclick=()=>{S.storeHr=b.dataset.st;S.editStore=false;vStore()});
  if($("#edT"))$("#edT").onclick=()=>{S.editStore=!S.editStore;vStore()};if($("#addIt"))$("#addIt").onclick=()=>itemEditor(null,sh);
  if($("#copyMenu"))$("#copyMenu").onclick=async()=>{const {data,error}=await sb.rpc("copy_shared_menu",{p_homeroom_id:sh});if(error)return toast(errMsg(error));toast(`Copied ${data} items — edit prices any time`);scheduleReload()};
  $$("[data-it]").forEach(b=>b.onclick=()=>ed?itemEditor(b.dataset.it,sh):run?buyFlow(b.dataset.it):toast(`Only ${storeLabel(sh)}'s teacher or bankers can ring this up.`));
  $$("[data-git]").forEach(b=>b.onclick=()=>itemEditor(b.dataset.git,null));
  $$("[data-goal]").forEach(b=>b.onclick=()=>goalFlow(b.dataset.goal,hrForGoal));
}
function pickStudent(title,hrDefault,cb,filter){let hr=hrDefault&&hrDefault!=="all"?hrDefault:"all",q="";
  modal(`<h2>${title}</h2><div id="pk"></div>`,(m,close)=>{const draw=()=>{const list=activeIn(hr).filter(s=>(!filter||filter(s))&&(!q||nm(s).toLowerCase().includes(q.toLowerCase())));
    $("#pk",m).innerHTML=`<div class="tabs">${S.homerooms.map(h=>`<button data-ph="${h.id}" style="${hr===h.id?`background:${h.color};color:#fff`:""}">${esc(h.teacher_name)}</button>`).join("")}<button data-ph="all" style="${hr==="all"?"background:var(--ink);color:#fff":""}">All</button></div>
     <input id="pq" placeholder="🔎 Search" value="${esc(q)}"><div class="grid" style="margin-top:10px">${list.map(s=>`<button class="tile" data-p="${s.id}"><span class="n">${esc(nm(s))}</span><span class="b">${money(S.bal[s.id])}</span></button>`).join("")}</div>`;
    $$("[data-ph]",m).forEach(b=>b.onclick=()=>{hr=b.dataset.ph;draw()});const pq=$("#pq",m);pq.oninput=()=>{q=pq.value;draw();const n=$("#pq",m);n.focus();n.setSelectionRange(n.value.length,n.value.length)};
    $$("[data-p]",m).forEach(b=>b.onclick=()=>{close();cb(b.dataset.p)})};draw()})}
function buyFlow(itemId){const it=S.items.find(i=>i.id===itemId);if(!it)return;if(it.sold_out)return toast(`${it.name} is sold out.`);
  const sh=it.homeroom_id;pickStudent(`${esc(it.emoji)} ${esc(it.name)} · ${money(it.price)}<br><small class="mut">Buy for which student? (${esc(storeLabel(sh))} customers)</small>`,"all",sid=>{const s=stu(sid),b=S.bal[sid]||0;
    modal(`<h2>Buy for ${esc(nm(s))}?</h2><p style="font-size:1.2rem">${esc(it.emoji)} ${esc(it.name)} · <b>${money(it.price)}</b></p>${it.needs_approval?`<p class="badge amb" style="display:block;padding:10px;border-radius:12px">⚠️ Needs teacher pre-approval. ${esc(it.note||"")}</p><label><input type="checkbox" id="ok" style="width:auto;min-height:0"> I approve this purchase</label>`:""}
      <p style="font-size:1.3rem"><b>${money(b)}</b> → <b class="${b-it.price<0?"neg":""}">${money(b-it.price)}</b></p>${b<it.price?`<p class="neg">Needs ${money(it.price-b)} more.</p>`:""}
      <div class="row"><button class="grn" id="y" ${b<it.price?"disabled":""}>Buy for ${money(it.price)}</button><button id="n">Cancel</button></div>`,(m,close)=>{$("#n",m).onclick=close;
      $("#y",m).onclick=async()=>{if(it.needs_approval&&!$("#ok",m).checked)return toast("Tick “I approve” first.");close();
        const doBuy=async ov=>{const {data,error}=await sb.rpc("store_buy",{p_student_id:sid,p_items:[{item_id:it.id,quantity:1}],p_override:ov});
          if(error&&/STORE_CLOSED/.test(error.message))return modal(`<h2>🕒 Store is closed</h2><p>${esc(error.message.replace(/^STORE_CLOSED:\s*/,""))}</p><p>Override and ring it up anyway? It will be logged as an after-hours override.</p><div class="row"><button class="pri" id="ov">Override & buy</button><button id="nc">Cancel</button></div>`,(m2,c2)=>{$("#nc",m2).onclick=c2;$("#ov",m2).onclick=()=>{c2();doBuy(true)}});
          if(error)return toast(errMsg(error));toast(`${nm(s)} bought ${it.name}`,()=>undo(data));scheduleReload()};doBuy(false)}})},s=>storeHrOf(s)===sh)}
function goalFlow(goalId,hrId){const g=S.items.find(i=>i.id===goalId);let off=new Set(),each=5;
  modal(`<h2>${esc(g.emoji)} Chip in: ${esc(g.name)}</h2><p class="mut">${esc(hrName(hrId))}'s jar: ${money(jar(goalId,hrId))} of ${money(g.price)}. Students who can't afford it are skipped.</p><div id="gw"></div>`,(m,close)=>{const draw=()=>{const list=activeIn(hrId);
    const on=list.filter(s=>!off.has(s.id)&&(S.bal[s.id]||0)>=each);
    $("#gw",m).innerHTML=`<label>Each student gives</label><input id="ge" type="number" min="1" max="1000" value="${each}"><div class="grid" style="margin:10px 0">${list.map(s=>{const can=(S.bal[s.id]||0)>=each;return `<button class="tile ${!off.has(s.id)&&can?"sel":""}" style="${off.has(s.id)||!can?"opacity:.4":""}" data-g="${s.id}"><span class="n">${esc(nm(s))}</span><span class="b">${money(S.bal[s.id])}</span></button>`}).join("")}</div>
     <button class="pur" id="gy" style="width:100%" ${on.length?"":"disabled"}>${on.length} students give ${money(each)} (= ${money(on.length*each)})</button>`;
    $("#ge",m).onchange=e=>{each=Math.max(1,parseInt(e.target.value,10)||1);draw()};$$("[data-g]",m).forEach(b=>b.onclick=()=>{const id=b.dataset.g;off.has(id)?off.delete(id):off.add(id);draw()});
    $("#gy",m).onclick=async()=>{close();const {data,error}=await sb.rpc("give_to_goal",{p_student_ids:on.map(s=>s.id),p_goal_id:goalId,p_each:each});if(error)return toast(errMsg(error));toast(`Added ${money(on.length*each)} to the ${g.name} jar`,()=>undo(data));scheduleReload()}};draw()})}
function itemEditor(id,menuHr){const it=id?S.items.find(i=>i.id===id):{tier:menuHr?"small":"goal",name:"",emoji:"🎁",price:1,per_quarter_limit:null,active:true,needs_approval:false,note:""};
  modal(`<h2>${id?"Edit item":"New item"}</h2><form id="ie"><label>Name</label><input name="name" required maxlength="60" value="${esc(it.name)}">
   <div class="row"><div style="flex:1"><label>Emoji</label><input name="emoji" maxlength="4" value="${esc(it.emoji||"")}"></div><div style="flex:1"><label>Price ($)</label><input name="price" type="number" min="1" max="10000" required value="${it.price}"></div></div>
   <label>Group</label><select name="tier">${TIERS.filter(([k])=>menuHr?k!=="goal":k==="goal").map(([k,l])=>`<option value="${k}" ${it.tier===k?"selected":""}>${l}</option>`).join("")}</select>
   <label>Limit per quarter (blank = no limit)</label><input name="lim" type="number" min="1" value="${it.per_quarter_limit??""}">
   <label>Note shown on the card</label><input name="note" maxlength="140" value="${esc(it.note||"")}">
   <label><input type="checkbox" name="appr" style="width:auto;min-height:0" ${it.needs_approval?"checked":""}> Needs teacher pre-approval (bankers can't sell it)</label>
   <label><input type="checkbox" name="so" style="width:auto;min-height:0" ${it.sold_out?"checked":""}> Sold out</label>
   <label><input type="checkbox" name="act" style="width:auto;min-height:0" ${it.active?"checked":""}> Show in store</label>
   <div class="row" style="margin-top:14px"><button class="pri">Save</button><button type="button" id="n">Cancel</button></div></form>`,(m,close)=>{$("#n",m).onclick=close;
   $("#ie",m).onsubmit=async e=>{e.preventDefault();const f=e.target;const row={name:f.name.value.trim(),emoji:f.emoji.value.trim()||"🎁",price:parseInt(f.price.value,10),tier:f.tier.value,per_quarter_limit:f.lim.value?parseInt(f.lim.value,10):null,note:f.note.value.trim()||null,needs_approval:f.appr.checked,sold_out:f.so.checked,active:f.act.checked};
     const r=id?await sb.from("store_items").update(row).eq("id",id):await sb.from("store_items").insert({...row,sort:200,homeroom_id:menuHr||null});if(r.error)return toast(errMsg(r.error));close();toast("Saved");scheduleReload()}})}

/* ================= STUDENTS ================= */
function vStudents(){
  $("#main").innerHTML=`<div class="row"><h2 style="margin:0">Students</h2><span class="sp"></span><label style="margin:0"><input type="checkbox" id="si" style="width:auto;min-height:0" ${S.showInactive?"checked":""}> Show inactive</label><button class="grn" id="add">➕ Add student</button><button id="bulk">📋 Paste a list</button></div>
  ${S.homerooms.map(h=>{const list=S.students.filter(s=>s.homeroom_id===h.id&&(S.showInactive||s.active));
   return `<div class="card" style="margin-top:12px"><h3 style="margin-top:0;color:${h.color}">${esc(h.teacher_name)} <span class="mut">· ${list.filter(s=>s.active).length} active</span></h3><table>${list.map(s=>`<tr style="${s.active?"":"opacity:.5"}"><td><b>${esc(nm(s))}</b> ${s.last_initial==="?"?'<span class="badge amb">needs last initial</span>':""} ${s.is_banker?'<span class="badge pur">Banker</span>':""} ${s.active?"":'<span class="badge gry">Inactive</span>'}</td><td>${money(S.bal[s.id])}</td><td style="text-align:right"><button class="sm" data-ed="${s.id}">Edit / move</button></td></tr>`).join("")}</table></div>`}).join("")}`;
  $("#si").onchange=e=>{S.showInactive=e.target.checked;vStudents()};$("#add").onclick=()=>studentEditor(null);$("#bulk").onclick=bulkAdd;
  $$("[data-ed]").forEach(b=>b.onclick=()=>studentEditor(b.dataset.ed));
}
function studentEditor(id){const s=id?stu(id):{first_name:"",last_initial:"",homeroom_id:S.hr==="all"?S.homerooms[0].id:S.hr,active:true,is_banker:false};
  modal(`<h2>${id?"Edit "+esc(nm(s)):"Add a student"}</h2><form id="se"><div class="row"><div style="flex:2"><label>First name</label><input name="f" required maxlength="40" value="${esc(s.first_name)}"></div><div style="flex:1"><label>Last initial</label><input name="l" required maxlength="2" value="${esc(s.last_initial==="?"?"":s.last_initial)}"></div></div>
   <label>Homeroom teacher</label><select name="h">${S.homerooms.map(h=>`<option value="${h.id}" ${s.homeroom_id===h.id?"selected":""}>${esc(h.teacher_name)}</option>`).join("")}</select>
   ${id?`<p class="mut">Moving keeps the balance (${money(S.bal[id])}) and all history.</p>`:""}
   <label><input type="checkbox" name="bk" style="width:auto;min-height:0" ${s.is_banker?"checked":""}> Student Banker</label>
   ${id?`<label><input type="checkbox" name="act" style="width:auto;min-height:0" ${s.active?"checked":""}> Active (uncheck if the student left — history is kept)</label>`:""}
   <div class="row" style="margin-top:14px"><button class="pri">Save</button><button type="button" id="n">Cancel</button></div></form>`,(m,close)=>{$("#n",m).onclick=close;
   $("#se",m).onsubmit=async e=>{e.preventDefault();const f=e.target;const row={first_name:f.f.value.trim(),last_initial:f.l.value.trim().replace(/\./g,"").toUpperCase(),homeroom_id:f.h.value,is_banker:f.bk.checked};if(id)row.active=f.act.checked;
     if(!row.last_initial)return toast("Add a last initial.");
     const r=id?await sb.from("students").update(row).eq("id",id):await sb.from("students").insert(row);if(r.error)return toast(errMsg(r.error));close();toast(id?"Saved":"Student added");scheduleReload()}})}
function bulkAdd(){modal(`<h2>Paste a list</h2><p class="mut">One per line: <code>First L, Teacher</code> — e.g. <code>Maya R, Nelson</code></p><textarea id="bt"></textarea><div class="row" style="margin-top:10px"><button class="pri" id="y">Add</button><button id="n">Cancel</button></div>`,(m,close)=>{$("#n",m).onclick=close;
  $("#y",m).onclick=async()=>{const rows=[],bad=[];for(const line of $("#bt",m).value.split(/\n/).map(x=>x.trim()).filter(Boolean)){const [who,t]=line.split(",").map(x=>x&&x.trim());const h=S.homerooms.find(h=>h.teacher_name.toLowerCase()===(t||"").toLowerCase());const parts=(who||"").split(/\s+/);
    if(!h||parts.length<2){bad.push(line);continue}rows.push({first_name:parts.slice(0,-1).join(" "),last_initial:parts.at(-1).replace(/\./g,"").slice(0,2).toUpperCase(),homeroom_id:h.id})}
    if(bad.length)return toast("Check these lines: "+bad.join(" | "));const r=await sb.from("students").insert(rows);if(r.error)return toast(errMsg(r.error));close();toast(`Added ${rows.length} students`);scheduleReload()}})}

/* ================= HISTORY ================= */
function vHistory(){const f=S.hist;const q=f.q.toLowerCase();
  const list=S.tx.filter(t=>(!f.hr||t.homeroom_id_at_time===f.hr)&&(!f.banker||t.banker_name)&&(!f.who||(t.teacher_name||"")===f.who)&&(!q||nm(stu(t.student_id)).toLowerCase().includes(q)));
  const whos=[...new Set(S.tx.map(t=>t.teacher_name).filter(Boolean))].sort();
  $("#main").innerHTML=`<div class="row"><h2 style="margin:0">History</h2><span class="sp"></span><button id="csv">⬇️ CSV</button></div>
   <div class="row" style="margin:10px 0"><select id="fh" style="max-width:200px"><option value="">All homerooms</option>${S.homerooms.map(h=>`<option value="${h.id}" ${f.hr===h.id?"selected":""}>${esc(h.teacher_name)}</option>`).join("")}</select>
   <select id="fw" style="max-width:240px"><option value="">Anyone</option>${whos.map(w=>`<option ${f.who===w?"selected":""}>${esc(w)}</option>`).join("")}</select>
   <input id="fq" placeholder="Student name" value="${esc(f.q)}" style="max-width:200px"><label style="margin:0"><input type="checkbox" id="fb" style="width:auto;min-height:0" ${f.banker?"checked":""}> Banker transactions only</label></div>
   <div class="card">${list.slice(0,300).map(txRow).join("")||'<p class="mut">Nothing yet.</p>'}${list.length>300?`<p class="mut">Showing newest 300 of ${list.length}. Use CSV for all.</p>`:""}</div>`;
  $("#fh").onchange=e=>{f.hr=e.target.value;vHistory()};$("#fw").onchange=e=>{f.who=e.target.value;vHistory()};$("#fb").onchange=e=>{f.banker=e.target.checked;vHistory()};
  $("#fq").onchange=e=>{f.q=e.target.value;vHistory()};bindUndo();
  $("#csv").onclick=()=>{const rows=[["When (Denver)","Student","Homeroom","Amount","Kind","Reason","Item","Qty","By","Banker","Undone"]].concat(list.map(t=>[fmtT(t.created_at),nm(stu(t.student_id)),hrName(t.homeroom_id_at_time),t.amount,t.kind,reasonLabel(t.reason),t.item_name||"",t.quantity,t.teacher_name||"",t.banker_name||"",t.undone_by?"yes":""]));
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="remi-bank-history.csv";a.click()};
}

/* ================= SETTINGS ================= */
function vSettings(){const mine=myHr();
  $("#main").innerHTML=`<div class="split"><div class="card"><h2>My account</h2><form id="pn"><label>Name teachers see</label><input name="n" maxlength="40" value="${esc(S.profile.display_name)}"><button class="pri" style="margin-top:10px">Save name</button></form>
   <h2 style="margin-top:22px">My homeroom</h2><p class="mut">Claim your homeroom so you can set its banker code.</p>
   <div class="chips">${S.homerooms.map(h=>{const own=S.teachers.find(t=>t.id===h.owner_teacher_id);return `<button data-claim="${h.id}" style="${h.owner_teacher_id===S.user.id?`background:${h.color};color:#fff`:""}">${esc(h.teacher_name)}${own&&h.owner_teacher_id!==S.user.id?` (${esc(own.display_name)})`:""}${h.owner_teacher_id===S.user.id?" ✓":""}</button>`}).join("")}</div></div>
   <div class="card"><h2>🏦 Student Bankers</h2>${mine?`<p>Homeroom: <b>${esc(mine.teacher_name)}</b> · Banker code: ${S.bankerStatus[mine.id]?.has_code?`<span class="badge" style="background:#DCFCE7">set ${fmtT(S.bankerStatus[mine.id].code_updated_at)}</span>`:'<span class="badge amb">not set</span>'}</p>
     <form id="bc" class="row"><input name="c" type="password" inputmode="numeric" pattern="[0-9]{4,8}" placeholder="New 4–8 digit code" style="max-width:240px" required><button class="pur">Set code</button></form>
     <p class="mut">Changing the code signs out every banker in your homeroom.</p><h3>Who are bankers?</h3><div class="grid">${activeIn(mine.id).map(s=>`<button class="tile ${s.is_banker?"sel":""}" data-bk="${s.id}"><span class="n">${esc(nm(s))}</span><span>${s.is_banker?"🏦 Banker":"Tap to make banker"}</span></button>`).join("")}</div>`
     :`<p class="mut">Claim your homeroom on the left first.</p>`}
     ${mine?`<h2 style="margin-top:22px">🛍️ Store mode</h2>${mine.is_shared_store?`<p>You run the <b>${SHARED_LABEL}</b> for every class that picks it.</p>`:`
       <div class="chips" style="flex-direction:column"><button data-sm="plett" style="${mine.store_mode==="plett"?"background:var(--R);color:#fff":""}">${mine.store_mode==="plett"?"✓ ":""}${SHARED_LABEL} handles my class</button><button data-sm="own" style="${mine.store_mode==="own"?"background:var(--R);color:#fff":""}">${mine.store_mode==="own"?"✓ ":""}I run my own store</button></div>`}
       ${runsStore(mine)?`<h3>Store hours</h3><form id="sd"><label>Store day(s) — blank = any day</label><input name="d" placeholder="e.g. Friday, or Mon, Fri" value="${esc(mine.store_day||"")}">
         <div class="row"><div style="flex:1"><label>Opens</label><input name="o" type="time" value="${esc((mine.store_open||"").slice(0,5))}"></div><div style="flex:1"><label>Closes</label><input name="c" type="time" value="${esc((mine.store_close||"").slice(0,5))}"></div></div>
         <p class="mut">Purchases outside these hours are blocked (you can override; bankers can't).</p><button class="pri">Save hours</button></form>
         <h3>Blackout dates (store closed)</h3><form id="bo" class="row"><input name="d" type="date" required style="max-width:200px"><input name="n" placeholder="Why? e.g. Testing, Sub day" maxlength="80" style="max-width:240px"><button>Add</button></form>
         ${(S.blackouts||[]).filter(b=>b.homeroom_id===mine.id).map(b=>`<div class="tx"><span class="sp"><b>${new Date(b.day+"T12:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</b> <span class="mut">${esc(b.note||"")}</span></span><button class="sm" data-rmbo="${b.id}">Remove</button></div>`).join("")||'<p class="mut">No blackout dates.</p>'}`:""}
       <p class="mut">Your class keeps full bank access either way. Switch any time.</p>`:""}
     <p style="margin-top:14px">Bankers open this same link on the class iPad and tap <b>“I'm a Student Banker.”</b> They can only add/take money and sell store items for your homeroom, and they lock after 5 minutes idle.</p><button id="openB" class="sm">Open banker mode on this device</button></div></div>`;
  $("#pn").onsubmit=async e=>{e.preventDefault();const r=await sb.from("profiles").update({display_name:e.target.n.value.trim()}).eq("id",S.user.id);if(r.error)return toast(errMsg(r.error));S.profile.display_name=e.target.n.value.trim();toast("Saved");render()};
  $$("[data-claim]").forEach(b=>b.onclick=async()=>{const h=S.homerooms.find(x=>x.id===b.dataset.claim);const mineNow=h.owner_teacher_id===S.user.id;
    const {error}=await sb.rpc("claim_homeroom",{p_homeroom_id:h.id,p_claim:!mineNow});if(error)return toast(errMsg(error));if(!mineNow){for(const o of S.homerooms)if(o.id!==h.id&&o.owner_teacher_id===S.user.id)await sb.rpc("claim_homeroom",{p_homeroom_id:o.id,p_claim:false})}
    toast(mineNow?"Released":"This is your homeroom now");await loadAll();render()});
  if($("#bc"))$("#bc").onsubmit=async e=>{e.preventDefault();const {error}=await sb.rpc("set_banker_code",{p_homeroom_id:mine.id,p_code:e.target.c.value});if(error)return toast(errMsg(error));toast("Banker code saved");await loadAll();render()};
  $$("[data-bk]").forEach(b=>b.onclick=async()=>{const s=stu(b.dataset.bk);const r=await sb.from("students").update({is_banker:!s.is_banker}).eq("id",s.id);if(r.error)return toast(errMsg(r.error));s.is_banker=!s.is_banker;vSettings()});
  $("#openB").onclick=()=>{location.hash="#banker";route()};
  $$("[data-sm]").forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc("set_store_mode",{p_homeroom_id:mine.id,p_mode:b.dataset.sm,p_day:mine.store_day});if(error)return toast(errMsg(error));toast(b.dataset.sm==="own"?"You now run your own store. Add items on the REMI Store tab.":`${SHARED_LABEL} now handles your class`);await loadAll();render()});
  if($("#sd"))$("#sd").onsubmit=async e=>{e.preventDefault();const f=e.target;const {error}=await sb.rpc("set_store_hours",{p_homeroom_id:mine.id,p_day:f.d.value,p_open:f.o.value||null,p_close:f.c.value||null});if(error)return toast(errMsg(error));toast("Store hours saved");await loadAll();render()};
  if($("#bo"))$("#bo").onsubmit=async e=>{e.preventDefault();const f=e.target;const r=await sb.from("store_blackouts").insert({homeroom_id:mine.id,day:f.d.value,note:f.n.value.trim()||null});if(r.error)return toast(errMsg(r.error));toast("Blackout date added");await loadAll();render()};
  $$("[data-rmbo]").forEach(b=>b.onclick=async()=>{const r=await sb.from("store_blackouts").delete().eq("id",b.dataset.rmbo);if(r.error)return toast(errMsg(r.error));await loadAll();render()});
}

/* ================= TEAM (admin) ================= */
async function vTeam(){if(!S.isAdmin)return;$("#main").innerHTML=`<p>Loading…</p>`;
  const [{data:ts,error},{data:code}]=await Promise.all([sb.rpc("admin_list_teachers"),sb.rpc("admin_get_invite_code")]);if(error)return toast(errMsg(error));
  $("#main").innerHTML=`<div class="split"><div class="card"><h2>Teachers</h2><table>${ts.map(t=>`<tr><td><b>${esc(t.display_name)}</b><br><small class="mut">${esc(t.email)}</small></td><td>${t.is_admin?'<span class="badge pur">Admin</span>':""} ${t.approved?'<span class="badge" style="background:#DCFCE7">Approved</span>':'<span class="badge amb">Waiting</span>'}</td>
    <td style="text-align:right">${t.id===S.user.id?"(you)":`${t.approved?`<button class="sm red" data-ap="${t.id}" data-v="0">Remove access</button>`:`<button class="sm grn" data-ap="${t.id}" data-v="1">Approve</button>`} <button class="sm" data-ad="${t.id}" data-v="${t.is_admin?0:1}">${t.is_admin?"Remove admin":"Make admin"}</button>`}</td></tr>`).join("")}</table></div>
   <div class="card"><h2>Team invite code</h2><p class="mut">Teachers who enter this when they sign up are approved right away.</p><form id="ic" class="row"><input name="c" value="${esc(code||"")}" style="max-width:260px"><button class="pri">Save code</button></form>
    <h2 style="margin-top:22px">Homeroom owners</h2><p class="mut">The owner sets that homeroom's banker code.</p><table>${S.homerooms.map(h=>`<tr><td style="color:${h.color}"><b>${esc(h.teacher_name)}</b></td><td><small>${esc(modeText(h))}</small></td><td><select data-own="${h.id}"><option value="">— nobody —</option>${ts.filter(t=>t.approved).map(t=>`<option value="${t.id}" ${h.owner_teacher_id===t.id?"selected":""}>${esc(t.display_name)}</option>`).join("")}</select></td></tr>`).join("")}</table></div></div>`;
  $$("[data-ap]").forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc("admin_set_approved",{_user_id:b.dataset.ap,_approved:b.dataset.v==="1"});if(error)return toast(errMsg(error));vTeam()});
  $$("[data-ad]").forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc("admin_set_admin",{_user_id:b.dataset.ad,_make:b.dataset.v==="1"});if(error)return toast(errMsg(error));vTeam()});
  $("#ic").onsubmit=async e=>{e.preventDefault();const {error}=await sb.rpc("admin_set_invite_code",{p_code:e.target.c.value});toast(error?errMsg(error):"Invite code saved")};
  $$("[data-own]").forEach(s=>s.onchange=async()=>{const {error}=await sb.rpc("admin_assign_homeroom",{p_homeroom_id:s.dataset.own,p_teacher:s.value||null});if(error)return toast(errMsg(error));await loadAll();toast("Saved")});
}

/* ================= STUDENT BANKER MODE ================= */
const B={token:null,hr:null,me:null,state:null,sel:null,mode:"give",reason:"R",tab:"bank",idleAt:0,poll:null,tick:null,lastPing:0};
const IDLE=300;
function bankerExit(msg){clearInterval(B.poll);clearInterval(B.tick);if(B.token)sbAnon.rpc("banker_logout",{p_token:B.token});Object.assign(B,{token:null,me:null,state:null,sel:null,tab:"bank"});sessionStorage.removeItem("remiBanker");bankerBoot(msg)}
async function bankerBoot(msg=""){clearInterval(B.poll);clearInterval(B.tick);
  const saved=JSON.parse(sessionStorage.getItem("remiBanker")||"null");if(saved&&saved.token&&saved.me){Object.assign(B,saved);return bankerStart()}
  const {data,error}=await sbAnon.rpc("banker_homerooms");if(error){$("#app").innerHTML=`<div class="center"><div class="card">${esc(errMsg(error))}</div></div>`;return}
  $("#app").innerHTML=`<div class="center"><div class="authbox card"><h2>🏦 Student Banker</h2>${msg?`<p class="badge amb" style="display:block;padding:10px;border-radius:12px">${esc(msg)}</p>`:""}<p>Pick your homeroom teacher:</p>
   <div class="chips">${data.map(h=>`<button data-bh="${h.id}" style="background:${h.color};color:#fff;flex:1" ${h.has_code?"":"disabled"}>${esc(h.teacher_name)}${h.has_code?"":" (no code yet)"}</button>`).join("")}</div>
   <form id="bcf" class="hidden"><label>Banker code</label><input name="c" type="password" inputmode="numeric" autocomplete="off" required><button class="pur" style="width:100%;margin-top:10px">Unlock</button></form>
   <button id="back" style="width:100%;margin-top:14px;background:transparent">← Teacher sign-in</button></div></div>`;
  $$("[data-bh]").forEach(b=>b.onclick=()=>{B.hr=b.dataset.bh;$$("[data-bh]").forEach(x=>x.style.outline=x===b?"4px solid var(--ink)":"");$("#bcf").classList.remove("hidden");$("#bcf").c.focus()});
  $("#back").onclick=()=>{location.hash="";boot()};
  $("#bcf").onsubmit=async e=>{e.preventDefault();const {data:r,error}=await sbAnon.rpc("banker_login",{p_homeroom_id:B.hr,p_code:e.target.c.value});if(error)return toast(errMsg(error));
    B.token=r.token;if(!r.bankers.length)return bankerExit("Your teacher hasn't picked any bankers yet.");
    $("#app").innerHTML=`<div class="center"><div class="authbox card"><h2>Who are you?</h2><div class="grid">${r.bankers.map(s=>`<button class="tile" data-me="${s.id}"><span class="n">${esc(s.first_name)} ${esc(s.last_initial)}.</span></button>`).join("")}</div></div></div>`;
    $$("[data-me]").forEach(b=>b.onclick=async()=>{const {data:me,error}=await sbAnon.rpc("banker_choose",{p_token:B.token,p_banker_id:b.dataset.me});if(error)return bankerExit(errMsg(error));B.me=me;bankerStart()})};
}
async function bankerStart(){sessionStorage.setItem("remiBanker",JSON.stringify({token:B.token,me:B.me,hr:B.hr}));B.idleAt=Date.now();
  await bankerRefresh();if(!B.token)return;B.poll=setInterval(bankerRefresh,3000);B.tick=setInterval(bankerTick,1000);
  document.addEventListener("pointerdown",bankerActivity,{passive:true});}
function bankerActivity(){if(!B.token)return;B.idleAt=Date.now();if(Date.now()-B.lastPing>30000){B.lastPing=Date.now();sbAnon.rpc("banker_ping",{p_token:B.token}).then(({error})=>{if(error)bankerExit(errMsg(error))})}}
function bankerTick(){if(!B.token)return;const left=IDLE-Math.floor((Date.now()-B.idleAt)/1000);const el=$("#lockT");if(el)el.textContent=`🔒 Locks in ${Math.floor(Math.max(0,left)/60)}:${String(Math.max(0,left)%60).padStart(2,"0")}`;if(left<=0)bankerExit("Locked after 5 minutes idle. Enter the code again.")}
async function bankerRefresh(){if(!B.token)return;const {data,error}=await sbAnon.rpc("banker_state",{p_token:B.token});if(error)return bankerExit(errMsg(error));
  const first=!B.state;B.state=data;if(first||!$(".modal-bg"))bankerRender()}
function bankerRender(){const st=B.state;if(!st)return;const sel=st.students.find(s=>s.id===B.sel);
  $("#app").innerHTML=`<header style="border-color:${st.homeroom.color}"><div class="logo">${REMI.map(r=>`<i style="background:${r.c}">${r.k}</i>`).join("")}</div><b>Banker: ${esc(B.me.first_name)} ${esc(B.me.last_initial)}. · ${esc(st.homeroom.teacher_name)}'s homeroom</b>
   <nav style="flex:0 0 auto"><button data-bt="bank" class="${B.tab==="bank"?"on":""}">🏦 Bank</button><button data-bt="store" class="${B.tab==="store"?"on":""}">🛍️ REMI Store</button><button data-bt="recent" class="${B.tab==="recent"?"on":""}">📜 Recent</button></nav><span class="sp"></span><span class="lock" id="lockT">🔒</span><button class="sm red" id="bx">Done</button></header><main id="bm"></main>`;
  $$("[data-bt]").forEach(b=>b.onclick=()=>{B.tab=b.dataset.bt;bankerRender()});$("#bx").onclick=()=>bankerExit("Signed out. Thanks, banker!");bankerTick();
  const m=$("#bm");
  if(B.tab==="recent"){m.innerHTML=`<div class="card">${st.recent.map(t=>`<div class="tx ${t.undone?"undone":""}"><div class="sp"><b>${esc(t.first_name)} ${esc(t.last_initial)}.</b> <span class="mut">· ${esc(t.item_name||reasonLabel(t.reason))}</span><br><small class="mut">${esc(t.banker_name?"Banker "+t.banker_name:t.teacher_name||"")} · ${fmtT(t.created_at)}</small></div><span class="a ${t.amount<0?"neg":"pos"}">${t.amount>0?"+":""}${money(t.amount)}</span></div>`).join("")||'<p class="mut">Nothing yet.</p>'}<p class="mut">Made a mistake? Tell your teacher — only teachers can undo.</p></div>`;return}
  if(B.tab==="store"){const hm=st.homeroom;if(!hm.runs_store){m.innerHTML=`<div class="card"><h2>🛍️ Your class shops at the Room D211 Friday Store</h2><p>The D211 bankers ring up purchases there. You can still add and take REMI dollars on the Bank tab.</p></div>`;return}
    const ss=(st.store_students||[]).find(x=>x.id===B.ssel);
    m.innerHTML=`<h2>🛍️ ${hm.is_shared_store?"Room D211 Friday Store":esc(hm.teacher_name)+"'s store"}${hm.store_day?` · ${esc(hm.store_day)}`:""}</h2><label>Customer</label><select id="cust"><option value="">— pick a student —</option>${(st.store_students||[]).map(x=>`<option value="${x.id}" ${B.ssel===x.id?"selected":""}>${esc(x.first_name)} ${esc(x.last_initial)}. (${esc(x.teacher_name)}) · ${money(x.balance)}</option>`).join("")}</select>
     ${hm.closed_reason?`<p class="badge" style="display:block;padding:12px;border-radius:12px;background:#FEE2E2;color:#991B1B;font-size:1.05rem">🕒 Store closed — ${esc(hm.closed_reason)}. Only a teacher can override.</p>`:""}${ss?`<p style="font-size:1.2rem">Selling to <b>${esc(ss.first_name)} ${esc(ss.last_initial)}.</b> · ${money(ss.balance)}</p>`:'<p class="mut">Pick a customer, then tap an item.</p>'}${TIERS.filter(t=>t[0]!=="goal").map(([k,l,sub])=>{const its=st.items.filter(i=>i.tier===k);if(!its.length)return "";
      return `<div class="tier"><h3>${l}</h3><span class="mut">${sub}</span></div><div class="items">${its.map(i=>itemCard({...i,active:true},false)).join("")}</div>`}).join("")}`;
    $("#cust",m).onchange=e=>{B.ssel=e.target.value;bankerRender()};const sel=ss;
    $$("[data-it]",m).forEach(b=>b.onclick=()=>{const it=st.items.find(i=>i.id===b.dataset.it);if(!sel)return toast("Pick a customer first.");if(it.needs_approval)return toast("That one needs your teacher.");if(it.sold_out)return toast("Sold out.");if(hm.closed_reason)return toast("The store is closed right now.");
      modal(`<h2>Sell to ${esc(sel.first_name)} ${esc(sel.last_initial)}.?</h2><p style="font-size:1.2rem">${esc(it.emoji)} ${esc(it.name)} · <b>${money(it.price)}</b></p><p style="font-size:1.3rem">${money(sel.balance)} → ${money(sel.balance-it.price)}</p><div class="row"><button class="grn" id="y" ${sel.balance<it.price?"disabled":""}>Sell</button><button id="n">Cancel</button></div>`,(mm,close)=>{$("#n",mm).onclick=close;
        $("#y",mm).onclick=async()=>{close();const {error}=await sbAnon.rpc("banker_buy",{p_token:B.token,p_student_id:sel.id,p_items:[{item_id:it.id,quantity:1}]});if(error)return toast(errMsg(error));B.lastPing=Date.now();toast(`Sold ${it.name} to ${sel.first_name}`);bankerRefresh()}})});return}
  m.innerHTML=`<div class="split"><div class="grid">${st.students.map(s=>`<button class="tile ${B.sel===s.id?"sel":""}" data-bs="${s.id}"><span class="n">${esc(s.first_name)} ${esc(s.last_initial)}.</span><span class="b">${money(s.balance)}</span></button>`).join("")}</div>
   <div class="card" style="position:sticky;top:80px;align-self:start">${sel?`<h2>${esc(sel.first_name)} ${esc(sel.last_initial)}.</h2><div class="big pos">${money(sel.balance)}</div>
     <label>Reason</label><div class="chips">${REMI.map(r=>`<button data-br="${r.k}" class="${B.reason===r.k?"on":""}" style="background:${r.c};color:#fff">${r.k}</button>`).join("")}${TAKE.slice(0,1).concat(["Correction"]).map(r=>`<button data-br="${r}" class="${B.reason===r?"on":""}">${r}</button>`).join("")}</div>
     <label>Add</label><div class="amts">${[1,2,5,10].map(n=>`<button class="grn" data-ba="${n}">+${n}</button>`).join("")}</div>
     <label>Take away</label><div class="amts">${[1,2,5,10].map(n=>`<button class="red" data-ba="-${n}">−${n}</button>`).join("")}</div>`:`<h2>Tap a student</h2><p class="mut">Then tap a reason and an amount.</p>`}</div></div>`;
  $$("[data-bs]",m).forEach(b=>b.onclick=()=>{B.sel=b.dataset.bs;bankerRender()});$$("[data-br]",m).forEach(b=>b.onclick=()=>{B.reason=b.dataset.br;bankerRender()});
  $$("[data-ba]",m).forEach(b=>b.onclick=async()=>{const a=parseInt(b.dataset.ba,10);b.disabled=true;const {error}=await sbAnon.rpc("banker_adjust",{p_token:B.token,p_student_id:sel.id,p_amount:a,p_reason:B.reason});
    if(error){b.disabled=false;return toast(errMsg(error))}B.lastPing=Date.now();sel.balance+=a;toast(`${a>0?"+":""}${money(a)} ${a>0?"to":"from"} ${sel.first_name} · ${reasonLabel(B.reason)}`);bankerRender();bankerRefresh()});
}

/* ================= ROUTER ================= */
function route(){boot().catch(e=>{console.error(e);$("#app").innerHTML=`<div class="center"><div class="card"><h2>Oops</h2><p>${esc(errMsg(e))}</p><button onclick="location.reload()">Reload</button></div></div>`})}
window.addEventListener("hashchange",()=>{if(location.hash.startsWith("#banker")||!B.token)route()});
sb.auth.onAuthStateChange((ev)=>{if(ev==="PASSWORD_RECOVERY"){const pw=prompt("Choose a new password (8+ characters):");if(pw)sb.auth.updateUser({password:pw}).then(({error})=>toast(error?errMsg(error):"Password updated"))}});
route();
