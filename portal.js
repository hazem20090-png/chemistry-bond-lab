const SUPABASE_URL='https://ecgrqmuxfvyfjgulwcpr.supabase.co';
const SUPABASE_KEY='sb_publishable_oYrpn_n2AIMU-WVcE9sG9g_qgH0Xfsa';
const TOKEN_KEY='chem-student-session';
const app=document.querySelector('.app');
const teacherButton=document.getElementById('teacherBtn');
if(teacherButton)teacherButton.remove();
app?.classList.add('portalWaiting');

const overlay=document.createElement('div');
overlay.id='studentGate';
overlay.className='studentGate';
overlay.innerHTML=`
  <section class="loginCard" aria-labelledby="loginTitle">
    <div class="loginAtom" aria-hidden="true">⚛</div>
    <span class="loginEyebrow">NEIMA CHEMISTRY LAB</span>
    <h2 id="loginTitle">دخول الطالب</h2>
    <p>اكتب رقم ESE لفتح صفك ودروسك وحفظ تقدّمك تلقائيًا.</p>
    <label for="eseLogin">رقم ESE</label>
    <input id="eseLogin" type="text" inputmode="text" autocomplete="off" maxlength="20" placeholder="ESE Number">
    <button id="eseLoginBtn" type="button">دخول المنصة</button>
    <div id="loginFeedback" class="loginFeedback" role="status"></div>
    <small>Student login • No download required</small>
  </section>`;
document.body.appendChild(overlay);

async function rpc(name,payload){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:JSON.stringify(payload)
  });
  if(!response.ok)throw new Error('network');
  return response.json();
}
function setFeedback(message,bad=false){
  const box=document.getElementById('loginFeedback');
  box.textContent=message;
  box.classList.toggle('bad',bad);
}
function wantedGrade(classCode){
  if(classCode.startsWith('10'))return 10;
  if(classCode.startsWith('11'))return 11;
  return 12;
}
function sameLessons(a,b){
  return [...a].sort().join(',')===[...b].sort().join(',');
}
async function recordStart(token,lessonId){
  try{await rpc('record_progress',{p_token:token,p_lesson_id:lessonId,p_status:'started',p_score:null,p_max_score:null,p_time_spent_seconds:0})}catch(e){}
}
function activatePortal(data,token){
  const current=(new URLSearchParams(location.search).get('open')||'').split(',').filter(Boolean);
  const allowed=data.openLessons||[];
  if(!sameLessons(current,allowed)){
    const url=new URL(location.href);
    url.searchParams.set('open',allowed.join(','));
    location.replace(url.toString());
    return;
  }
  overlay.remove();
  app?.classList.remove('portalWaiting');
  const grade=wantedGrade(data.student.classCode);
  requestAnimationFrame(()=>{
    document.querySelectorAll('.gradeBtn').forEach(btn=>{
      const own=Number(btn.dataset.grade)===grade;
      btn.hidden=!own;
      if(own)btn.click();
    });
  });
  const chip=document.createElement('div');
  chip.className='studentChip';
  chip.innerHTML=`<span><b>${escapeHtml(data.student.name)}</b><small>${escapeHtml(data.student.classCode)}</small></span><button type="button" id="studentLogout">خروج</button>`;
  document.querySelector('.topActions')?.prepend(chip);
  document.getElementById('studentLogout').onclick=()=>{
    localStorage.removeItem(TOKEN_KEY);
    const url=new URL(location.href);url.searchParams.delete('open');location.replace(url.toString());
  };
  document.getElementById('catalog')?.addEventListener('click',event=>{
    const card=event.target.closest('[data-lesson]');
    if(card&&card.classList.contains('open'))recordStart(token,card.dataset.lesson);
  },true);
}
async function resume(){
  const token=localStorage.getItem(TOKEN_KEY);
  if(!token){app?.classList.remove('portalWaiting');return}
  setFeedback('جارٍ استعادة جلستك…');
  try{
    const data=await rpc('student_portal',{p_token:token});
    if(data.ok){activatePortal(data,token);return}
  }catch(e){}
  localStorage.removeItem(TOKEN_KEY);
  app?.classList.remove('portalWaiting');
  setFeedback('انتهت الجلسة. أدخل رقم ESE مجددًا.',true);
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
async function login(){
  const input=document.getElementById('eseLogin');
  const button=document.getElementById('eseLoginBtn');
  const ese=input.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(ese)){setFeedback('اكتب رقم ESE بصورة صحيحة.',true);return}
  button.disabled=true;setFeedback('جارٍ التحقق…');
  try{
    const data=await rpc('student_login',{p_ese:ese});
    if(!data.ok){setFeedback('رقم ESE غير موجود في قائمة الصفوف.',true);button.disabled=false;return}
    localStorage.setItem(TOKEN_KEY,data.token);
    const portal=await rpc('student_portal',{p_token:data.token});
    if(!portal.ok)throw new Error('session');
    activatePortal(portal,data.token);
  }catch(e){
    setFeedback('تعذر الاتصال الآن. حاول مرة أخرى.',true);
    button.disabled=false;
  }
}
document.getElementById('eseLoginBtn').onclick=login;
document.getElementById('eseLogin').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
resume();
