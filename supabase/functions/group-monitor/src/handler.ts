import { getCandidates, getGroupSettings, getMembers, getMonitoredGroupIds, recordMemberJoin, recordMessage, updateGroupSetting } from "./database.ts";
import { answerCallbackQuery, editMessageText, isGroupAdmin, sendMessage, setGroupCommands } from "./telegram.ts";
type User={id:number;is_bot?:boolean;username?:string;first_name?:string;last_name?:string};
type Chat={id:number;type:string;title?:string};
type Message={message_id:number;date:number;chat:Chat;from?:User;text?:string;new_chat_members?:User[]};
type Callback={id:string;data?:string;from:User;message?:Message};
type ChatMemberUpdate={chat:Chat;new_chat_member:{status:string;user:User};old_chat_member:{status:string;user:User}};
type Update={message?:Message;callback_query?:Callback;my_chat_member?:ChatMemberUpdate};
const ownerId=()=>Deno.env.get("OWNER_TELEGRAM_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_IDS")?.split(",")[0]?.trim();
const mainMenu=()=>({inline_keyboard:[[{text:"▶️ Mulai Pembersihan",callback_data:"menu:clean"}],[{text:"⚙️ Settings",callback_data:"menu:settings"},{text:"❔ Help",callback_data:"menu:help"}]]});
const helpText="📊 GROUP MONITOR — PANDUAN\n\n/start@UsernameBot — buka menu utama\n▶️ Mulai Pembersihan — periksa Inactive Person sesuai aturan grup\n⚙️ Settings — atur target pesan, periode penilaian, dan toleransi anggota baru\n/report — ringkasan aktivitas grup\n/top — 10 anggota teraktif\n/inactive — anggota tanpa pesan selama periode inaktif\n/inactiveperson — anggota yang belum memenuhi target pesan\n\n📌 Pesan hanya dihitung sejak bot bergabung. Pesan sebelumnya tidak ikut dihitung. Anggota baru mendapat masa toleransi. Pastikan bot dapat membaca pesan grup.\n\nContact Person: @Ipnexoraa";
function settingsKeyboard(s:{min_messages:number;evaluation_days:number;newcomer_grace_days:number}){
 return {inline_keyboard:[
  [{text:`Minimal pesan: ${s.min_messages}`,callback_data:"noop"}],
  [10,20,30,50,100].map(v=>({text:`${v}${s.min_messages===v?" ✓":""}`,callback_data:`cfg:min:${v}`})),
  [{text:`Periode penilaian: ${s.evaluation_days} hari`,callback_data:"noop"}],
  [3,7,14,30].map(v=>({text:`${v}${s.evaluation_days===v?" ✓":""}`,callback_data:`cfg:days:${v}`})),
  [{text:`Toleransi member baru: ${s.newcomer_grace_days} hari`,callback_data:"noop"}],
  [3,7,14,30].map(v=>({text:`${v}${s.newcomer_grace_days===v?" ✓":""}`,callback_data:`cfg:grace:${v}`})),
  [{text:"⬅️ Kembali",callback_data:"menu:home"}]
 ]};
}
async function showSettings(chatId:number,messageId?:number){
 const s=await getGroupSettings(chatId),text="⚙️ PENGATURAN GROUP MONITOR\nPilih nilai yang ingin diterapkan. Pengaturan berlaku untuk grup ini.";
 return messageId?editMessageText(chatId,messageId,text,settingsKeyboard(s)):sendMessage(chatId,text,settingsKeyboard(s));
}
async function broadcastFromOwner(m:Message){
 const id=ownerId();if(!id||String(m.from?.id)!==id||!m.text?.trim())return;
 const groups=await getMonitoredGroupIds();if(!groups.length)return sendMessage(m.chat.id,"Belum ada grup yang tercatat.");
 let success=0,failed=0;for(const chatId of groups){try{await sendMessage(chatId,m.text);success++;}catch{failed++;}}
 return sendMessage(m.chat.id,`Broadcast selesai.\nBerhasil: ${success} grup\nGagal: ${failed} grup`);
}
async function handleCommand(m:Message){
 if(!m.from)return;const cmd=(m.text??"").trim().split(/\s+/)[0].split("@")[0].toLowerCase(),chatId=m.chat.id;
 if(cmd==="/start"){try{await setGroupCommands();}catch(error){console.error("set_group_commands_failed",error);}}
 let admin=false;try{admin=await isGroupAdmin(chatId,m.from.id);}catch{return sendMessage(chatId,"⚠️ Gagal memverifikasi admin. Pastikan bot menjadi admin grup.");}
 if(!admin)return sendMessage(chatId,"⛔ Menu hanya bisa digunakan admin grup.");
 if(cmd==="/start")return sendMessage(chatId,"📊 GROUP MONITOR\nPilih tindakan yang ingin dilakukan.\n\nContact Person: @Ipnexoraa",mainMenu());
 if(cmd==="/help")return sendMessage(chatId,helpText);
 if(cmd==="/settings")return showSettings(chatId);
 if(cmd==="/inactiveperson"||cmd==="/candidates"){
  const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
  const body=rows.slice(0,50).map(x=>`• ${x.username?"@"+x.username:x.first_name}: ${x.period_messages}/${s.min_messages} pesan`).join("\n");
  return sendMessage(chatId,`👤 INACTIVE PERSON\nPeriode: ${s.evaluation_days} hari • Toleransi: ${s.newcomer_grace_days} hari\n\n${body||"Tidak ada anggota yang masuk daftar."}`);
 }
 const members=await getMembers(chatId);
 if(cmd==="/top")return sendMessage(chatId,members.slice(0,10).map((x,i)=>`${i+1}. ${x.username?"@"+x.username:x.first_name} — ${x.total_messages} pesan`).join("\n")||"Belum ada data.");
 if(cmd==="/inactive"){const cutoff=Date.now()-7*86400000,rows=members.filter(x=>new Date(x.last_seen_at).getTime()<cutoff);return sendMessage(chatId,rows.slice(0,30).map(x=>`• ${x.username?"@"+x.username:x.first_name}`).join("\n")||"Tidak ada anggota inaktif lebih dari 7 hari.");}
 if(cmd==="/report"){const s=await getGroupSettings(chatId),total=members.reduce((a,x)=>a+x.total_messages,0);return sendMessage(chatId,`📊 Ringkasan grup\nAnggota tercatat: ${members.length}\nTotal pesan: ${total}\nTarget: ${s.min_messages} pesan / ${s.evaluation_days} hari\nToleransi member baru: ${s.newcomer_grace_days} hari`);}
}
async function handleCallback(q:Callback){
 const m=q.message;if(!m){return answerCallbackQuery(q.id);}
 try{if(!await isGroupAdmin(m.chat.id,q.from.id))return answerCallbackQuery(q.id,"Khusus admin grup.");}
 catch{return answerCallbackQuery(q.id,"Gagal memverifikasi admin.");}
 const data=q.data??"";
 if(data==="noop")return answerCallbackQuery(q.id);
 if(data==="menu:home"){await editMessageText(m.chat.id,m.message_id,"📊 GROUP MONITOR\nPilih tindakan yang ingin dilakukan.\n\nContact Person: @Ipnexoraa",mainMenu());return answerCallbackQuery(q.id);}
 if(data==="menu:settings"){await showSettings(m.chat.id,m.message_id);return answerCallbackQuery(q.id);}
 if(data==="menu:help"){await editMessageText(m.chat.id,m.message_id,helpText,{inline_keyboard:[[{text:"⬅️ Kembali",callback_data:"menu:home"}]]});return answerCallbackQuery(q.id);}
 if(data==="menu:clean"||data==="menu:inactiveperson"){
  const s=await getGroupSettings(m.chat.id),rows=await getCandidates(m.chat.id,s);
  const body=rows.slice(0,50).map(x=>`• ${x.username?"@"+x.username:x.first_name}: ${x.period_messages}/${s.min_messages} pesan`).join("\n");
  await editMessageText(m.chat.id,m.message_id,`👤 INACTIVE PERSON\nPeriode: ${s.evaluation_days} hari • Toleransi: ${s.newcomer_grace_days} hari\n\n${body||"Tidak ada anggota yang masuk daftar."}`,{inline_keyboard:[[{text:"🔄 Periksa lagi",callback_data:"menu:clean"}],[{text:"⬅️ Kembali",callback_data:"menu:home"}]]});
  return answerCallbackQuery(q.id,"Pemeriksaan selesai.");
 }
 const match=data.match(/^cfg:(min|days|grace):(\d+)$/);if(match){
  const kind=match[1],value=Number(match[2]),allowed=kind==="min"?[10,20,30,50,100]:[3,7,14,30];
  if(!allowed.includes(value))return answerCallbackQuery(q.id,"Nilai tidak valid.");
  const field=kind==="min"?"min_messages":kind==="days"?"evaluation_days":"newcomer_grace_days";
  await updateGroupSetting(m.chat.id,field,value);await showSettings(m.chat.id,m.message_id);return answerCallbackQuery(q.id,"Pengaturan disimpan.");
 }
 return answerCallbackQuery(q.id);
}
async function onboarding(chatId:number){
 await sendMessage(chatId,"📊 Group Monitor aktif!\n\nBot mulai menghitung pesan sejak bot bergabung ke grup ini. Pesan sebelum bot masuk tidak ikut dihitung.\n\nAnggota baru mendapat masa toleransi sesuai pengaturan admin dan tidak langsung masuk daftar Inactive Person.\n\nAdmin dapat mengatur target pesan, periode penilaian, dan masa toleransi melalui /settings.\n\nPastikan bot memiliki izin membaca pesan grup.\n\nContact Person: @Ipnexoraa");
}
export async function handleUpdate(update:Update){
 if(update.callback_query)return handleCallback(update.callback_query);
 if(update.my_chat_member){
  const u=update.my_chat_member,old=u.old_chat_member.status,next=u.new_chat_member.status;
  if(["left","kicked"].includes(old)&&["member","administrator"].includes(next))return onboarding(u.chat.id);
  return;
 }
 const m=update.message;if(!m)return;
 if(m.chat.type==="private"){if(m.from&&!m.from.is_bot)return broadcastFromOwner(m);return;}
 if(m.chat.type!=="group"&&m.chat.type!=="supergroup")return;
 if(m.new_chat_members?.length){
  for(const u of m.new_chat_members){if(!u.is_bot)await recordMemberJoin({chatId:m.chat.id,userId:u.id,username:u.username,firstName:u.first_name??"",lastName:u.last_name,joinedAt:new Date(m.date*1000).toISOString()});}
 }
 if(!m.from||m.from.is_bot)return;
 if(m.text?.startsWith("/"))return handleCommand(m);
 await recordMessage({chatId:m.chat.id,userId:m.from.id,username:m.from.username,firstName:m.from.first_name??"",lastName:m.from.last_name,messageId:m.message_id,date:new Date(m.date*1000).toISOString()});
}
