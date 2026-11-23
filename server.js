const express=require('express'),http=require('http'),{Server}=require('socket.io'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),cors=require('cors'),fs=require('fs');
require('dotenv').config();
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});
app.use(cors());app.use(express.json({limit:'50mb'}));app.use(express.static('public'));app.use('/uploads',express.static('uploads'));
let DB={users:[],messages:[],chats:[],statuses:[],calls:[],otps:{}};
try{DB=JSON.parse(fs.readFileSync('carlos.json','utf8'))}catch{}
const save=()=>fs.writeFileSync('carlos.json',JSON.stringify(DB));
const auth=(req,res,next)=>{try{req.user=jwt.verify(req.headers.authorization?.split(' ')[1],process.env.JWT_SECRET||'carlos_secret');next()}catch{res.status(401).json({error:'Unauthorized'})}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
app.post('/api/send-otp',(req,res)=>{const code=Math.floor(100000+Math.random()*900000).toString();DB.otps[req.body.phone]={code,expires:Date.now()+300000};save();console.log('OTP for',req.body.phone,code);res.json({ok:true,message:'OTP sent - check Termux log'})});
app.post('/api/verify-otp',(req,res)=>{const o=DB.otps[req.body.phone];if(!o||o.code!==req.body.code||o.expires<Date.now())return res.status(400).json({error:'Invalid OTP'});res.json({ok:true})});
app.post('/api/register',async(req,res)=>{const{phone,email,username,password,name,bio}=req.body;if(DB.users.find(u=>u.phone==phone||u.email==email||u.username==username))return res.status(400).json({error:'Phone/Email/Username exists'});const hash=await bcrypt.hash(password,10);const u={id:'U'+uid(),phone,email,username,password:hash,name,bio:bio||'',pic:'',lastSeen:Date.now(),online:0,createdAt:Date.now()};DB.users.push(u);save();const token=jwt.sign({id:u.id,username},process.env.JWT_SECRET||'carlos_secret');res.json({token,user:u})});
app.post('/api/login',async(req,res)=>{const u=DB.users.find(x=>x.phone==req.body.login||x.email==req.body.login||x.username==req.body.login);if(!u)return res.status(400).json({error:'User not found'});if(!await bcrypt.compare(req.body.password,u.password))return res.status(400).json({error:'Wrong password'});const token=jwt.sign({id:u.id,username:u.username},process.env.JWT_SECRET||'carlos_secret');res.json({token,user:u})});
app.post('/api/forgot',(req,res)=>res.json({ok:true,message:'Use OTP flow to reset'}));
app.get('/api/users',auth,(req,res)=>res.json(DB.users.map(({password,...u})=>u)));
app.get('/api/me',auth,(req,res)=>res.json(DB.users.find(u=>u.id==req.user.id)));
app.post('/api/profile',auth,(req,res)=>{let u=DB.users.find(x=>x.id==req.user.id);Object.assign(u,req.body);save();res.json({ok:true})});
app.post('/api/chats',auth,(req,res)=>{
  let members = Array.isArray(req.body.members) && req.body.members.length ? [...new Set([req.user.id, ...req.body.members])] : [req.user.id];
  if((req.body.type||'private')==='private' && members.length===2){
    let existing = DB.chats.find(c=>c.type!=='group' && c.members && c.members.length===2 && members.every(m=>c.members.includes(m)));
    if(existing) return res.json(existing);
  }
  const c={id:'C'+uid(),type:req.body.type||'private',name:req.body.name||'',pic:'',members:members,admins:[req.user.id],description:'',inviteLink:'https://carlos.app/join/C'+uid(),createdAt:Date.now()};DB.chats.push(c);save();res.json(c)});
app.get('/api/chats',auth,(req,res)=>res.json(DB.chats.filter(c=>c.members.includes(req.user.id))));
app.get('/api/messages/:chatId',auth,(req,res)=>{let ms=DB.messages.filter(m=>m.chatId==req.params.chatId);let changed=false;ms.forEach(m=>{if(m.senderId!=req.user.id&&m.status==='sent'){m.status='delivered';changed=true}});if(changed){save();io.to(req.params.chatId).emit('message-status',{chatId:req.params.chatId,status:'delivered'})}res.json(ms)});
app.post('/api/messages',auth,(req,res)=>{let chat=DB.chats.find(c=>c.id==req.body.chatId);let otherId=chat?chat.members.find(x=>x!=req.user.id):null;let other=otherId?DB.users.find(u=>u.id==otherId):null;let st=(other&&other.online)?'delivered':'sent';const m={id:'M'+uid(),chatId:req.body.chatId,senderId:req.user.id,text:req.body.text,type:req.body.type||'text',fileUrl:req.body.fileUrl||'',replyTo:req.body.replyTo||'',edited:0,deleted:0,createdAt:Date.now(),status:st};DB.messages.push(m);save();io.to(m.chatId).emit('new-message',m);res.json(m)});
app.put('/api/messages/:id',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(m){m.text=req.body.text;m.edited=1;save();io.emit('message-edited',{id:m.id,text:m.text})}res.json({ok:true})});
app.delete('/api/messages/:id',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(m){m.deleted=1;save();io.emit('message-deleted',{id:m.id})}res.json({ok:true})});
app.post('/api/status',auth,(req,res)=>{const s={id:'S'+uid(),userId:req.user.id,text:req.body.text||'',media:req.body.media||'',music:req.body.music||'',views:[],createdAt:Date.now(),expiresAt:Date.now()+86400000};DB.statuses.push(s);save();res.json(s)});
app.get('/api/status',auth,(req,res)=>res.json(DB.statuses.filter(s=>s.expiresAt>Date.now())));
app.post('/api/status/:id/view',auth,(req,res)=>{let s=DB.statuses.find(x=>x.id==req.params.id);if(s&&!s.views.includes(req.user.id))s.views.push(req.user.id);save();res.json({views:s?s.views:[]})});
app.post('/api/calls',auth,(req,res)=>{const c={id:'CALL'+uid(),callerId:req.user.id,receiverId:req.body.receiverId,type:req.body.type,status:'ringing',startedAt:Date.now()};DB.calls.push(c);save();io.to(req.body.receiverId).emit('incoming-call',c);res.json(c)});
app.get('/api/admin/stats',auth,(req,res)=>res.json({users:DB.users.length,messages:DB.messages.length}));
app.post('/api/messages/:id/react',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(!m)return res.json({ok:false});m.reactions=m.reactions||[];m.reactions=m.reactions.filter(r=>r.userId!=req.user.id);if(req.body.emoji)m.reactions.push({userId:req.user.id,emoji:req.body.emoji});save();io.emit('message-reacted',{id:m.id,reactions:m.reactions});res.json(m)});
app.post('/api/messages/:id/pin',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(m){m.pinned=m.pinned?0:1;save();io.emit('message-pinned',{id:m.id,pinned:m.pinned})}res.json({ok:true})});
app.post('/api/messages/:id/star',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(!m)return res.json({ok:false});m.starredBy=m.starredBy||[];if(m.starredBy.includes(req.user.id))m.starredBy=m.starredBy.filter(x=>x!=req.user.id);else m.starredBy.push(req.user.id);save();res.json(m)});
app.post('/api/messages/:id/delete-for-me',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(m){m.deletedFor=m.deletedFor||[];if(!m.deletedFor.includes(req.user.id))m.deletedFor.push(req.user.id);save()}res.json({ok:true})});
app.post('/api/messages/:id/delete-everyone',auth,(req,res)=>{let m=DB.messages.find(x=>x.id==req.params.id);if(m){m.deleted=1;m.text='deleted';save();io.emit('message-deleted',{id:m.id})}res.json({ok:true})});
io.on('connection',socket=>{
socket.on('join',id=>socket.join(id));
socket.on('join-user',id=>{socket.join(id);let u=DB.users.find(x=>x.id==id);if(u){u.online=1;save()}});
socket.on('typing',d=>socket.to(d.chatId).emit('typing',d));
socket.on('recording',d=>socket.to(d.chatId).emit('recording',d));
socket.on('read',id=>{let m=DB.messages.find(x=>x.id==id);if(m){m.status='read';save();io.emit('message-status',{id,status:'read'})}});
socket.on('call-signal',d=>socket.to(d.to).emit('call-signal',d));
});
server.listen(process.env.PORT||3000,()=>console.log('CARLOS MESSENGER running on http://localhost:'+(process.env.PORT||3000)));
