import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const LESSON_ID='g10-quantum';
const HC_EV_NM=1239.841984;
let lang=document.documentElement.lang==='en'?'en':'ar';
let overlay,host,renderer,scene,camera,orbit,atomGroup,electronCloud,photonGroup;
let rings=[],cloudSpecks=[],photonParts=[],currentN=1,targetN=4,lowerN=2;
let running=false,last=performance.now(),transition=null,mission={select:false,excite:false,emit:false,answer:false};

const T={
 ar:{
  eyebrow:'مختبر كمي تفاعلي • الهيدروجين',title:'اقفز بين مستويات الطاقة',subtitle:'أثِر سحابة الإلكترون، ثم دعها تهبط وشاهد الفوتون الناتج.',
  rotate:'اسحب لتدوير النموذج • استخدم العجلة للتقريب',model:'نموذج بوهر تعليمي — الحلقات ليست مسارات حقيقية، والإلكترون ممثل كسحابة احتمالية.',
  upper:'مستوى الإثارة',lower:'مستوى الهبوط',excite:'امتصاص طاقة وإثارة الإلكترون',emit:'إطلاق الفوتون والهبوط',
  energy:'طاقة المستوى',delta:'فرق الطاقة',wave:'الطول الموجي',region:'منطقة الطيف',
  ground:'الحالة الأرضية',excited:'حالة مثارة',waiting:'اختر مستوى أعلى ثم اضغط الإثارة.',
  absorbed:'امتص الإلكترون طاقة وانتقل إلى مستوى أعلى.',emitted:'هبط الإلكترون وأطلق فوتونًا طاقته تساوي فرق المستويين.',
  uv:'فوق بنفسجي',visible:'مرئي',ir:'تحت الأحمر',close:'إغلاق المختبر',reset:'إعادة',
  mission:'مهمتك',steps:['اختر مستوى طاقة أعلى','أثِر سحابة الإلكترون','اخفضها وأنتج فوتونًا','أجب عن سؤال الدليل'],
  q:'عندما يهبط إلكترون الهيدروجين من n=4 إلى n=2، ماذا يحدث؟',
  answers:['يمتص فوتونًا','يطلق فوتونًا','لا تتغير طاقته'],correct:'صحيح — فرق الطاقة خرج على هيئة فوتون.',wrong:'جرّب ثانية: الهبوط يعني أن طاقة الذرة تقل.',
  notScale:'المسافات البصرية غير مرسومة بمقياس n² لتبقى المستويات واضحة.',score:'اكتمل التحدي وسُجل تقدمك.'
 },
 en:{
  eyebrow:'INTERACTIVE QUANTUM LAB • HYDROGEN',title:'Jump between energy levels',subtitle:'Excite the electron cloud, let it fall, and observe the emitted photon.',
  rotate:'Drag to rotate • use the wheel to zoom',model:'Teaching Bohr model — rings are not real paths; the electron is shown as a probability cloud.',
  upper:'Excited level',lower:'Drop to level',excite:'Absorb energy & excite electron',emit:'Emit photon & drop',
  energy:'Level energy',delta:'Energy difference',wave:'Wavelength',region:'Spectral region',
  ground:'Ground state',excited:'Excited state',waiting:'Choose a higher level, then excite the electron.',
  absorbed:'The electron absorbed energy and moved to a higher level.',emitted:'The electron dropped and emitted a photon equal to the level-energy difference.',
  uv:'Ultraviolet',visible:'Visible',ir:'Infrared',close:'Close lab',reset:'Reset',
  mission:'Your mission',steps:['Choose a higher energy level','Excite the electron cloud','Drop it and produce a photon','Answer the evidence question'],
  q:'When a hydrogen electron drops from n=4 to n=2, what happens?',
  answers:['It absorbs a photon','It emits a photon','Its energy does not change'],correct:'Correct — the energy difference leaves as a photon.',wrong:'Try again: a downward transition lowers the atom’s energy.',
  notScale:'Visual distances are not drawn to the n² scale so every level stays clear.',score:'Challenge complete and your progress was recorded.'
 }
};

const tx=k=>T[lang][k];
function energy(n){return -13.6/(n*n)}
function wavelength(upper,lower){return HC_EV_NM/Math.abs(energy(upper)-energy(lower))}
function region(nm){return nm<380?'uv':nm<=750?'visible':'ir'}
function spectralColor(nm){
 if(nm<380)return 0x8b5cff;if(nm>750)return 0xff3a23;
 if(nm<440)return 0x6c42ff;if(nm<490)return 0x2b7fff;if(nm<510)return 0x16d9d2;
 if(nm<580)return 0x4eff72;if(nm<645)return 0xffd23f;return 0xff3f32;
}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function makeOverlay(){
 overlay=document.createElement('div');overlay.id='quantumLabOverlay';overlay.className='qLab hidden';
 overlay.innerHTML=`<section class="qShell" role="dialog" aria-modal="true" aria-labelledby="qTitle">
  <header class="qHead"><div><span class="qEyebrow" id="qEyebrow"></span><h2 id="qTitle"></h2><p id="qSubtitle"></p></div><div class="qHeadBtns"><button id="qLang">English</button><button id="qClose" class="qClose">×</button></div></header>
  <div class="qBody">
   <div class="qViewer"><div class="qViewerTop"><strong id="qState"></strong><span id="qRotate"></span></div><div id="qScene"><div class="qNBadge">n=<b id="qCurrentN">1</b></div><div id="qModelNote" class="qModelNote"></div></div><small id="qScaleNote" class="qScaleNote"></small></div>
   <aside class="qControls">
    <div class="qCard"><label><span id="qUpperLabel"></span><b id="qUpperValue">n = 4</b></label><input id="qUpper" type="range" min="2" max="6" value="4" step="1"><div id="qLevelDots" class="qLevelDots"></div></div>
    <div class="qCard"><label><span id="qLowerLabel"></span></label><div id="qLowerButtons" class="qChoice"></div><div class="qButtonRow"><button id="qExcite" class="qPrimary"></button><button id="qEmit" disabled></button></div><button id="qReset" class="qReset"></button><div id="qFeedback" class="qFeedback"></div></div>
    <div class="qMetrics"><div><span id="qEnergyLabel"></span><b id="qEnergy">−13.60 eV</b></div><div><span id="qDeltaLabel"></span><b id="qDelta">—</b></div><div><span id="qWaveLabel"></span><b id="qWave">—</b></div><div><span id="qRegionLabel"></span><b id="qRegion">—</b></div></div>
    <div class="qCard qMission"><h3 id="qMissionTitle"></h3><div id="qMissionSteps"></div></div>
    <div class="qCard qQuiz"><h3 id="qQuestion"></h3><div id="qAnswers"></div><p id="qQuizFeedback"></p></div>
   </aside>
  </div>
 </section>`;
 document.body.appendChild(overlay);host=overlay.querySelector('#qScene');
 overlay.querySelector('#qClose').onclick=closeLab;
 overlay.querySelector('#qLang').onclick=()=>{lang=lang==='ar'?'en':'ar';renderText()};
 overlay.querySelector('#qUpper').oninput=e=>{targetN=Number(e.target.value);mission.select=true;if(lowerN>=targetN)lowerN=targetN-1;renderControls();updateMission()};
 overlay.querySelector('#qExcite').onclick=excite;
 overlay.querySelector('#qEmit').onclick=emitPhoton;
 overlay.querySelector('#qReset').onclick=resetLab;
 init3D();renderText();resetLab();
}
function init3D(){
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,3.4,13);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;host.prepend(renderer.domElement);
 orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.enablePan=false;orbit.minDistance=7;orbit.maxDistance=19;
 scene.add(new THREE.AmbientLight(0x6ba7dd,1.6));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(5,7,8);scene.add(key);const cyan=new THREE.PointLight(0x20ddff,35,30);cyan.position.set(-7,3,5);scene.add(cyan);
 atomGroup=new THREE.Group();scene.add(atomGroup);
 const nucleus=new THREE.Mesh(new THREE.SphereGeometry(.55,32,24),new THREE.MeshStandardMaterial({color:0xff4165,emissive:0xff214c,emissiveIntensity:1.25,roughness:.25}));atomGroup.add(nucleus);
 const halo=new THREE.Mesh(new THREE.SphereGeometry(1.05,32,20),new THREE.MeshBasicMaterial({color:0xff3159,transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending}));atomGroup.add(halo);
 for(let n=1;n<=6;n++){const ring=new THREE.Mesh(new THREE.TorusGeometry(radiusFor(n),.027,10,150),new THREE.MeshStandardMaterial({color:0x48dfff,emissive:0x1aaeff,emissiveIntensity:.8,transparent:true,opacity:n===1?.8:.26,depthWrite:false,blending:THREE.AdditiveBlending}));ring.rotation.x=(n%2?-.28:.28);ring.rotation.y=n*.24;ring.userData.n=n;atomGroup.add(ring);rings.push(ring)}
 electronCloud=new THREE.Group();atomGroup.add(electronCloud);
 const core=new THREE.Mesh(new THREE.SphereGeometry(.13,22,16),new THREE.MeshBasicMaterial({color:0xffffff}));electronCloud.add(core);
 for(let i=0;i<5;i++){const haze=new THREE.Mesh(new THREE.SphereGeometry(.25+i*.1,22,16),new THREE.MeshBasicMaterial({color:i<2?0xfff36a:0x48dfff,transparent:true,opacity:.13-i*.017,depthWrite:false,blending:THREE.AdditiveBlending}));electronCloud.add(haze)}
 for(let i=0;i<28;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.random()*.025,10,8),new THREE.MeshBasicMaterial({color:i%3?0x58e8ff:0xfff27a,transparent:true,opacity:.8}));const a=Math.random()*Math.PI*2,r=.2+Math.random()*.48;s.position.set(Math.cos(a)*r,(Math.random()-.5)*.45,Math.sin(a)*r);electronCloud.add(s);cloudSpecks.push(s)}
 photonGroup=new THREE.Group();photonGroup.visible=false;scene.add(photonGroup);
 for(let i=0;i<24;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),new THREE.MeshBasicMaterial({color:0x46e6ff,transparent:true,opacity:.9}));photonGroup.add(p);photonParts.push(p)}
 new ResizeObserver(resize).observe(host);resize();placeElectron(1,0);animate();
}
function radiusFor(n){return 1.55+(n-1)*.72}
function placeElectron(n,a=0){const r=radiusFor(n);electronCloud.position.set(Math.cos(a)*r,Math.sin(a*.7)*.35,Math.sin(a)*r)}
function resize(){const w=Math.max(300,host.clientWidth),h=Math.max(320,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
function animate(now=performance.now()){
 requestAnimationFrame(animate);const dt=Math.min(.04,(now-last)/1000);last=now;if(!running)return;
 if(transition){transition.t=Math.min(1,transition.t+dt/transition.duration);const eased=transition.t<.5?2*transition.t*transition.t:1-Math.pow(-2*transition.t+2,2)/2;const rr=THREE.MathUtils.lerp(radiusFor(transition.from),radiusFor(transition.to),eased);const a=now*.0018;electronCloud.position.set(Math.cos(a)*rr,Math.sin(a*1.3)*.35,Math.sin(a)*rr);if(transition.t>=1){currentN=transition.to;transition=null;renderControls()}}else{const a=now*.0012;placeElectron(currentN,a)}
 electronCloud.rotation.y+=dt*.6;electronCloud.scale.setScalar(1+Math.sin(now*.006)*.06);
 rings.forEach((r,i)=>{r.rotation.z+=dt*(i%2?.055:-.04);r.material.opacity=r.userData.n===currentN?.78:.22+Math.sin(now*.001+i)*.04});
 cloudSpecks.forEach((s,i)=>{s.position.y+=Math.sin(now*.003+i)*.0008});
 if(photonGroup.visible){photonGroup.position.x+=dt*2.4;photonParts.forEach((p,i)=>{const x=i*.16;p.position.set(x,Math.sin(now*.01+i*.72)*.25,0)});if(photonGroup.position.x>8)photonGroup.visible=false}
 orbit.update();renderer.render(scene,camera);
}
function renderText(){
 overlay.dir=lang==='ar'?'rtl':'ltr';overlay.querySelector('#qEyebrow').textContent=tx('eyebrow');overlay.querySelector('#qTitle').textContent=tx('title');overlay.querySelector('#qSubtitle').textContent=tx('subtitle');overlay.querySelector('#qRotate').textContent=tx('rotate');overlay.querySelector('#qModelNote').textContent=tx('model');overlay.querySelector('#qScaleNote').textContent=tx('notScale');overlay.querySelector('#qUpperLabel').textContent=tx('upper');overlay.querySelector('#qLowerLabel').textContent=tx('lower');overlay.querySelector('#qExcite').textContent=tx('excite');overlay.querySelector('#qEmit').textContent=tx('emit');overlay.querySelector('#qReset').textContent='↻ '+tx('reset');overlay.querySelector('#qEnergyLabel').textContent=tx('energy');overlay.querySelector('#qDeltaLabel').textContent=tx('delta');overlay.querySelector('#qWaveLabel').textContent=tx('wave');overlay.querySelector('#qRegionLabel').textContent=tx('region');overlay.querySelector('#qMissionTitle').textContent=tx('mission');overlay.querySelector('#qQuestion').textContent=tx('q');overlay.querySelector('#qLang').textContent=lang==='ar'?'English':'العربية';renderQuiz();renderControls();updateMission();
}
function renderControls(){
 if(!overlay)return;overlay.querySelector('#qCurrentN').textContent=currentN;overlay.querySelector('#qUpperValue').textContent='n = '+targetN;overlay.querySelector('#qEnergy').textContent=energy(currentN).toFixed(2)+' eV';overlay.querySelector('#qState').textContent=currentN===1?tx('ground'):tx('excited');
 overlay.querySelector('#qLevelDots').innerHTML=[1,2,3,4,5,6].map(n=>`<span class="${n===targetN?'active':''}">n=${n}<small>${energy(n).toFixed(2)} eV</small></span>`).join('');
 const lowers=[];for(let n=1;n<targetN;n++)lowers.push(n);if(!lowers.includes(lowerN))lowerN=Math.max(1,targetN-1);
 overlay.querySelector('#qLowerButtons').innerHTML=lowers.map(n=>`<button data-lower="${n}" class="${n===lowerN?'active':''}">n = ${n}</button>`).join('');
 overlay.querySelectorAll('[data-lower]').forEach(b=>b.onclick=()=>{lowerN=Number(b.dataset.lower);renderControls()});
 overlay.querySelector('#qExcite').disabled=!!transition||currentN!==1;overlay.querySelector('#qEmit').disabled=!!transition||currentN===1;
 if(currentN>1){const nm=wavelength(currentN,lowerN),reg=region(nm);overlay.querySelector('#qDelta').textContent=Math.abs(energy(currentN)-energy(lowerN)).toFixed(2)+' eV';overlay.querySelector('#qWave').textContent=nm.toFixed(1)+' nm';overlay.querySelector('#qRegion').textContent=tx(reg);overlay.querySelector('#qRegion').style.color='#'+spectralColor(nm).toString(16).padStart(6,'0')}else{overlay.querySelector('#qDelta').textContent='—';overlay.querySelector('#qWave').textContent='—';overlay.querySelector('#qRegion').textContent='—';overlay.querySelector('#qRegion').style.color=''}
}
function excite(){if(currentN!==1||transition)return;transition={from:1,to:targetN,t:0,duration:1.05};mission.excite=true;overlay.querySelector('#qFeedback').textContent=tx('absorbed');overlay.querySelector('#qFeedback').className='qFeedback good';updateMission()}
function emitPhoton(){if(currentN===1||transition)return;const from=currentN,to=lowerN,nm=wavelength(from,to),color=spectralColor(nm);photonParts.forEach(p=>p.material.color.setHex(color));photonGroup.position.set(0,1.4,0);photonGroup.visible=true;transition={from,to,t:0,duration:.85};mission.emit=true;overlay.querySelector('#qFeedback').textContent=tx('emitted')+' '+nm.toFixed(1)+' nm';overlay.querySelector('#qFeedback').className='qFeedback photon';updateMission()}
function updateMission(){overlay.querySelector('#qMissionSteps').innerHTML=tx('steps').map((s,i)=>`<div class="${Object.values(mission)[i]?'done':''}"><i>✓</i><span>${esc(s)}</span></div>`).join('')}
function renderQuiz(){overlay.querySelector('#qAnswers').innerHTML=tx('answers').map((a,i)=>`<button data-qanswer="${i}">${esc(a)}</button>`).join('');overlay.querySelectorAll('[data-qanswer]').forEach(b=>b.onclick=()=>answerQuestion(Number(b.dataset.qanswer)))}
function answerQuestion(i){const f=overlay.querySelector('#qQuizFeedback');if(i===1){mission.answer=true;f.textContent=tx('correct')+' '+tx('score');f.className='good';overlay.querySelectorAll('[data-qanswer]').forEach((b,j)=>{b.disabled=true;if(j===1)b.classList.add('correct')});window.dispatchEvent(new CustomEvent('chem:quiz-complete',{detail:{lessonId:LESSON_ID,score:1,maxScore:1}}));updateMission()}else{f.textContent=tx('wrong');f.className='bad'}}
function resetLab(){currentN=1;targetN=4;lowerN=2;transition=null;mission={select:false,excite:false,emit:false,answer:false};photonGroup.visible=false;overlay.querySelector('#qUpper').value=4;overlay.querySelector('#qFeedback').textContent=tx('waiting');overlay.querySelector('#qFeedback').className='qFeedback';overlay.querySelector('#qQuizFeedback').textContent='';renderQuiz();renderControls();updateMission()}
function openLab(){if(!overlay)makeOverlay();lang=document.documentElement.lang==='en'?'en':'ar';renderText();overlay.classList.remove('hidden');document.body.classList.add('qNoScroll');running=true;resize()}
function closeLab(){overlay.classList.add('hidden');document.body.classList.remove('qNoScroll');running=false}

document.addEventListener('click',e=>{const card=e.target.closest('[data-lesson="'+LESSON_ID+'"]');if(!card||!card.classList.contains('open'))return;e.preventDefault();e.stopImmediatePropagation();openLab()},true);
