import { curriculum, gradeMeta } from './curriculum.js?v=1';
const SUPABASE_URL='https://ecgrqmuxfvyfjgulwcpr.supabase.co';
const SUPABASE_KEY='sb_publishable_oYrpn_n2AIMU-WVcE9sG9g_qgH0Xfsa';
const TOKEN_KEY='chem-teacher-session';
let lang='ar',token=localStorage.getItem(TOKEN_KEY)||'',dashboardData={students:[],lessons:[],workshop:{roster:[],attendees:[]}};

const $=id=>document.getElementById(id);
const USE_AZURE_PROXY=location.hostname.endsWith('.azurestaticapps.net')||location.hostname==='localhost'||location.hostname==='127.0.0.1'||/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);
function asciiJson(value){return JSON.stringify(value).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))}
async function rpc(name,payload){
  const response=await fetch(USE_AZURE_PROXY?'/api/rpc/'+encodeURIComponent(name):SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:USE_AZURE_PROXY?{'Content-Type':'application/json'}:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:asciiJson(payload),
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
  renderLessons();renderStudents();renderWorkshop();
}
function showLogin(msg=''){
  $('loginView').classList.remove('hidden');$('dashboard').classList.add('hidden');$('refreshBtn').classList.add('hidden');$('logoutBtn').classList.add('hidden');
  if(msg)setMessage(msg,true);
}
function showDashboard(){
  $('loginView').classList.add('hidden');$('dashboard').classList.remove('hidden');$('refreshBtn').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');
  renderLessons();populateClasses();renderStudents();renderWorkshop();
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
  dashboardData=data;
  try{
    const workshopData=await rpc('teacher_workshop_dashboard',{p_token:token});
    dashboardData.workshop=workshopData.ok?workshopData.workshop:{roster:[],attendees:[]};
  }catch(e){dashboardData.workshop={roster:[],attendees:[]}}
  updateStats();renderLessons();populateClasses();renderStudents();renderWorkshop();
}
function updateStats(){
  const students=dashboardData.students||[],progress=students.flatMap(s=>s.progress||[]);
  $('studentCount').textContent=students.length;
  $('activeCount').textContent=students.filter(s=>s.lastSeenAt).length;
  $('openCount').textContent=(dashboardData.lessons||[]).filter(x=>x.isOpen).length;
  $('progressCount').textContent=progress.length;
  $('workshopCount').textContent=(dashboardData.workshop?.attendees||[]).length;
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
  const p=[...scored].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0];return esc(p.score)+(p.max_score!=null?' / '+esc(p.max_score):'');
}
function lessonTitle(id){const x=curriculum.find(v=>v.id===id);return x?x.title[lang]:id}
function performance(student){
  if(!student.lastSeenAt)return{key:'none',label:lang==='ar'?'لم يدخل':'Not joined',average:null};
  const progress=student.progress||[],scored=progress.filter(p=>Number(p.maxScore??p.max_score)>0),completed=progress.filter(p=>p.status==='completed');
  const average=scored.length?Math.round(scored.reduce((n,p)=>n+(Number(p.score)||0)/Number(p.maxScore??p.max_score)*100,0)/scored.length):0;
  if(completed.length&&average>=80)return{key:'strong',label:lang==='ar'?'مكتمل':'Completed',average};
  if(progress.length&&average>=50)return{key:'medium',label:lang==='ar'?'متوسط':'Average',average};
  return{key:'weak',label:lang==='ar'?'ضعيف — يحتاج دعماً':'Needs support',average};
}
function renderStudents(){
  if(!$('studentRows')||$('dashboard').classList.contains('hidden'))return;
  const q=$('studentSearch').value.trim().toLocaleLowerCase(),cls=$('classFilter').value;
  const rows=(dashboardData.students||[]).filter(s=>(!cls||s.classCode===cls)&&(!q||s.name.toLocaleLowerCase().includes(q))).sort((a,b)=>{
    if(a.lastSeenAt&&!b.lastSeenAt)return-1;if(!a.lastSeenAt&&b.lastSeenAt)return 1;
    return new Date(b.lastSeenAt||0)-new Date(a.lastSeenAt||0)||a.name.localeCompare(b.name);
  });
  $('studentRows').innerHTML=rows.map(s=>{const p=performance(s);return `<tr class="studentRow performance-${p.key}" data-student="${esc(s.id)}"><td class="studentName"><strong><i class="performanceDot"></i>${esc(s.name)}</strong><small>${esc(p.label)}${p.average!==null?' · '+p.average+'%':''} · ⭐ ${Number(s.rewardCount)||0}</small></td><td><span class="classPill">${esc(s.classCode)}</span></td><td>${fmtDate(s.lastSeenAt)}</td><td><span class="countPill">${(s.progress||[]).length}</span></td><td>${latestScore(s.progress)}</td></tr>`}).join('');
  document.querySelectorAll('[data-student]').forEach(row=>row.onclick=()=>openStudentDetail(row.dataset.student));
  $('emptyState').classList.toggle('hidden',rows.length>0);
}
function nameKey(value){return String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase()}
function renderWorkshop(){
  if(!$('workshopRows')||$('dashboard').classList.contains('hidden'))return;
  const workshop=dashboardData.workshop||{roster:[],attendees:[]},roster=workshop.roster||[],attendees=workshop.attendees||[];
  const byName=new Map(attendees.map(item=>[nameKey(item.name),item]));
  const rosterKeys=new Set(roster.map(nameKey));
  const rows=roster.map(name=>({name,record:byName.get(nameKey(name))||null,guest:false}));
  attendees.filter(item=>!rosterKeys.has(nameKey(item.name))).forEach(item=>rows.push({name:item.name,record:item,guest:roster.length>0}));
  rows.sort((a,b)=>{if(a.record&&!b.record)return-1;if(!a.record&&b.record)return 1;return new Date(b.record?.lastSeenAt||0)-new Date(a.record?.lastSeenAt||0)||a.name.localeCompare(b.name)});
  const joined=roster.length?roster.filter(name=>byName.has(nameKey(name))).length:attendees.length;
  $('workshopJoined').textContent=joined;
  $('workshopMissing').textContent=roster.length-joined;
  $('workshopGuests').textContent=attendees.filter(item=>!rosterKeys.has(nameKey(item.name))).length;
  if(document.activeElement!==$('workshopRoster'))$('workshopRoster').value=roster.join('\n');
  $('workshopRows').innerHTML=rows.map(row=>{
    const status=row.record?(row.guest?'guest':'joined'):'missing';
    const label=status==='joined'?(lang==='ar'?'دخل':'Joined'):status==='guest'?(lang==='ar'?'دخل — غير موجود بالقائمة':'Joined — not on list'):(lang==='ar'?'لم يدخل':'Not joined');
    const attempts=row.record?.progress||[],latest=[...attempts].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0],summary=row.record?`<small>${latest?`${latest.score} / ${latest.maxScore}`:(lang==='ar'?'لم يُكمل الاختبار':'Quiz not completed')} · ⭐ ${(row.record.rewards||[]).length}</small>`:'';
    return `<tr class="workshopTeacherRow ${row.record?'joined':''}" ${row.record?`data-workshop-teacher="${esc(row.record.id)}"`:''}><td><strong>${esc(row.name)}</strong>${summary}</td><td><span class="attendanceStatus ${status}">● ${esc(label)}</span></td><td>${row.record?fmtDate(row.record.firstJoinedAt):'—'}</td><td>${row.record?fmtDate(row.record.lastSeenAt):'—'}</td><td>${row.record?esc(row.record.visits||1):'—'}</td></tr>`;
  }).join('');
  document.querySelectorAll('[data-workshop-teacher]').forEach(row=>row.onclick=()=>openWorkshopDetail(row.dataset.workshopTeacher));
  $('workshopEmpty').classList.toggle('hidden',rows.length>0);
}
function openWorkshopDetail(id){
  const attendee=(dashboardData.workshop?.attendees||[]).find(item=>item.id===id);if(!attendee)return;
  const attempts=[...(attendee.progress||[])].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)),latest=attempts[0],max=Number(latest?.maxScore)||0,percent=max?Math.round(Number(latest.score||0)/max*100):null;
  $('workshopDetailName').textContent=attendee.name;
  $('workshopDetailMeta').textContent=(lang==='ar'?'أول دخول: ':'First joined: ')+new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(attendee.firstJoinedAt));
  $('workshopDetailStars').textContent='⭐ '+(attendee.rewards||[]).length;
  $('workshopDetailPerformance').className='performanceSummary '+(percent===null?'performance-none':percent>=80?'performance-strong':percent>=50?'performance-medium':'performance-weak');
  $('workshopDetailPerformance').textContent=percent===null?(lang==='ar'?'لم يُكمل اختبار الدرس بعد.':'The lesson quiz has not been completed yet.'):(lang==='ar'?'أحدث نتيجة: ':'Latest score: ')+latest.score+' / '+latest.maxScore+' · '+percent+'%';
  $('workshopDetailLessons').innerHTML=attempts.length?attempts.map((attempt,index)=>`<article class="lessonAttempt"><div class="attemptHead"><h3>${lang==='ar'?'محاولة الرابطة التساهمية':'Covalent-bond attempt'} ${attempts.length-index}</h3><span>${attempt.score} / ${attempt.maxScore}</span></div><small>${fmtDate(attempt.updatedAt)} · ${Math.max(0,Number(attempt.timeSpentSeconds)||0)} ${lang==='ar'?'ثانية':'sec'}</small>${(attempt.answers||[]).length?`<div class="answerReview">${attempt.answers.map((answer,i)=>`<article class="${answer.isCorrect?'':'wrong'}"><b>${answer.isCorrect?'✓':'✕'} ${i+1}. ${esc(answer.question)}</b><small>${lang==='ar'?'إجابة المعلم':'Teacher answer'}: ${esc(answer.selectedAnswer||'—')}<br>${answer.isCorrect?'':(lang==='ar'?'الإجابة الصحيحة':'Correct answer')+': '+esc(answer.correctAnswer||'—')}</small></article>`).join('')}</div>`:`<p class="noDetails">${lang==='ar'?'لا توجد تفاصيل أسئلة لهذه المحاولة.':'No question details are available for this attempt.'}</p>`}</article>`).join(''):`<p class="noDetails">${lang==='ar'?'دخل المعلم، لكنه لم يُكمل الاختبار بعد.':'The teacher joined but has not completed the quiz yet.'}</p>`;
  const rewards=attendee.rewards||[];$('workshopRewardHistory').innerHTML=`<h3>${lang==='ar'?'سجل النجوم':'Star history'} (${rewards.length})</h3><div class="rewardLog">${rewards.length?rewards.slice().reverse().map(reward=>`<span>⭐ ${fmtDate(reward.awardedAt)}</span>`).join(''):`<span>${lang==='ar'?'لا توجد نجوم بعد':'No stars yet'}</span>`}</div>`;
  $('awardWorkshopStar').textContent=lang==='ar'?'⭐ إرسال نجمة تقدير':'⭐ Send a star';
  $('awardWorkshopStar').onclick=async()=>{const button=$('awardWorkshopStar');button.disabled=true;try{const result=await rpc('teacher_award_workshop_star',{p_token:token,p_attendee_id:attendee.id});if(!result.ok)throw new Error(result.message);await loadDashboard();openWorkshopDetail(attendee.id);toast(lang==='ar'?'تم إرسال النجمة للمعلم ⭐':'Star sent to the teacher ⭐')}catch(e){toast(lang==='ar'?'تعذر إرسال النجمة':'Could not send the star')}finally{button.disabled=false}};
  $('workshopDetail').classList.remove('hidden');
}
async function saveWorkshopRoster(){
  const button=$('saveWorkshopRoster');
  const names=$('workshopRoster').value.split(/\r?\n/).map(value=>value.replace(/\s+/g,' ').trim()).filter(Boolean);
  button.disabled=true;
  try{
    const result=await rpc('teacher_set_workshop_roster',{p_token:token,p_names:names});
    if(!result.ok)throw new Error(result.message||'save');
    dashboardData.workshop=result.workshop||{roster:names,attendees:[]};updateStats();renderWorkshop();
    toast(lang==='ar'?'تم حفظ قائمة المعلمين':'Teacher list saved');
  }catch(e){toast(lang==='ar'?'تعذر حفظ القائمة':'Could not save the list')}
  finally{button.disabled=false}
}
async function copyWorkshopLink(){
  const link=new URL('teachers.html?open=g10-covalent',location.href).href;
  try{await navigator.clipboard.writeText(link);toast(lang==='ar'?'تم نسخ رابط المعلمين':'Teacher link copied')}
  catch(e){window.prompt(lang==='ar'?'انسخ هذا الرابط:':'Copy this link:',link)}
}
function openStudentDetail(id){
  const s=(dashboardData.students||[]).find(x=>x.id===id);if(!s)return;const p=performance(s);
  $('detailName').textContent=s.name;$('detailMeta').textContent=s.classCode+' · '+(lang==='ar'?'آخر دخول: ':'Last visit: ')+(s.lastSeenAt?new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s.lastSeenAt)):(lang==='ar'?'لم يدخل':'Not joined'));
  $('detailStars').textContent='⭐ '+(Number(s.rewardCount)||0);$('detailPerformance').className='performanceSummary performance-'+p.key;$('detailPerformance').textContent=(lang==='ar'?'الأداء: ':'Performance: ')+p.label+(p.average!==null?' · '+p.average+'%':'');
  const records=[...(s.progress||[])].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  $('detailLessons').innerHTML=records.length?records.map(r=>{const max=r.maxScore??r.max_score,answers=r.answers||[];return `<article class="lessonAttempt"><div class="attemptHead"><h3>${esc(lessonTitle(r.lessonId))}</h3><span>${r.score??'-'} / ${max??'-'}</span></div>${answers.length?`<div class="answerReview">${answers.map((a,i)=>`<article class="${a.isCorrect?'':'wrong'}"><b>${a.isCorrect?'✓':'✕'} ${i+1}. ${esc(a.question)}</b><small>${lang==='ar'?'إجابة الطالب':'Student answer'}: ${esc(a.selectedAnswer||'-')}<br>${a.isCorrect?'':(lang==='ar'?'الإجابة الصحيحة':'Correct answer')+': '+esc(a.correctAnswer||'-')}</small></article>`).join('')}</div>`:`<p class="noDetails">${lang==='ar'?'هذه محاولة قديمة؛ تفاصيل الأسئلة ستظهر في المحاولات الجديدة.':'This is an older attempt; answer details will appear for new attempts.'}</p>`}${r.status==='completed'?`<button class="awardBtn" data-award="${esc(r.lessonId)}">⭐ ${lang==='ar'?'إرسال نجمة مكافأة':'Send reward star'}</button>`:''}</article>`}).join(''):`<p class="noDetails">${lang==='ar'?'لم يبدأ الطالب أي درس بعد.':'The student has not started a lesson yet.'}</p>`;
  const rewards=s.rewards||[];$('rewardHistory').innerHTML=`<h3>${lang==='ar'?'سجل المكافآت':'Reward history'} (${rewards.length})</h3><div class="rewardLog">${rewards.length?rewards.slice().reverse().map(r=>`<span>⭐ ${esc(lessonTitle(r.lessonId))} · ${fmtDate(r.awardedAt)}</span>`).join(''):`<span>${lang==='ar'?'لا توجد مكافآت بعد':'No rewards yet'}</span>`}</div>`;
  document.querySelectorAll('[data-award]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{const result=await rpc('teacher_award_star',{p_token:token,p_student_id:s.id,p_lesson_id:btn.dataset.award});if(!result.ok)throw new Error(result.message);await loadDashboard();openStudentDetail(s.id);toast(lang==='ar'?'تم إرسال النجمة للطالب ⭐':'Star sent to student ⭐')}catch(e){toast(lang==='ar'?'تعذر إرسال النجمة':'Could not send the star')}finally{btn.disabled=false}});
  $('studentDetail').classList.remove('hidden');
}
function exportCsv(){
  const headers=['Student','Class','Last visit','Performance','Average %','Progress records','Latest score','Reward stars'];
  const lines=[headers,...(dashboardData.students||[]).sort((a,b)=>new Date(b.lastSeenAt||0)-new Date(a.lastSeenAt||0)).map(s=>{const p=performance(s);return[s.name,s.classCode,s.lastSeenAt||'',p.label,p.average??'',(s.progress||[]).length,(s.progress||[]).find(p=>p.score!=null)?.score??'',s.rewardCount||0]})];
  const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='chemistry-student-progress.csv';a.click();URL.revokeObjectURL(a.href);
}
$('loginBtn').onclick=login;$('teacherCode').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('showCode').onclick=()=>{$('teacherCode').type=$('teacherCode').type==='password'?'text':'password'};
$('langBtn').onclick=()=>{lang=lang==='ar'?'en':'ar';applyLang()};
$('refreshBtn').onclick=async()=>{try{await loadDashboard();toast(lang==='ar'?'تم التحديث':'Updated')}catch(e){toast(lang==='ar'?'تعذر التحديث':'Refresh failed')}};
$('logoutBtn').onclick=()=>{localStorage.removeItem(TOKEN_KEY);token='';showLogin()};
$('studentSearch').oninput=renderStudents;$('classFilter').onchange=renderStudents;$('exportBtn').onclick=exportCsv;
$('saveWorkshopRoster').onclick=saveWorkshopRoster;$('copyWorkshopLink').onclick=copyWorkshopLink;
$('closeDetail').onclick=()=>$('studentDetail').classList.add('hidden');$('studentDetail').onclick=e=>{if(e.target===$('studentDetail'))$('studentDetail').classList.add('hidden')};
$('closeWorkshopDetail').onclick=()=>$('workshopDetail').classList.add('hidden');$('workshopDetail').onclick=e=>{if(e.target===$('workshopDetail'))$('workshopDetail').classList.add('hidden')};
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$('lessonsView').classList.toggle('hidden',btn.dataset.view!=='lessons');$('studentsView').classList.toggle('hidden',btn.dataset.view!=='students');$('workshopView').classList.toggle('hidden',btn.dataset.view!=='workshop');if(btn.dataset.view==='workshop')renderWorkshop()});
(async()=>{applyLang();if(token){try{await loadDashboard();if(token)showDashboard()}catch(e){showLogin()}}else showLogin()})();
