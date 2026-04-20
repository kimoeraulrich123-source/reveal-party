(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);

// BG — simplified for perf
const cv=$('#bgCanvas'),cx=cv.getContext('2d');let W,H;
function rsz(){W=cv.width=innerWidth;H=cv.height=innerHeight}addEventListener('resize',rsz);rsz();
const st=Array.from({length:60},()=>({x:Math.random()*2e3,y:Math.random()*1200,s:Math.random()<.1?2:1,t:.2+Math.random()*1,o:Math.random()*6.28}));
function bg(t){cx.fillStyle='#060412';cx.fillRect(0,0,W,H);st.forEach(s=>{cx.fillStyle=`rgba(160,155,200,${.15+.3*Math.sin(t*s.t+s.o)})`;cx.fillRect(s.x%W,s.y%H,s.s,s.s)})}
let bt=0;(function lp(){bt+=.004;bg(bt);requestAnimationFrame(lp)})();

// STATE
const S={pseudo:'',avatar:'',avFile:null,sk:null,sid:null,hid:null,own:false,tracks:[],coverUrl:null,clipUrl:null,clipName:null,tIdx:-1,playing:false,selectedRating:0};
const au=$('#audio'),clipV=$('#clipVideo');

// SESSION PERSISTENCE — check localStorage
const saved=localStorage.getItem('rp_session');
if(saved){
  try{const d=JSON.parse(saved);S.pseudo=d.pseudo||'';S.avatar=d.avatar||''}catch(e){}
}

// ONBOARDING — skip entirely if session exists
if(S.pseudo){
  // Hide onboarding immediately, don't even show it
  $('#onboarding').classList.remove('active');
  conn();
}else{
  function vJ(){$('#btnJoin').disabled=!(S.pseudo.trim().length>=2)}
  $('#pseudo').oninput=e=>{S.pseudo=e.target.value;vJ()};
  $('#avZone').onclick=()=>$('#avInput').click();
  $('#avInput').onchange=e=>{const f=e.target.files[0];if(!f)return;S.avFile=f;const r=new FileReader();r.onload=v=>{S.avatar=v.target.result;$('#avPrev').innerHTML=`<img src="${v.target.result}">`;$('#avZone').classList.add('has')};r.readAsDataURL(f)};
  $('#btnJoin').onclick=async()=>{$('#btnJoin').disabled=true;$('#btnJoin').textContent='⏳';try{let u='';if(S.avFile){const fd=new FormData();fd.append('avatar',S.avFile);u=(await(await fetch('/api/upload-avatar',{method:'POST',body:fd})).json()).url||''}S.avatar=u||S.avatar;localStorage.setItem('rp_session',JSON.stringify({pseudo:S.pseudo,avatar:S.avatar}));conn()}catch(e){console.error(e);$('#btnJoin').disabled=false;$('#btnJoin').textContent='▶ Entrer'}};
}

// SOCKET
function conn(){
const sk=io();S.sk=sk;
sk.on('connect',()=>{S.sid=sk.id;sk.emit('user:join',{pseudo:S.pseudo,avatar:S.avatar})});
sk.on('init',s=>{
  show('hub');rH(s.houses);uOn(Object.keys(s.users).length);
  // Init cursors with their house info
  Object.entries(s.users).forEach(([id,u])=>{if(id!==S.sid)uC(id,u.cx,u.cy,u.pseudo,u.avatar,u.house!==undefined?u.house:null)});
  // Auto-rejoin owned house
  if(s.ownedHouse>=0){
    sk.emit('rejoin',{hid:s.ownedHouse});
  }
});
sk.on('rejoinR',({ok,hid,house,audio,isOwner})=>{
  if(ok)ent(hid,house,isOwner,audio);
});
sk.on('joined',()=>uOn('+'));sk.on('left',({sid})=>{rC(sid);uOn('-')});
sk.on('cur',({sid,x,y,pseudo,avatar,house})=>{uC(sid,x,y,pseudo,avatar,house!==undefined?house:null)});
sk.on('houseChange',({sid,house})=>{curHouses[sid]=house!==undefined?house:null;visCursors()});
sk.on('hup',h=>rH(h));
sk.on('claimR',({ok,msg,hid,house,audio})=>{if(ok){clM();ent(hid,house,true,audio)}else alert(msg)});
sk.on('enterR',({ok,msg,hid,house,audio})=>{if(ok){clM();ent(hid,house,false,audio)}else{const e=document.querySelector('.mo-e');if(e)e.textContent=msg}});
sk.on('tracks',({hid,tracks})=>{if(S.hid===hid){S.tracks=tracks;rMP3();rTL()}});
sk.on('clip',({hid,url,name})=>{if(S.hid===hid){S.clipUrl=url;S.clipName=name;rClip()}});
sk.on('cover',({hid,url})=>{if(S.hid===hid){S.coverUrl=url;rCov();if(S.playing)updCFS()}});
sk.on('aSync',({hid,playing,idx,t,at,intermission})=>{
  if(S.hid!==hid)return;
  if(intermission){return} // handled by interSync
  if(playing&&idx>=0&&idx<S.tracks.length){
    if(S.tIdx!==idx){S.tIdx=idx;au.src=S.tracks[idx].url}
    const el=(Date.now()-at)/1000;const tgt=(t||0)+el;
    if(Math.abs(au.currentTime-tgt)>.5)au.currentTime=tgt;
    au.play().catch(()=>{});S.playing=true;rMP3();rTL();showCFS();hideInter();
  }else{au.pause();S.playing=false;if(idx===-1){S.tIdx=-1;au.src='';hideCFS();hideInter()}rMP3();rTL();updPB()}
});
// Intermission
sk.on('interSync',({hid,trackIdx})=>{
  if(S.hid!==hid)return;
  au.pause();S.playing=false;hideCFS();
  showInter(trackIdx);
});
// Reviews live update
// Reviews: no live display, only summary
sk.on('allReviews',({hid,reviews})=>{
  if(S.hid!==hid)return;
  renderAllReviews(reviews);
});
// Clip
sk.on('clipSync',({hid,play})=>{
  if(S.hid!==hid)return;
  if(play&&S.clipUrl){showClipFS()}else{hideClipFS()}
});
// Countdown sync
sk.on('countdownSync',({hid})=>{
  if(S.hid!==hid)return;
  showCountdown(()=>{if(S.own&&S.tracks.length)playT(0)});
});
document.addEventListener('mousemove',thr(e=>{if(S.sk)sk.emit('cur',{x:e.clientX,y:e.clientY})},40));
}

function show(n){$$('.screen').forEach(s=>s.classList.remove('active'));$('#'+n).classList.add('active')}
$('#btnBack').onclick=()=>{hideCFS();hideClipFS();hideInter();S.sk.emit('leave');S.hid=null;S.own=false;S.tracks=[];S.coverUrl=null;S.clipUrl=null;S.tIdx=-1;S.playing=false;au.pause();au.src='';document.body.classList.remove('spectator');show('hub');visCursors()};

// HUB
const hN=['Maison Alpha','Maison Beta','Maison Gamma'],hI=['/uploads/images/house0.png','/uploads/images/house1.png','/uploads/images/house2.png'];
let hD=[];
function rH(h){hD=h;$('#houses').innerHTML=h.map((x,i)=>{const c=!!x.ownerPseudo;return`<div class="house" data-i="${i}"><div class="h-img"><img src="${hI[i]}" draggable="false"><div class="h-glow"></div></div><div class="h-name">${hN[i]}</div><div class="h-tag${c?' cl':''}">${c?'🔒 Revendiquée':'✨ Disponible'}</div><div class="h-badge">${c?`<div class="bi">${x.ownerAvatar?`<img src="${x.ownerAvatar}">`:''}${x.ownerPseudo}</div>`:''}</div></div>`}).join('');$('#houses').querySelectorAll('.house').forEach(c=>c.onclick=()=>{const i=+c.dataset.i,x=hD[i];if(!x.ownerPseudo)claimM(i);else enterM(i,x)})}
function ent(hid,h,own,audio){
  S.hid=hid;S.own=own;S.tracks=h.tracks||[];S.coverUrl=h.coverUrl;S.clipUrl=h.clipUrl;S.clipName=h.clipName;S.tIdx=-1;S.playing=false;
  if(own)document.body.classList.remove('spectator');else document.body.classList.add('spectator');
  show('dash');$('#dashT').textContent=hN[hid];$('#dashTag').textContent=own?'👑 Hôte':'Spectateur';
  visCursors();
  rCov();rMP3();rTL();rClip();
  if(audio&&audio.playing&&audio.idx>=0&&audio.idx<S.tracks.length){S.tIdx=audio.idx;au.src=S.tracks[audio.idx].url;const el=(Date.now()-audio.at)/1000;au.currentTime=(audio.t||0)+el;au.play().catch(()=>{});S.playing=true;rMP3();rTL();showCFS()}
  if(audio&&audio.intermission&&audio.interTrack>=0)showInter(audio.interTrack);
}

// MODALS
function claimM(i){const m=mkM(`<div class="mo-t">Revendiquer ${hN[i]}</div><div class="mo-d">Choisis un mot de passe.</div><input class="inp" id="mP" type="password" placeholder="Mot de passe..." autocomplete="off"><div style="height:.4rem"></div><button class="btn accent full" id="mG">🏠 Revendiquer</button>`);m.querySelector('#mP').focus();const go=()=>{const p=m.querySelector('#mP').value.trim();if(p)S.sk.emit('claim',{hid:i,pw:p})};m.querySelector('#mG').onclick=go;m.querySelector('#mP').onkeydown=e=>{if(e.key==='Enter')go()}}
function enterM(i,h){const m=mkM(`<div class="mo-t">${hN[i]}</div><div class="mo-d">Hôte: <strong style="color:var(--wm)">${h.ownerPseudo}</strong></div><input class="inp" id="mP" type="password" placeholder="Mot de passe..." autocomplete="off"><div class="mo-e"></div><button class="btn accent full" id="mG">Entrer →</button>`);m.querySelector('#mP').focus();const go=()=>{const p=m.querySelector('#mP').value.trim();if(p)S.sk.emit('enter',{hid:i,pw:p})};m.querySelector('#mG').onclick=go;m.querySelector('#mP').onkeydown=e=>{if(e.key==='Enter')go()}}
function mkM(c){clM();const o=document.createElement('div');o.className='mo';o.innerHTML=`<div class="mo-box">${c}</div>`;o.onclick=e=>{if(e.target===o)clM()};document.body.appendChild(o);return o}
function clM(){document.querySelectorAll('.mo').forEach(m=>m.remove())}

// UPLOADS
$('#btnAudio').onclick=e=>{e.stopPropagation();$('#fAudio').value='';$('#fAudio').click()};
$('#btnVideo').onclick=e=>{e.stopPropagation();$('#fVideo').value='';$('#fVideo').click()};
$('#btnCover').onclick=e=>{e.stopPropagation();$('#fCover').value='';$('#fCover').click()};
async function uploadOne(file,field,route){const fd=new FormData();fd.append(field,file);const r=await fetch(route,{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error);return d}
$('#fAudio').onchange=async()=>{const files=$('#fAudio').files;if(!files.length)return;const btn=$('#btnAudio'),orig=btn.textContent;btn.disabled=true;for(let i=0;i<files.length;i++){btn.textContent=`⏳ ${i+1}/${files.length}`;try{const d=await uploadOne(files[i],'audio','/api/upload-audio');S.sk.emit('addTrack',{hid:S.hid,track:{name:d.name,url:d.url}})}catch(er){alert('Erreur: '+er.message)}}btn.textContent=orig;btn.disabled=false;$('#fAudio').value=''};
$('#fVideo').onchange=async()=>{const f=$('#fVideo').files[0];if(!f)return;const btn=$('#btnVideo'),orig=btn.textContent;btn.textContent='⏳';btn.disabled=true;try{const d=await uploadOne(f,'video','/api/upload-video');S.sk.emit('setClip',{hid:S.hid,url:d.url,name:d.name})}catch(er){alert('Erreur: '+er.message)}btn.textContent=orig;btn.disabled=false;$('#fVideo').value=''};
$('#fCover').onchange=async()=>{const f=$('#fCover').files[0];if(!f)return;const btn=$('#btnCover'),orig=btn.textContent;btn.textContent='⏳';btn.disabled=true;try{const d=await uploadOne(f,'image','/api/upload-image');S.sk.emit('setCover',{hid:S.hid,url:d.url})}catch(er){alert('Erreur: '+er.message)}btn.textContent=orig;btn.disabled=false;$('#fCover').value=''};

// RENDER
function rCov(){$('#coverArea').innerHTML=S.coverUrl?`<img src="${S.coverUrl}">`:'<div class="empty">Cover</div>'}
function rClip(){$('#clipPrev').innerHTML=S.clipUrl?`<video src="${S.clipUrl}" muted></video>`:'<div class="empty">Ajoute ton clip</div>';$('#btnClip').style.display=S.clipUrl?'':'none'}
function rMP3(){
  const el=$('#mp3List');if(!S.tracks.length){el.innerHTML='<div class="empty">Ajoute tes MP3</div>';return}
  el.innerHTML=S.tracks.map((t,i)=>`<div class="li${i===S.tIdx&&S.playing?' on':''}" data-i="${i}" draggable="${S.own}"><span class="dg owner-only">⠿</span><span class="nm">${i===S.tIdx&&S.playing?'♫':(i+1)}</span><span class="na">${t.name}</span></div>`).join('');
  if(!S.own)return;let src=null;
  el.querySelectorAll('.li').forEach(li=>{li.style.cursor='pointer';li.onclick=e=>{if(e.target.closest('.dg'))return;playT(+li.dataset.i)};li.ondragstart=e=>{src=+li.dataset.i;li.classList.add('drg');e.dataTransfer.effectAllowed='move'};li.ondragend=()=>{li.classList.remove('drg');$$('.dot,.dob').forEach(x=>x.classList.remove('dot','dob'))};li.ondragover=e=>{e.preventDefault();$$('.dot,.dob').forEach(x=>x.classList.remove('dot','dob'));const r=li.getBoundingClientRect();li.classList.add(e.clientY<r.top+r.height/2?'dot':'dob')};li.ondragleave=()=>li.classList.remove('dot','dob');li.ondrop=e=>{e.preventDefault();$$('.dot,.dob').forEach(x=>x.classList.remove('dot','dob'));const tgt=+li.dataset.i;if(src===null||src===tgt)return;const order=S.tracks.map((_,i)=>i);const[mv]=order.splice(src,1);const r=li.getBoundingClientRect();let ins=order.indexOf(tgt);if(e.clientY>=r.top+r.height/2)ins++;order.splice(ins,0,mv);S.sk.emit('reorder',{hid:S.hid,order});src=null}});
}
function rTL(){const el=$('#tracklistView');if(!S.tracks.length){el.innerHTML='<div class="empty">Tracklist</div>';return}el.innerHTML=S.tracks.map((t,i)=>`<div class="li${i===S.tIdx&&S.playing?' on':''}"><span class="nm">${i+1}</span><span class="na">${t.name}</span></div>`).join('')}

// AUDIO
function playT(i){if(i<0||i>=S.tracks.length||!S.own)return;S.tIdx=i;au.src=S.tracks[i].url;au.play().catch(()=>{});S.playing=true;S.sk.emit('aPlay',{hid:S.hid,idx:i,t:0});rMP3();rTL();showCFS();hideInter()}

// COUNTDOWN — epic 10s before first listen
$('#btnListen').onclick=()=>{if(!S.own||!S.tracks.length)return;S.sk.emit('countdown',{hid:S.hid})};

function showCountdown(cb){
  const ov=document.createElement('div');ov.id='countdownOv';
  ov.style.cssText='position:fixed;inset:0;z-index:95000;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column';
  const num=document.createElement('div');
  num.style.cssText='font-family:"Silkscreen",cursive;font-size:clamp(4rem,15vw,10rem);color:#fff;text-shadow:0 0 40px rgba(124,111,240,.5),0 0 80px rgba(124,111,240,.3)';
  const sub=document.createElement('div');
  sub.style.cssText='font-family:"Outfit",sans-serif;font-size:1rem;color:rgba(255,255,255,.4);margin-top:1rem;letter-spacing:.3em;text-transform:uppercase';
  sub.textContent='préparez-vous';
  ov.appendChild(num);ov.appendChild(sub);document.body.appendChild(ov);
  let count=10;
  num.textContent=count;
  num.style.animation='cdPulse .5s ease';
  const iv=setInterval(()=>{
    count--;
    if(count<=0){
      clearInterval(iv);
      num.textContent='▶';num.style.color='#6ee7b7';sub.textContent='c\'est parti';
      setTimeout(()=>{ov.remove();cb()},800);
    }else{
      num.textContent=count;
      num.style.animation='none';void num.offsetWidth;num.style.animation='cdPulse .4s ease';
      if(count<=3){num.style.color='#f0a060';num.style.textShadow='0 0 60px rgba(240,160,96,.6),0 0 120px rgba(240,160,96,.3)'}
    }
  },1000);
}
$('#plPlay').onclick=()=>{if(!S.own)return;if(!au.src&&S.tracks.length){playT(0);return}if(S.playing){au.pause();S.playing=false;S.sk.emit('aPause',{hid:S.hid,t:au.currentTime});updPB()}else{au.play().catch(()=>{});S.playing=true;S.sk.emit('aPlay',{hid:S.hid,idx:S.tIdx,t:au.currentTime});updPB();showCFS()}rMP3()};
$('#plPrev').onclick=()=>{if(!S.own||!S.tracks.length)return;playT((S.tIdx-1+S.tracks.length)%S.tracks.length)};
$('#plNext').onclick=()=>{if(!S.own||!S.tracks.length)return;playT((S.tIdx+1)%S.tracks.length)};
$('#plStop').onclick=stopAll;
$('#cfsPlay').onclick=()=>$('#plPlay').click();$('#cfsPrev').onclick=()=>$('#plPrev').click();$('#cfsNext').onclick=()=>$('#plNext').click();$('#cfsStop').onclick=stopAll;
$('#cfsClip').onclick=launchClip;$('#btnClip').onclick=launchClip;
function stopAll(){if(!S.own)return;au.pause();au.currentTime=0;S.playing=false;S.tIdx=-1;S.sk.emit('aStop',{hid:S.hid});hideCFS();hideInter();rMP3();rTL();updPB()}
function updPB(){const t=S.playing?'⏸':'▶';$('#plPlay').textContent=t;$('#cfsPlay').textContent=t}
au.ontimeupdate=()=>{if(!au.duration)return;const p=au.currentTime/au.duration*100;$('#plProg').style.width=p+'%';$('#cfsProg').style.width=p+'%';$('#plTime').textContent=fmt(au.currentTime)+'/'+fmt(au.duration);$('#cfsTime').textContent=fmt(au.currentTime)+' / '+fmt(au.duration);
  // Dynamic title: House 0, track 3 at 1:30
  if(S.hid===0&&S.tIdx===2&&S.tracks[2]){const b=S.tracks[2].name;if(au.currentTime>=90&&!b.includes('Feat.')){$('#cfsName').textContent=b+' (Feat. Fab)';$('#plName').textContent=b+' (Feat. Fab)'}}
};
$('#plBar').onclick=e=>{if(!au.duration||!S.own)return;au.currentTime=((e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.offsetWidth)*au.duration};

// Song ended → INTERMISSION (not auto-next)
au.onended=()=>{
  if(!S.own)return;
  S.playing=false;
  const finishedIdx=S.tIdx;
  hideCFS();
  // Tell server to enter intermission
  S.sk.emit('intermission',{hid:S.hid,trackIdx:finishedIdx});
};
function fmt(s){const m=Math.floor(s/60);return m+':'+Math.floor(s%60).toString().padStart(2,'0')}

// ═══ INTERMISSION ═══
function showInter(trackIdx){
  const ov=$('#interOv');ov.classList.add('active');
  $('#interTrack').textContent=S.tracks[trackIdx]?.name||'Son '+(trackIdx+1);
  S.selectedRating=0;$('#rateVal').textContent='—';$('#rateSent').textContent='';$('#rateComment').value='';$('#rateSubmit').disabled=false;
  buildStars();
  $('#interClipBtn').style.display=S.clipUrl?'':'none';
  const hasNext=trackIdx+1<S.tracks.length;
  $('#interNext').style.display=hasNext?'':'none';
  // Hide cursors so nobody can see what others are rating
  $('#cursors').style.display='none';
}
function hideInter(){
  $('#interOv').classList.remove('active');
  // Show cursors again
  $('#cursors').style.display='';
}

// Star rating UI
function buildStars(){
  const c=$('#rateStars');c.innerHTML='';
  for(let v=0.5;v<=5;v+=0.5){
    const s=document.createElement('span');s.className='rate-star';s.dataset.v=v;
    s.textContent=v%1===0?'⭐':'✦';s.style.fontSize=v%1===0?'1.5rem':'1rem';s.style.color=v%1===0?'':'#f0a060';
    s.onclick=()=>{S.selectedRating=parseFloat(s.dataset.v);$('#rateVal').textContent=S.selectedRating+' / 5';c.querySelectorAll('.rate-star').forEach(x=>{x.classList.toggle('on',parseFloat(x.dataset.v)<=S.selectedRating)})};
    c.appendChild(s);
  }
}
$('#rateSubmit').onclick=()=>{
  if(!S.selectedRating){alert('Choisis une note');return}
  S.sk.emit('review',{hid:S.hid,trackIdx:S.tIdx>=0?S.tIdx:0,pseudo:S.pseudo,rating:S.selectedRating,comment:$('#rateComment').value.trim()});
  $('#rateSent').textContent='✓ Note envoyée !';$('#rateSubmit').disabled=true;
};

// Host intermission choices
$('#interNext').onclick=()=>{if(!S.own)return;const next=S.tIdx+1;if(next<S.tracks.length)playT(next)};
$('#interClipBtn').onclick=()=>{if(!S.own)return;launchClip()};

// Reviews: DON'T show live during intermission — only summary at the end
// (server still collects them, we just don't render in real-time)

// REVIEWS PANEL — summary only, opened manually after full listen
$('#btnShowReviews').onclick=()=>{S.sk.emit('getReviews',{hid:S.hid});$('#reviewsOv').classList.add('active')};
$('#closeReviews').onclick=()=>$('#reviewsOv').classList.remove('active');
function renderAllReviews(reviews){
  const b2=$('#reviewsBody');
  if(!Object.keys(reviews).length){b2.innerHTML='<div class="empty">Aucun avis pour le moment</div>';return}
  b2.innerHTML=Object.entries(reviews).map(([idx,revs])=>{
    const name=S.tracks[idx]?.name||'Son '+(+idx+1);
    const avg=revs.length?revs.reduce((s,r)=>s+r.rating,0)/revs.length:0;
    return`<div class="rv-track"><div class="rv-track-name">${name} — ${avg.toFixed(1)}★ moy.</div>${revs.map(r=>`<div class="rv-item"><span class="rv-who">${r.pseudo}</span><span class="rv-score">${r.rating}★</span><span class="rv-txt">${r.comment||'—'}</span></div>`).join('')}</div>`;
  }).join('');
}

// ═══ AUDIO ANALYSER ═══
let audioCtx,analyser,dataArr,srcNode;
function initAnalyser(){if(audioCtx)return;audioCtx=new(window.AudioContext||window.webkitAudioContext)();analyser=audioCtx.createAnalyser();analyser.fftSize=256;dataArr=new Uint8Array(analyser.frequencyBinCount);srcNode=audioCtx.createMediaElementSource(au);srcNode.connect(analyser);analyser.connect(audioCtx.destination)}
function getE(){if(!analyser)return 0;analyser.getByteFrequencyData(dataArr);let s=0;for(let i=0;i<dataArr.length;i++)s+=dataArr[i];return s/dataArr.length/255}
function getB(){if(!analyser)return 0;analyser.getByteFrequencyData(dataArr);let s=0;for(let i=0;i<10;i++)s+=dataArr[i];return s/10/255}
function getM(){if(!analyser)return 0;analyser.getByteFrequencyData(dataArr);let s=0;for(let i=25;i<60;i++)s+=dataArr[i];return s/35/255}

// ═══ VIZ ENGINE ═══
const vizC=$('#vizCanvas'),vx=vizC.getContext('2d');let vizOn=false,vizRAF=null;
function startViz(){vizOn=true;vizC.width=innerWidth;vizC.height=innerHeight;vizLoop()}
function stopViz(){vizOn=false;if(vizRAF)cancelAnimationFrame(vizRAF)}
addEventListener('resize',()=>{if(vizOn){vizC.width=innerWidth;vizC.height=innerHeight}});

// ─── Shared data ───
const vStars=Array.from({length:70},()=>({x:Math.random(),y:Math.random(),s:.3+Math.random()*.7,sp:.08+Math.random()*.3,o:Math.random()*6.28}));
let vShots=[];const vCols=['#7c6ff0','#a78bfa','#6366f1','#38bdf8','#c084fc','#e879f9','#fbbf24','#34d399','#60a5fa','#f9a8d4','#fb923c','#a5b4fc','#5eead4','#fca5a5'];
let h0Blend=0; // for track 5 cliff transition

// ─── H1: Cyberpunk data ───
const h1Bldgs=Array.from({length:30},(_,i)=>{
  const x=i/30;const bw=.015+Math.random()*.04;const bh=.15+Math.random()*.5;
  const wins=2+Math.floor(Math.random()*5);const rows=3+Math.floor(Math.random()*10);
  const wCols=Array.from({length:wins*rows},()=>{
    const r2=Math.random();
    return r2<.3?[160+Math.random()*60,50,220+Math.random()*35]: // purple
           r2<.5?[40,180+Math.random()*60,220+Math.random()*35]: // cyan
           r2<.65?[220+Math.random()*35,60,120+Math.random()*60]: // pink
           r2<.75?[255,180+Math.random()*50,40]: // warm
           [200+Math.random()*55,200+Math.random()*55,210+Math.random()*45]; // white
  });
  return{x,w:bw,h:bh,wins,rows,wCols,on:Array.from({length:wins*rows},()=>Math.random()>.25)};
});
let h1Rain=[];let h1Red=0;let h1Lightning=0;

// ─── H2: Brutalist data ───
let h2Phase=0;
const h2Blocks=Array.from({length:10},()=>({x:Math.random(),y:Math.random(),w:.02+Math.random()*.1,h:.01+Math.random()*.06,rot:Math.random()*6.28,sp:.001+Math.random()*.002}));
let h2Frac=[];

function vizLoop(){
  if(!vizOn)return;vizRAF=requestAnimationFrame(vizLoop);
  const w=vizC.width,h=vizC.height,t=performance.now()*.001,e=getE(),b=getB();
  if(S.hid===0)vizH0(w,h,t,e,b);
  else if(S.hid===1)vizH1(w,h,t,e,b);
  else if(S.hid===2)vizH2(w,h,t,e,b);
  else{vx.fillStyle='rgba(4,2,12,.3)';vx.fillRect(0,0,w,h)} // fallback
}

// ═══ HOUSE 0: Cosmic ═══
function vizH0(w,h,t,e,b){
  vx.fillStyle='rgba(4,2,12,.2)';vx.fillRect(0,0,w,h);
  
  // Detect real drops (bass spike above threshold)
  if(!vizH0.prevB)vizH0.prevB=0;
  const isDrop=b>.6&&vizH0.prevB<.45; // actual drop = sudden bass jump
  if(isDrop)vizH0.dropGlow=1; // trigger glow
  if(!vizH0.dropGlow)vizH0.dropGlow=0;
  vizH0.dropGlow*=.97; // decay smoothly
  vizH0.prevB=b;
  
  // Stars — calm twinkle, gently brighter on drops then dims back
  const dropBoost=vizH0.dropGlow*.25; // smooth pulse from drop
  vStars.forEach(s=>{
    const a=.1+.18*Math.sin(t*s.sp+s.o)+dropBoost;
    const hue=250+Math.sin(t*.12+s.o)*50;
    const sz=s.s;
    vx.fillStyle=`hsla(${hue},55%,70%,${Math.min(a,.7)})`;
    vx.fillRect(s.x*w-sz/2,s.y*h-sz/2,sz,sz);
  });
  
  // Shooting stars — MORE on real drops, otherwise rare
  const baseRate=.002;
  const dropRate=isDrop?.3:0; // burst of shooting stars on drop
  if(Math.random()<baseRate+dropRate&&vShots.length<8){
    const ang=.4+Math.random()*.7;const spd=1+Math.random()*2;
    vShots.push({x:Math.random()*w*.8,y:-10,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,
      life:1,decay:.002+Math.random()*.003,col:vCols[Math.floor(Math.random()*vCols.length)],sz:.5+Math.random()*.8});
  }
  for(let i=vShots.length-1;i>=0;i--){
    const s=vShots[i];s.x+=s.vx;s.y+=s.vy;s.life-=s.decay;
    if(s.life<=0||s.y>h+30){vShots.splice(i,1);continue}
    vx.strokeStyle=s.col;vx.globalAlpha=s.life*.6;vx.lineWidth=s.sz;
    vx.beginPath();vx.moveTo(s.x,s.y);vx.lineTo(s.x-s.vx*10,s.y-s.vy*10);vx.stroke();
    vx.globalAlpha=1;
  }
  
  // Bottom wash — tiny, pulses gently on drops
  const washA=.005+vizH0.dropGlow*.02;
  vx.fillStyle=`rgba(80,55,160,${washA})`;
  vx.fillRect(0,h-h*.04,w,h*.04);
  
  // Track 5 cliff scene (smooth blend)
  const want5=(S.tIdx===4)?1:0;h0Blend+=(want5-h0Blend)*.012;
  if(h0Blend>.01){
    const sb=h0Blend,cx=w*.2,ct=h*.65;
    vx.globalAlpha=sb;vx.fillStyle='#080612';
    vx.beginPath();vx.moveTo(0,h);vx.lineTo(0,ct+18);vx.lineTo(cx*.2,ct+6);vx.lineTo(cx*.5,ct);vx.lineTo(cx*.8,ct-3);vx.lineTo(cx*1.1,ct+3);vx.lineTo(cx*1.25,ct+14);vx.lineTo(cx*1.3,ct+55);vx.lineTo(cx*1.35,h);vx.closePath();vx.fill();
    // Campfire
    const fx=cx*.72,fy=ct-1;const fg=vx.createRadialGradient(fx,fy,2,fx,fy,40+b*10);fg.addColorStop(0,`rgba(255,130,35,${.05*sb})`);fg.addColorStop(1,'transparent');vx.fillStyle=fg;vx.fillRect(fx-50,fy-40,100,70);
    for(let f=0;f<4;f++){const fh=3+Math.random()*5+b*3;vx.fillStyle=`hsla(${20+f*10},90%,55%,${(.25+Math.random()*.15)*sb})`;vx.beginPath();vx.moveTo(fx-3+f*2,fy);vx.lineTo(fx-1+f*2+Math.sin(t*6+f)*.6,fy-fh);vx.lineTo(fx+1+f*2,fy);vx.fill()}
    // Silhouettes
    const p1=cx*.55,p2=cx*.9,py=ct-2,sw=Math.sin(t*.5)*.3;
    vx.fillStyle='#080612';
    [p1+sw,p2-sw].forEach((px,i)=>{const sz=i?14:12;vx.beginPath();vx.arc(px,py-sz*1.9,sz*.28,0,6.28);vx.fill();vx.fillRect(px-sz*.14,py-sz*1.5,sz*.28,sz*.65);vx.fillRect(px-sz*.16,py-sz*.85,sz*.12,sz*.8);vx.fillRect(px+sz*.04,py-sz*.85,sz*.12,sz*.8)});
    // Hands
    vx.strokeStyle=`rgba(8,6,18,${sb})`;vx.lineWidth=2;vx.beginPath();vx.moveTo(p1+4+sw,py-12*.6);vx.quadraticCurveTo((p1+p2)/2,py-8,p2-4-sw,py-14*.6);vx.stroke();
    // Bubbles
    const ba=(.3+Math.sin(t*.8)*.07)*sb;
    if(Math.sin(t*.3)>.1){vx.fillStyle=`rgba(210,205,235,${ba*.1})`;vx.strokeStyle=`rgba(190,180,220,${ba*.12})`;vx.lineWidth=1;const bx=p1-16,by=py-30;vx.beginPath();vx.roundRect(bx-12,by-7,24,14,3);vx.fill();vx.stroke();for(let d=0;d<3;d++){vx.fillStyle=`rgba(170,160,210,${(.2+.2*Math.sin(t*2.2+d))*ba})`;vx.fillRect(bx-6+d*5,by-1,2,2)}}
    if(Math.sin(t*.3+2)>.1){vx.fillStyle=`rgba(210,205,235,${ba*.08})`;vx.strokeStyle=`rgba(190,180,220,${ba*.1})`;const bx2=p2+10,by2=py-35;vx.beginPath();vx.roundRect(bx2-14,by2-7,28,14,3);vx.fill();vx.stroke();vx.fillStyle=`rgba(235,120,155,${ba*.5})`;vx.beginPath();vx.moveTo(bx2,by2+2);vx.bezierCurveTo(bx2-2,by2-1,bx2-4,by2+1,bx2,by2+4);vx.bezierCurveTo(bx2+4,by2+1,bx2+2,by2-1,bx2,by2+2);vx.fill()}
    vx.globalAlpha=1;
  }
}

// ═══ HOUSE 1: Cyberpunk City ═══
function vizH1(w,h,t,e,b){
  const isRed=(S.tIdx===2);
  if(isRed&&h1Red<1)h1Red=Math.min(1,h1Red+.005);
  else if(!isRed&&h1Red>0)h1Red=Math.max(0,h1Red-.005);
  const r=h1Red;
  // Sky — deep with layers
  const g=vx.createLinearGradient(0,0,0,h*.55);
  g.addColorStop(0,`rgb(${lerp(5,20,r)},${lerp(5,3,r)},${lerp(18,8,r)})`);
  g.addColorStop(.5,`rgb(${lerp(10,30,r)},${lerp(12,5,r)},${lerp(30,12,r)})`);
  g.addColorStop(1,`rgb(${lerp(18,40,r)},${lerp(16,8,r)},${lerp(45,18,r)})`);
  vx.fillStyle=g;vx.fillRect(0,0,w,h);
  // Distant haze
  vx.fillStyle=`rgba(${lerp(60,120,r)},${lerp(40,20,r)},${lerp(100,40,r)},${.03+e*.02})`;
  vx.fillRect(0,h*.3,w,h*.25);
  // Buildings — back layer (distant, shorter, darker)
  for(let i=0;i<15;i++){
    const bx=(i/15)*w-5,bw2=w*.035,bh2=h*(.08+Math.sin(i*2.3)*.04);
    vx.fillStyle=`rgb(${lerp(8,14,r)},${lerp(8,5,r)},${lerp(16,8,r)})`;
    vx.fillRect(bx,h-h*.15-bh2,bw2,bh2+h*.15);
  }
  // Buildings — main layer
  h1Bldgs.forEach((bl,bi)=>{
    const bx=bl.x*w,bw2=bl.w*w,bh2=bl.h*h,by=h-bh2;
    vx.fillStyle=`rgb(${lerp(10,16,r)},${lerp(10,6,r)},${lerp(20,10,r)})`;
    vx.fillRect(bx,by,bw2,bh2);
    // Roof antenna
    if(bi%4===0){vx.fillStyle=`rgb(${lerp(15,22,r)},${lerp(15,10,r)},${lerp(25,15,r)})`;vx.fillRect(bx+bw2*.4,by-8,1.5,8)}
    // Windows with diverse colors
    const wGap=bw2/(bl.wins+1),hGap=Math.min(bh2/(bl.rows+1),12);
    for(let wy=0;wy<bl.rows;wy++){
      for(let wx=0;wx<bl.wins;wx++){
        const idx=wy*bl.wins+wx;
        // Flicker: some windows turn on/off slowly
        const flick=Math.sin(t*.15+bi+wy*.7+wx*1.3)>.0;
        if(!flick)continue;
        const wc=bl.wCols[idx%bl.wCols.length];
        // In red mode: shift toward red/magenta
        const wr=lerp(wc[0],Math.min(255,wc[0]+80),r);
        const wg=lerp(wc[1],Math.max(20,wc[1]-60),r);
        const wb=lerp(wc[2],Math.max(30,wc[2]-40),r);
        const wa=.2+e*.2+Math.sin(t*.8+wx+wy*.5)*.08;
        vx.fillStyle=`rgba(${wr|0},${wg|0},${wb|0},${wa})`;
        const wxp=bx+(wx+1)*wGap-1,wyp=by+(wy+1)*hGap-1;
        vx.fillRect(wxp,wyp,2.5,2.5);
        // Window glow
        if(Math.random()<.02){vx.fillStyle=`rgba(${wr|0},${wg|0},${wb|0},${wa*.15})`;vx.fillRect(wxp-2,wyp-2,6,6)}
      }
    }
  });
  // Neon signs — horizontal bars of light
  for(let i=0;i<5;i++){
    const nx=w*.1+i*w*.2+Math.sin(t*.2+i)*8,ny=h*.3+i*25+Math.sin(t*.4+i)*8;
    const nc=r>.5?[255,40,70]:[120+Math.random()*40,40,200+Math.random()*55];
    const na=.02+b*.04+Math.sin(t*2.5+i)*.01;
    vx.fillStyle=`rgba(${nc},${na})`;
    vx.fillRect(nx,ny,35+e*15,2.5);
    // Vertical accent
    vx.fillRect(nx+15,ny-10,1.5,20+b*8);
    // Glow halo
    const ng=vx.createRadialGradient(nx+18,ny,0,nx+18,ny,25);
    ng.addColorStop(0,`rgba(${nc},${na*.4})`);ng.addColorStop(1,'transparent');
    vx.fillStyle=ng;vx.fillRect(nx-7,ny-25,50,50);
  }
  // Ground — wet reflective
  const gg=vx.createLinearGradient(0,h*.88,0,h);
  gg.addColorStop(0,`rgba(${lerp(8,16,r)},${lerp(10,5,r)},${lerp(20,10,r)},.95)`);
  gg.addColorStop(1,`rgba(${lerp(5,12,r)},${lerp(6,3,r)},${lerp(14,6,r)},1)`);
  vx.fillStyle=gg;vx.fillRect(0,h*.88,w,h*.12);
  // Puddle reflections
  for(let i=0;i<6;i++){const rc=r>.5?[200,50,60]:[80,50,160];vx.fillStyle=`rgba(${rc},${.008+b*.01})`;vx.fillRect(w*.1+i*w*.14+Math.sin(t*.3+i)*10,h*.9+Math.sin(i)*3,25+Math.random()*15,1)}
  // Rain
  const rn=50+Math.floor(e*30)+(r>.5?25:0);
  while(h1Rain.length<rn)h1Rain.push({x:Math.random()*w,y:Math.random()*h,sp:5+Math.random()*4,ln:10+Math.random()*14});
  while(h1Rain.length>rn+15)h1Rain.pop();
  vx.lineWidth=.8;
  h1Rain.forEach(d=>{d.y+=d.sp+e*2.5;d.x-=.6;if(d.y>h){d.y=-d.ln;d.x=Math.random()*w}vx.strokeStyle=`rgba(${r>.5?'180,80,90':'100,120,180'},${.08+b*.08})`;vx.beginPath();vx.moveTo(d.x,d.y);vx.lineTo(d.x-.6,d.y+d.ln);vx.stroke()});
  // Lightning — track 3 only, subtle and realistic
  if(r>.4){
    h1Lightning*=.93;
    if(Math.random()<.004+b*.01){h1Lightning=.3+Math.random()*.25}
    if(h1Lightning>.03){
      // Sky flash — subtle
      vx.fillStyle=`rgba(${r>.7?'200,160,170':'180,180,210'},${h1Lightning*.06})`;vx.fillRect(0,0,w,h*.5);
      // Lightning bolt — thin, branching
      const lx=w*.15+Math.random()*w*.7;
      vx.strokeStyle=`rgba(${r>.7?'220,180,190':'200,200,230'},${h1Lightning*.5})`;vx.lineWidth=.8;
      vx.beginPath();vx.moveTo(lx,0);let ly=0;
      for(let s=0;s<10;s++){ly+=h*.04+Math.random()*h*.03;vx.lineTo(lx+(Math.random()-.5)*35,ly);
        // Branch
        if(Math.random()<.3){vx.moveTo(lx+(Math.random()-.5)*35,ly);const bl=20+Math.random()*30;vx.lineTo(lx+(Math.random()-.5)*50,ly+bl);vx.moveTo(lx+(Math.random()-.5)*35,ly)}
      }vx.stroke();
    }
  }
  // Grain — sparse
  for(let i=0;i<80;i++){vx.fillStyle=`rgba(${r>.5?'150,80,90':'80,80,120'},.02)`;vx.fillRect(Math.random()*w,Math.random()*h,1,1)}
}
function lerp(a,b2,t2){return a+(b2-a)*t2}

// ═══ HOUSE 2: Brutalist Experimental ═══
function vizH2(w,h,t,e,b){
  vx.fillStyle='rgba(3,1,8,.14)';vx.fillRect(0,0,w,h);
  const m=getM();h2Phase+=.007+e*.02;
  const cx2=w/2,cy2=h/2;
  // Warping angular rings
  for(let i=8;i>=0;i--){
    const rad=25+i*35+b*40+Math.sin(h2Phase+i*.4)*12;
    const a=.025+e*.04-i*.002;if(a<=0)continue;
    vx.strokeStyle=`hsla(${260+i*10+Math.sin(t*.3)*20},${20+e*30}%,${5+i*2+m*10}%,${a})`;
    vx.lineWidth=.8+b*1.2;vx.beginPath();
    const segs=5+Math.floor(e*3);
    for(let s=0;s<=segs;s++){const ang=(s/segs)*6.28;const d=Math.sin(ang*2+h2Phase)*12*e+Math.sin(ang*5+t)*6*m;const px=cx2+Math.cos(ang)*(rad+d),py=cy2+Math.sin(ang)*(rad+d);if(s===0)vx.moveTo(px,py);else vx.lineTo(px,py)}
    vx.closePath();vx.stroke();
  }
  // Brutalist blocks
  h2Blocks.forEach(bl=>{bl.rot+=bl.sp+e*.008;const bx=bl.x*w+Math.sin(t*.25+bl.rot*8)*20,by=bl.y*h+Math.cos(t*.18+bl.rot*6)*15;vx.save();vx.translate(bx,by);vx.rotate(bl.rot+Math.sin(t*.4)*e*.2);const bw3=bl.w*w*(1+b*.2),bh3=bl.h*h*(1+m*.2);const ba2=.02+e*.03;vx.strokeStyle=`rgba(180,170,210,${ba2})`;vx.lineWidth=.8;vx.strokeRect(-bw3/2,-bh3/2,bw3,bh3);vx.restore()});
  // Fractures on bass
  if(b>.55&&Math.random()<.2){h2Frac.push({x:Math.random()*w,y:Math.random()*h,ang:Math.random()*6.28,len:40+Math.random()*100,life:1})}
  for(let i=h2Frac.length-1;i>=0;i--){const f=h2Frac[i];f.life-=.012;if(f.life<=0){h2Frac.splice(i,1);continue}vx.strokeStyle=`rgba(160,140,200,${f.life*.1})`;vx.lineWidth=.8;vx.beginPath();vx.moveTo(f.x,f.y);let fx=f.x,fy=f.y;for(let s=0;s<4;s++){fx+=Math.cos(f.ang+Math.sin(s)*.4)*(f.len/4);fy+=Math.sin(f.ang+Math.cos(s)*.4)*(f.len/4);vx.lineTo(fx,fy)}vx.stroke()}
  // Scan lines
  for(let y=0;y<h;y+=3){vx.fillStyle=`rgba(0,0,0,${.02+e*.01})`;vx.fillRect(0,y,w,1)}
  // Glitch
  if(Math.random()<b*.12){vx.fillStyle=`hsla(${265+Math.random()*25},25%,35%,${.04+b*.04})`;vx.fillRect(0,Math.random()*h,w,3+Math.random()*10)}
  // Center void
  const vA=.01+b*.02;const vG=vx.createRadialGradient(cx2,cy2,0,cx2,cy2,50+e*40);vG.addColorStop(0,`rgba(70,40,120,${vA})`);vG.addColorStop(1,'transparent');vx.fillStyle=vG;vx.fillRect(cx2-100,cy2-100,200,200);
}

// COVER FS
function showCFS(){
  try{initAnalyser()}catch(e2){}
  $('#coverFS').classList.add('active','viz-active');
  h0Blend=0;h1Red=0;h1Rain=[];h1Lightning=0;vShots=[];h2Phase=0;h2Frac=[];
  vizC.width=innerWidth;vizC.height=innerHeight;startViz();
  updCFS();updPB();$('#cfsClip').style.display=S.clipUrl?'':'none';
}
function hideCFS(){$('#coverFS').classList.remove('active','viz-active');stopViz()}
function updCFS(){const img=$('#cfsImg');if(S.coverUrl){img.src=S.coverUrl;img.style.display=''}else{img.style.display='none'}$('#cfsName').textContent=S.tracks[S.tIdx]?.name||'';if(S.coverUrl)$('#cfsBg').style.backgroundImage=`url(${S.coverUrl})`;$('#plName').textContent=S.tracks[S.tIdx]?.name||'—'}

// CLIP FS — fixed: preload + error handling + timeout safety
function launchClip(){if(!S.own||!S.clipUrl)return;hideInter();S.sk.emit('clipPlay',{hid:S.hid});showClipFS()}
function showClipFS(){
  if(!S.clipUrl)return;
  const fs=$('#clipFS');fs.classList.add('active','entering');
  clipV.src=S.clipUrl;
  clipV.load(); // force preload
  const playAttempt=()=>{clipV.play().then(()=>{fs.classList.remove('entering')}).catch(()=>{setTimeout(playAttempt,500)})};
  setTimeout(playAttempt,800);
}
function hideClipFS(){$('#clipFS').classList.remove('active','entering');try{clipV.pause();clipV.removeAttribute('src');clipV.load()}catch(e){}}
clipV.onended=()=>{if(S.own)S.sk.emit('clipEnd',{hid:S.hid});hideClipFS()};
clipV.onerror=()=>{console.error('Clip error');hideClipFS()};

// CURSORS — only visible if in same zone (hub=null, or same house)
const curs={},curHouses={},cPal=['#7c6ff0','#f0a060','#6ee7b7','#f472b6','#a3d5ff'];let cI=0;
function uC(id,x,y,pseudo,av,house){
  if(!curs[id]){
    const el=document.createElement('div');el.className='cur';
    const c=cPal[cI++%cPal.length];
    el.innerHTML=`<svg viewBox="0 0 16 20" fill="${c}"><path d="M0 0L16 12L8 12L12 20L8 18L4 12L0 16Z"/></svg><div class="cur-tag" style="background:${c}">${av?`<img src="${av}">`:''}${pseudo||'?'}</div>`;
    $('#cursors').appendChild(el);curs[id]=el;
  }
  curHouses[id]=house;
  curs[id].style.transform=`translate(${x}px,${y}px)`;
  // Show/hide based on zone match
  const sameZone=(S.hid===null&&house===null)||(S.hid!==null&&house===S.hid);
  curs[id].style.display=sameZone?'':'none';
}
function visCursors(){Object.keys(curs).forEach(id=>{const sameZone=(S.hid===null&&curHouses[id]===null)||(S.hid!==null&&curHouses[id]===S.hid);curs[id].style.display=sameZone?'':'none'})}
function rC(id){if(curs[id]){curs[id].remove();delete curs[id];delete curHouses[id]}}
let oN=0;function uOn(v){if(v==='+')oN++;else if(v==='-')oN=Math.max(0,oN-1);else oN=v;const a=$('#hubN'),b=$('#dashN');if(a)a.textContent=oN;if(b)b.textContent=oN}
function thr(fn,ms){let l=0;return(...a)=>{const n=Date.now();if(n-l>=ms){l=n;fn(...a)}}}
})();
