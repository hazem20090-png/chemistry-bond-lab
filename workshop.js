const app=document.querySelector('.app');
const teacherButton=document.getElementById('teacherBtn');
if(teacherButton)teacherButton.remove();

const wantedLesson='g10-covalent';
const url=new URL(location.href);
if(url.searchParams.get('open')!==wantedLesson){
  url.searchParams.set('open',wantedLesson);
  location.replace(url.toString());
}

const overlay=document.createElement('div');
overlay.id='workshopGate';
overlay.className='studentGate workshopGate';
overlay.innerHTML=`
  <section class="loginCard" aria-labelledby="workshopTitle">
    <div class="loginAtom" aria-hidden="true">⚛</div>
    <span class="loginEyebrow">TEACHER INTERACTIVE WORKSHOP</span>
    <h2 id="workshopTitle">تجربة المعلمين</h2>
    <p>اكتب اسمك لتسجيل الحضور ثم ابدأ تجربة الرابطة التساهمية بيدك.</p>
    <label for="workshopName">اسم المعلم</label>
    <input id="workshopName" type="text" autocomplete="name" maxlength="80" placeholder="اكتب الاسم الكامل">
    <button id="workshopJoinBtn" type="button">تسجيل الحضور وبدء التجربة</button>
    <div id="workshopFeedback" class="loginFeedback" role="status"></div>
    <small>لا يحتاج إلى رقم ESE • Teacher workshop</small>
  </section>`;
document.body.appendChild(overlay);

const savedName=localStorage.getItem('chem-workshop-teacher-name')||'';
const SESSION_KEY='chem-workshop-session';
const SUPABASE_URL='https://ecgrqmuxfvyfjgulwcpr.supabase.co';
const SUPABASE_KEY='sb_publishable_oYrpn_n2AIMU-WVcE9sG9g_qgH0Xfsa';
const USE_API_PROXY=location.hostname.endsWith('.azurestaticapps.net')||location.hostname==='localhost'||location.hostname==='127.0.0.1'||/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);
document.getElementById('workshopName').value=savedName;

function asciiJson(value){return JSON.stringify(value).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))}
async function rpc(name,payload){
  const response=await fetch(USE_API_PROXY?'/api/rpc/'+encodeURIComponent(name):SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',headers:USE_API_PROXY?{'Content-Type':'application/json'}:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:asciiJson(payload),cache:'no-store'});
  if(!response.ok)throw new Error('network');
  return response.json();
}
function feedback(message,bad=false){
  const box=document.getElementById('workshopFeedback');box.textContent=message;box.classList.toggle('bad',bad);
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function showReward(name,count){
  const celebration=document.createElement('div');celebration.className='rewardCelebration';celebration.innerHTML=`<section><div class="bigStar">⭐</div><h2>أحسنت يا ${escapeHtml(name)}!</h2><p>أرسل لك أستاذ حازم نجمة تقدير جديدة.</p><b>${count} ⭐</b><button type="button">شكرًا</button></section>`;document.body.appendChild(celebration);celebration.querySelector('button').onclick=()=>celebration.remove();
}
function openCovalent(name,rewardCount=0){
  overlay.remove();app?.classList.remove('portalWaiting');
  const chip=document.createElement('div');chip.className='studentChip workshopChip';chip.innerHTML=`<span><b>${escapeHtml(name)}</b><small>تجربة المعلمين</small><em class="workshopReward">⭐ ${Number(rewardCount)||0}</em></span>`;document.querySelector('.topActions')?.prepend(chip);
  let lastReward=Number(rewardCount)||0;
  setInterval(async()=>{try{const data=await rpc('workshop_teacher_portal',{p_token:localStorage.getItem(SESSION_KEY)});if(!data.ok)return;const count=Number(data.rewardCount)||0;chip.querySelector('.workshopReward').textContent='⭐ '+count;if(count>lastReward)showReward(name,count);lastReward=count}catch(e){}},12000);
  const tryOpen=()=>{
    document.querySelector('.gradeBtn[data-grade="10"]')?.click();
    const card=document.querySelector('.lessonCard[data-lesson="g10-covalent"]');
    if(card){card.click();return true}
    return false;
  };
  if(!tryOpen())setTimeout(tryOpen,120);
}
async function join(){
  const input=document.getElementById('workshopName'),button=document.getElementById('workshopJoinBtn');
  const name=input.value.replace(/\s+/g,' ').trim();
  if(name.length<2){feedback('اكتب اسمك بصورة صحيحة.',true);return}
  button.disabled=true;feedback('جارٍ تسجيل الحضور…');
  try{
    const data=await rpc('workshop_teacher_join',{p_name:name});
    if(!data.ok)throw new Error(data.message||'invalid');
    localStorage.setItem('chem-workshop-teacher-name',data.teacher.name);
    localStorage.setItem(SESSION_KEY,data.token);
    openCovalent(data.teacher.name,data.rewardCount);
  }catch(e){feedback('تعذر الاتصال بقاعدة البيانات. حاول مرة أخرى.',true);button.disabled=false}
}
document.getElementById('workshopJoinBtn').onclick=join;
document.getElementById('workshopName').addEventListener('keydown',event=>{if(event.key==='Enter')join()});
window.addEventListener('chem:quiz-complete',event=>{const detail=event.detail||{},session=localStorage.getItem(SESSION_KEY);if(!session)return;rpc('workshop_record_progress',{p_token:session,p_lesson_id:detail.lessonId||'g10-covalent',p_score:Number(detail.score)||0,p_max_score:Number(detail.maxScore)||5,p_time_spent_seconds:Number(detail.timeSpentSeconds)||0,p_answers:Array.isArray(detail.answers)?detail.answers:[]}).catch(()=>{})});
