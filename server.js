const express=require('express'),http=require('http'),{Server}=require('socket.io'),path=require('path'),multer=require('multer'),fs=require('fs');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'},maxHttpBufferSize:50e6});
['uploads/avatars','uploads/audio','uploads/videos','uploads/images'].forEach(d=>{const p=path.join(__dirname,'public',d);if(!fs.existsSync(p))fs.mkdirSync(p,{recursive:true})});
function safe(o){const e=path.extname(o),b=path.basename(o,e).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_\-]/g,'_').substring(0,50);return Date.now()+'-'+b+e.toLowerCase()}
const mk=d=>multer.diskStorage({destination:(_,__,cb)=>cb(null,path.join(__dirname,'public/uploads',d)),filename:(_,f,cb)=>cb(null,safe(f.originalname))});
function upR(p,store,field,sub,lim){const up=multer({storage:store,limits:{fileSize:lim}});app.post(p,(req,res)=>{up.single(field)(req,res,err=>{if(err)return res.status(400).json({error:err.message});if(!req.file)return res.status(400).json({error:'No file'});const name=path.basename(req.file.originalname,path.extname(req.file.originalname));res.json({url:'/uploads/'+sub+'/'+req.file.filename,name})})})}
app.use(express.static(path.join(__dirname,'public')));app.use(express.json());
upR('/api/upload-avatar',mk('avatars'),'avatar','avatars',5e6);
upR('/api/upload-audio',mk('audio'),'audio','audio',100e6);
upR('/api/upload-video',mk('videos'),'video','videos',2e9);
upR('/api/upload-image',mk('images'),'image','images',15e6);

const state={users:{},houses:[0,1,2].map(id=>({id,ownerPseudo:null,ownerAvatar:null,password:null,tracks:[],clipUrl:null,clipName:null,coverUrl:null,reviews:{}}))};
const hA=[0,1,2].map(()=>({playing:false,idx:-1,t:0,at:null,intermission:false,interTrack:-1}));
const rm=id=>'h'+id;
function safeH(){return state.houses.map(h=>({...h,password:undefined}))}
function isOwner(sk,hid){const u=state.users[sk.id];return u&&state.houses[hid]&&state.houses[hid].ownerPseudo===u.pseudo}

io.on('connection',sk=>{
  sk.on('user:join',d=>{
    // Store user with house=null (hub)
    state.users[sk.id]={pseudo:d.pseudo,avatar:d.avatar,cx:0,cy:0,house:null};
    // Check if this pseudo owns a house — reconnect them
    const ownedHouse=state.houses.findIndex(h=>h.ownerPseudo===d.pseudo);
    sk.emit('init',{users:state.users,houses:safeH(),ownedHouse});
    sk.broadcast.emit('joined',{sid:sk.id,...state.users[sk.id]});
  });

  sk.on('cur',({x,y})=>{
    const u=state.users[sk.id];if(!u)return;
    u.cx=x;u.cy=y;
    sk.broadcast.emit('cur',{sid:sk.id,x,y,pseudo:u.pseudo,avatar:u.avatar,house:u.house!==null?u.house:null});
  });

  sk.on('claim',({hid,pw})=>{
    const h=state.houses[hid];
    if(!h||h.ownerPseudo)return sk.emit('claimR',{ok:false,msg:'Déjà prise.'});
    const u=state.users[sk.id];if(!u)return;
    h.ownerPseudo=u.pseudo;h.ownerAvatar=u.avatar;h.password=pw;
    u.house=hid;
    sk.join(rm(hid));
    sk.emit('claimR',{ok:true,hid,house:{...h,password:undefined},audio:hA[hid]});
    io.emit('hup',safeH());
    io.emit('houseChange',{sid:sk.id,house:hid});
  });

  sk.on('enter',({hid,pw})=>{
    const h=state.houses[hid];
    if(!h||!h.ownerPseudo)return sk.emit('enterR',{ok:false,msg:'Non revendiquée.'});
    if(h.password!==pw)return sk.emit('enterR',{ok:false,msg:'Mauvais mdp.'});
    const u=state.users[sk.id];if(u)u.house=hid;
    sk.join(rm(hid));
    sk.emit('enterR',{ok:true,hid,house:{...h,password:undefined},audio:hA[hid]});
    io.emit('houseChange',{sid:sk.id,house:hid});
  });

  sk.on('rejoin',({hid,pw})=>{
    // Owner reconnecting to their own house
    const h=state.houses[hid];const u=state.users[sk.id];
    if(!h||!u)return;
    if(h.ownerPseudo===u.pseudo){
      // Owner auto-rejoin, no password needed
      u.house=hid;sk.join(rm(hid));
      sk.emit('rejoinR',{ok:true,hid,house:{...h,password:undefined},audio:hA[hid],isOwner:true});
      io.emit('houseChange',{sid:sk.id,house:hid});
    }else if(h.password===pw){
      u.house=hid;sk.join(rm(hid));
      sk.emit('rejoinR',{ok:true,hid,house:{...h,password:undefined},audio:hA[hid],isOwner:false});
      io.emit('houseChange',{sid:sk.id,house:hid});
    }
  });

  sk.on('leave',()=>{
    const u=state.users[sk.id];
    if(u&&u.house!==null){sk.leave(rm(u.house));u.house=null;io.emit('houseChange',{sid:sk.id,house:null})}
  });

  // Owner-only actions (checked by pseudo match)
  sk.on('addTrack',({hid,track})=>{if(!isOwner(sk,hid))return;state.houses[hid].tracks.push(track);io.to(rm(hid)).emit('tracks',{hid,tracks:state.houses[hid].tracks})});
  sk.on('reorder',({hid,order})=>{if(!isOwner(sk,hid))return;const h=state.houses[hid];h.tracks=order.map(i=>h.tracks[i]).filter(Boolean);io.to(rm(hid)).emit('tracks',{hid,tracks:h.tracks})});
  sk.on('setClip',({hid,url,name})=>{if(!isOwner(sk,hid))return;const h=state.houses[hid];h.clipUrl=url;h.clipName=name;io.to(rm(hid)).emit('clip',{hid,url,name})});
  sk.on('setCover',({hid,url})=>{if(!isOwner(sk,hid))return;state.houses[hid].coverUrl=url;io.to(rm(hid)).emit('cover',{hid,url})});
  sk.on('aPlay',({hid,idx,t})=>{if(!isOwner(sk,hid))return;hA[hid]={playing:true,idx,t:t||0,at:Date.now(),intermission:false,interTrack:-1};io.to(rm(hid)).emit('aSync',{hid,...hA[hid]})});
  sk.on('aPause',({hid,t})=>{if(!isOwner(sk,hid))return;hA[hid]={...hA[hid],playing:false,t};io.to(rm(hid)).emit('aSync',{hid,...hA[hid]})});
  sk.on('aStop',({hid})=>{if(!isOwner(sk,hid))return;hA[hid]={playing:false,idx:-1,t:0,at:null,intermission:false,interTrack:-1};io.to(rm(hid)).emit('aSync',{hid,...hA[hid]})});
  sk.on('intermission',({hid,trackIdx})=>{if(!isOwner(sk,hid))return;hA[hid]={playing:false,idx:trackIdx,t:0,at:null,intermission:true,interTrack:trackIdx};io.to(rm(hid)).emit('interSync',{hid,trackIdx})});
  sk.on('review',({hid,trackIdx,pseudo,rating,comment})=>{const h=state.houses[hid];if(!h)return;if(!h.reviews[trackIdx])h.reviews[trackIdx]=[];h.reviews[trackIdx]=h.reviews[trackIdx].filter(r=>r.pseudo!==pseudo);h.reviews[trackIdx].push({pseudo,rating,comment,ts:Date.now()})});
  sk.on('getReviews',({hid})=>{const h=state.houses[hid];if(h)sk.emit('allReviews',{hid,reviews:h.reviews})});
  sk.on('clipPlay',({hid})=>{if(!isOwner(sk,hid))return;hA[hid].intermission=false;io.to(rm(hid)).emit('clipSync',{hid,play:true})});
  sk.on('clipEnd',({hid})=>{io.to(rm(hid)).emit('clipSync',{hid,play:false})});
  sk.on('countdown',({hid})=>{if(!isOwner(sk,hid))return;io.to(rm(hid)).emit('countdownSync',{hid})});

  sk.on('disconnect',()=>{
    // Don't delete house ownership — keep it for reconnection
    delete state.users[sk.id];
    io.emit('left',{sid:sk.id});
  });
});
server.listen(process.env.PORT||3000,()=>console.log('\n  🎵 http://localhost:3000\n'));
