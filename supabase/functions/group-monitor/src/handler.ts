import { getCandidates, getGroupSettings, getGroupReport, getInactiveMembers, getTopMembers, getMonitoredGroupIds, getTestCandidates, recordMemberJoin, recordMessage, updateGroupSetting } from "./database.ts";
import { isGroupAdmin, kickMember, sendMessage } from "./telegram.ts";

type User={id:number;is_bot?:boolean;username?:string;first_name?:string;last_name?:string};
type Chat={id:number;type:string;title?:string};
type Message={message_id:number;date:number;chat:Chat;from?:User;text?:string;new_chat_members?:User[]};
type ChatMemberUpdate={chat:Chat;new_chat_member:{status:string;user:User};old_chat_member:{status:string;user:User}};
type Update={message?:Message;my_chat_member?:ChatMemberUpdate};

const ownerId=()=>Deno.env.get("OWNER_TELEGRAM_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_IDS")?.split(",")[0]?.trim();
const helpText=`📊 GROUP MONITOR — PERINTAH MANUAL

/start — panduan perintah
/help — bantuan
/settings — lihat pengaturan grup
/setmin 10|20|30|50|100 — ubah target pesan
/setperiod 3|7|14|30 — ubah periode penilaian (hari)
/setgrace 3|7|14|30 — ubah toleransi member baru (hari)
/report — ringkasan aktivitas
/top — 10 anggota teraktif
/inactive — anggota tanpa pesan selama periode inaktif
/inactiveperson — daftar anggota di bawah target pesan
/test — tes cepat dengan periode dan toleransi 1 menit
/kickpreview — pratinjau calon Auto Kick
/autokick confirm — jalankan kick setelah lu cek pratinjau

Semua pengaturan dan tindakan moderasi harus dikirim sebagai perintah manual. Tidak ada tombol menu.

📌 Pesan dihitung sejak bot bergabung. Pesan sebelumnya tidak ikut dihitung.
Contact Person: @Ipnexoraa`;

async function requireAdmin(m:Message):Promise<boolean>{
 if(!m.from)return false;
 try{return await isGroupAdmin(m.chat.id,m.from.id);}
 catch{await sendMessage(m.chat.id,"⚠️ Gagal memverifikasi admin. Pastikan bot menjadi admin grup.");return false;}
}
async function broadcastFromOwner(m:Message){
 const id=ownerId();if(!id||String(m.from?.id)!==id||!m.text?.trim())return;
 const groups=await getMonitoredGroupIds();if(!groups.length)return sendMessage(m.chat.id,"Belum ada grup yang tercatat.");
 let success=0,failed=0;for(const chatId of groups){try{await sendMessage(chatId,m.text);success++;}catch{failed++;}}
 return sendMessage(m.chat.id,`Broadcast selesai.\nBerhasil: ${success} grup\nGagal: ${failed} grup`);
}
function displayName(x:{username?:string|null;first_name:string}){return x.username?"@"+x.username:x.first_name;}
async function showSettings(chatId:number){
 const s=await getGroupSettings(chatId);
 return sendMessage(chatId,`⚙️ PENGATURAN GRUP

Target minimal: ${s.min_messages} pesan
Periode penilaian: ${s.evaluation_days} hari
Toleransi member baru: ${s.newcomer_grace_days} hari

Ubah manual:
/setmin 10|20|30|50|100
/setperiod 3|7|14|30
/setgrace 3|7|14|30`);
}
async function showTest(chatId:number){
 const s=await getGroupSettings(chatId);
 const [report,candidates]=await Promise.all([getGroupReport(chatId),getTestCandidates(chatId,s)]);
 return sendMessage(chatId,`🧪 TEST CEPAT — 1 MENIT

Database: ✅ Terhubung
Anggota tercatat: ${report.member_count}
Total pesan: ${report.total_messages}
Target asli: ${s.min_messages} pesan
Jendela evaluasi test: 1 menit
Toleransi test: 1 menit

Terdeteksi: ${candidates.length} anggota
${candidates.slice(0,20).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"Belum ada anggota yang memenuhi kondisi test."}

Mode test hanya membaca data; pengaturan asli tidak berubah.`);
}
async function showKickPreview(chatId:number){
 const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
 return sendMessage(chatId,`🧹 PRATINJAU AUTO KICK

Aturan: kurang dari ${s.min_messages} pesan dalam ${s.evaluation_days} hari, setelah toleransi ${s.newcomer_grace_days} hari.
Calon: ${rows.length}

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"Tidak ada anggota yang memenuhi aturan."}

Belum ada yang dikeluarkan.
Jika daftar sudah benar, jalankan: /autokick confirm`);
}
async function handleCommand(m:Message){
 if(!m.from)return;
 const parts=(m.text??"").trim().split(/\s+/),cmd=parts[0].split("@")[0].toLowerCase(),arg=parts[1],chatId=m.chat.id;
 if(cmd==="/start"||cmd==="/help")return sendMessage(chatId,helpText);
 if(cmd==="/settings") {if(!await requireAdmin(m))return;return showSettings(chatId);}
 if(["/setmin","/setperiod","/setgrace","/autokick"].includes(cmd)){if(!await requireAdmin(m))return;}
 if(cmd==="/setmin"||cmd==="/setperiod"||cmd==="/setgrace"){
  const value=Number(arg),kind=cmd==="/setmin"?"min":cmd==="/setperiod"?"period":"grace";
  const allowed=kind==="min"?[10,20,30,50,100]:[3,7,14,30];
  if(!allowed.includes(value))return sendMessage(chatId,kind==="min"?"Format: /setmin 10|20|30|50|100":"Format: "+(kind==="period"?"/setperiod 3|7|14|30":"/setgrace 3|7|14|30"));
  const field=kind==="min"?"min_messages":kind==="period"?"evaluation_days":"newcomer_grace_days";
  await updateGroupSetting(chatId,field,value);
  return sendMessage(chatId,`✅ Pengaturan disimpan.\n${field}: ${value}${kind==="min"?" pesan":kind==="period"?" hari":" hari"}`);
 }
 if(cmd==="/test")return showTest(chatId);
 if(cmd==="/kickpreview")return showKickPreview(chatId);
 if(cmd==="/autokick"){
  if(arg!=="confirm")return sendMessage(chatId,"Perintah ini akan mengeluarkan anggota. Cek daftar dulu dengan /kickpreview, lalu ketik /autokick confirm.");
  const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
  let done=0,failed=0;
  for(const member of rows.slice(0,50)){try{await kickMember(chatId,member.user_id);done++;}catch{failed++;}}
  return sendMessage(chatId,`🧹 AUTO KICK SELESAI\nBerhasil dikeluarkan: ${done}\nGagal: ${failed}\nDaftar diproses maksimal 50 akun.`);
 }
 if(cmd==="/inactiveperson"||cmd==="/candidates"){
  const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
  return sendMessage(chatId,`👤 INACTIVE PERSON\nPeriode: ${s.evaluation_days} hari • Toleransi: ${s.newcomer_grace_days} hari\n\n${rows.slice(0,50).map(x=>`• ${displayName(x)}: ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"Tidak ada anggota yang masuk daftar."}`);
 }
 if(cmd==="/top"){const rows=await getTopMembers(chatId);return sendMessage(chatId,rows.map((x,i)=>`${i+1}. ${displayName(x)} — ${x.total_messages} pesan`).join("\n")||"Belum ada data.");}
 if(cmd==="/inactive"){const s=await getGroupSettings(chatId),rows=await getInactiveMembers(chatId,s.evaluation_days);return sendMessage(chatId,`👤 INACTIVE — lebih dari ${s.evaluation_days} hari\n\n${rows.map(x=>`• ${displayName(x)}`).join("\n")||"Tidak ada anggota inaktif."}`);}
 if(cmd==="/report"){const [s,report]=await Promise.all([getGroupSettings(chatId),getGroupReport(chatId)]);return sendMessage(chatId,`📊 Ringkasan grup\nAnggota tercatat: ${report.member_count}\nTotal pesan: ${report.total_messages}\nTarget: ${s.min_messages} pesan / ${s.evaluation_days} hari\nToleransi member baru: ${s.newcomer_grace_days} hari`);}
}
async function onboarding(chatId:number){return sendMessage(chatId,"📊 Group Monitor aktif!\n\nGunakan /help untuk melihat semua perintah manual. Pesan dihitung sejak bot bergabung; pesan sebelumnya tidak ikut dihitung.\n\nContact Person: @Ipnexoraa");}
export async function handleUpdate(update:Update){
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
