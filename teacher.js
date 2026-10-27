import { curriculum, gradeMeta } from './curriculum.js?v=1';
const SUPABASE_URL='https://ecgrqmuxfvyfjgulwcpr.supabase.co';
const SUPABASE_KEY='sb_publishable_oYrpn_n2AIMU-WVcE9sG9g_qgH0Xfsa';
const TOKEN_KEY='chem-teacher-session';
let lang='ar',token=localStorage.getItem(TOKEN_KEY)||'',dashboardData={students:[],lessons:[]};

const $=id=>document.getElementById(id);
const USE_AZURE_PROXY=location.hostname.endsWith('.azurestaticapps.net');
async function rpc(name,payload){
  const response=await fetch(USE_AZURE_PROXY?'/api/rpc/'+encodeURIComponent(name):SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:USE_AZURE_PROXY?{'Content-Type':'application/json'}:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  if(!response.ok)throw new Error('network');
  return response.json();
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setMessage(text,bad=false){$('loginMessage').textContent=text;$('loginMessage').classList.toggle('bad',bad)}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800)}
function applyLang(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-ar]').forEach(el=>el.textContent=el.dataset[lang]);
  $('langBtn').textContent=lang==='ar'?'English':'العربية';
  $('studentSearch').placeholder=lang==='ar'?'ابحث بالاسم...':'Search by name...';
  renderLessons();renderStudents();
}
function showLogin(msg=''){
  $('loginView').classList.remove('hidden');$('dashboard').classList.add('hidden');$('refreshBtn').classList.add('hidden');$('logoutBtn').classList.add('hidden');
  if(msg)setMessage(msg,true);
}
function showDashboard(){
  $('loginView').classList.add('hidden');$('dashboard').classList.remove('hidden');$('refreshBtn').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');
  renderLessons();populateClasses();renderStudents();
}
async function login(){
  const code=$('teacherCode').value;
  if(code.length<6){setMessage(lang==='ar'?'أدخل رمز المعلم.':'Enter the teacher code.',true);return}
  $('loginBtn').disabled=true;setMessage(lang==='ar'?'جارٍ التحقق…':'Checking…');
  try{
    const data=await rpc('teacher_login',{p_code:code});
    if(!data.ok){setMessage(lang==='ar'?'الرمز غير صحيح.':'Incorrect code.',true);return}
    token=data.token;localStorage.setItem(TOKEN_KEY,token);$('teacherCode').value='';await loadDashboard();showDashboard();
  }catch(e){setMessage(lang==='ar'?'تعذر الاتصال بقاعدة البيانات.':'Could not connect to the database.',true)}
  finally{$('loginBtn').disabled=false}
}
async function loadDashboard(){
  const data=await rpc('teacher_dashboard',{p_token:token});
  if(!data.ok){localStorage.removeItem(TOKEN_KEY);token='';showLogin(lang==='ar'?'انتهت الجلسة. أدخل الرمز مجددًا.':'Session expired. Sign in again.');return}
  dashboardData=data;updateStats();renderLessons();populateClasses();renderStudents();
}
function updateStats(){
  const students=dashboardData.students||[],progress=students.flatMap(s=>s.progress||[]);
  $('studentCount').textContent=students.length;
  $('activeCount').textContent=students.filter(s=>s.lastSeenAt).length;
  $('openCount').textContent=(dashboardData.lessons||[]).filter(x=>x.isOpen).length;
  $('progressCount').textContent=progress.length;
}
function lessonIsOpen(id){const row=(dashboardData.lessons||[]).find(x=>x.lessonId===id);return !!row?.isOpen}
function renderLessons(){
  if(!$('lessonGroups')||$('dashboard').classList.contains('hidden'))return;
  $('lessonGroups').innerHTML=[10,11,12].map(grade=>{
    const items=curriculum.filter(x=>x.grade===grade).map(x=>`<div class="lessonRow"><span><b>${esc(x.title[lang])}</b><small>${esc(x.unit)} • ${esc(x.weeks)}</small></span><label class="switch"><input type="checkbox" data-lesson="${esc(x.id)}" ${lessonIsOpen(x.id)?'checked':''}><span class="slider"></span></label></div>`).join('');
    return `<div class="gradeGroup"><h4 class="gradeTitle"><i></i>${esc(gradeMeta[grade][lang])}</h4><div class="lessonGrid">${items}</div></div>`;
  }).join('');
  document.querySelectorAll('[data-lesson]').forEach(input=>input.onchange=async()=>{
    const desired=input.checked;input.disabled=true;
    try{
      const result=await rpc('teacher_set_lesson_access',{p_token:token,p_lesson_id:input.dataset.lesson,p_open:desired});
      if(!result.ok)throw new Error('session');
      const found=(dashboardData.lessons||[]).find(x=>x.lessonId===input.dataset.lesson);
      if(found)found.isOpen=desired;else dashboardData.lessons.push({lessonId:input.dataset.lesson,isOpen:desired});
      updateStats();toast(lang==='ar'?(desired?'تم فتح الدرس':'تم قفل الدرس'):(desired?'Lesson opened':'Lesson locked'));
    }catch(e){input.checked=!desired;toast(lang==='ar'?'لم يُحفظ التغيير':'Change was not saved')}
    finally{input.disabled=false}
  });
}
function populateClasses(){
  const select=$('classFilter'),current=select.value;
  const classes=[...new Set((dashboardData.students||[]).map(s=>s.classCode))].sort();
  select.innerHTML='<option value="">'+(lang==='ar'?'كل الصفوف':'All classes')+'</option>'+classes.map(c=>'<option>'+esc(c)+'</option>').join('');
  select.value=current;
}
function fmtDate(value){
  if(!value)return '<span class="never">'+(lang==='ar'?'لم يدخل بعد':'Not joined yet')+'</span>';
  return new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}
function latestScore(progress){
  const scored=(progress||[]).filter(p=>p.score!==null&&p.score!==undefined);
  if(!scored.length)return '<span class="never">—</span>';
  const p=scored[0];return esc(p.score)+(p.max_score!=null?' / '+esc(p.max_score):'');
}
function renderStudents(){
  if(!$('studentRows')||$('dashboard').classList.contains('hidden'))return;
  const q=$('studentSearch').value.trim().toLocaleLowerCase(),cls=$('classFilter').value;
  const rows=(dashboardData.students||[]).filter(s=>(!cls||s.classCode===cls)&&(!q||s.name.toLocaleLowerCase().includes(q)));
  $('studentRows').innerHTML=rows.map(s=>`<tr><td class="studentName">${esc(s.name)}</td><td><span class="classPill">${esc(s.classCode)}</span></td><td>${fmtDate(s.lastSeenAt)}</td><td><span class="countPill">${(s.progress||[]).length}</span></td><td>${latestScore(s.progress)}</td></tr>`).join('');
  $('emptyState').classList.toggle('hidden',rows.length>0);
}
function exportCsv(){
  const headers=['Student','Class','Last visit','Progress records','Latest score'];
  const lines=[headers,...(dashboardData.students||[]).map(s=>[s.name,s.classCode,s.lastSeenAt||'',(s.progress||[]).length,(s.progress||[]).find(p=>p.score!=null)?.score??''])];
  const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='chemistry-student-progress.csv';a.click();URL.revokeObjectURL(a.href);
}
$('loginBtn').onclick=login;$('teacherCode').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('showCode').onclick=()=>{$('teacherCode').type=$('teacherCode').type==='password'?'text':'password'};
$('langBtn').onclick=()=>{lang=lang==='ar'?'en':'ar';applyLang()};
$('refreshBtn').onclick=async()=>{try{await loadDashboard();toast(lang==='ar'?'تم التحديث':'Updated')}catch(e){toast(lang==='ar'?'تعذر التحديث':'Refresh failed')}};
$('logoutBtn').onclick=()=>{localStorage.removeItem(TOKEN_KEY);token='';showLogin()};
$('studentSearch').oninput=renderStudents;$('classFilter').onchange=renderStudents;$('exportBtn').onclick=exportCsv;
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$('lessonsView').classList.toggle('hidden',btn.dataset.view!=='lessons');$('studentsView').classList.toggle('hidden',btn.dataset.view!=='students')});
(async()=>{applyLang();if(token){try{await loadDashboard();if(token)showDashboard()}catch(e){showLogin()}}else showLogin()})();