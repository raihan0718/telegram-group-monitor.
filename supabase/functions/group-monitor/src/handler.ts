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
/setmin 25 — ubah target pesan (angka bebas)
/setperiod 1m|1D|1M|1Y — ubah periode penilaian
/setgrace 1m|1D|1M|1Y — ubah toleransi member baru
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
function parseDuration(input:string|undefined):number|null{
 if(!input)return null;
 const match=input.trim().match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|menit|m|hours?|hrs?|jam|h|days?|hari|d|weeks?|minggu|w|months?|bulan|mos?|mo|M|years?|tahun|yrs?|y|Y)$/i);
 if(!match)return null;
 const amount=Number(match[1]),unit=match[2];
 if(!Number.isFinite(amount)||amount<=0)return null;
 const lower=unit.toLowerCase();
 let multiplier:number;
 if(lower.startsWith("minute")||lower.startsWith("min")||lower==="menit"||unit==="m")multiplier=60;
 else if(lower.startsWith("hour")||lower.startsWith("hr")||lower==="jam"||unit.toLowerCase()==="h")multiplier=3600;
 else if(lower.startsWith("day")||lower==="hari"||unit.toLowerCase()==="d")multiplier=86400;
 else if(lower.startsWith("week")||lower==="minggu"||unit.toLowerCase()==="w")multiplier=604800;
 else if(unit==="M"||lower.startsWith("month")||lower==="bulan"||lower==="mo")multiplier=2592000;
 else if(unit==="Y"||lower.startsWith("year")||lower==="tahun"||lower==="y")multiplier=31536000;
 else return null;
 const seconds=Math.round(amount*multiplier);
 return Number.isSafeInteger(seconds)&&seconds<=2147483647?seconds:null;
}
function durationLabel(seconds:number):string{
 if(seconds%31536000===0)return seconds/31536000+" tahun";
 if(seconds%2592000===0)return seconds/2592000+" bulan";
 if(seconds%604800===0)return seconds/604800+" minggu";
 if(seconds%86400===0)return seconds/86400+" hari";
 if(seconds%3600===0)return seconds/3600+" jam";
 if(seconds%60===0)return seconds/60+" menit";
 return seconds+" detik";
}
async function showSettings(chatId:number){
 const s=await getGroupSettings(chatId);
 return sendMessage(chatId,`⚙️ PENGATURAN GRUP

Target minimal: ${s.min_messages} pesan
Periode penilaian: ${durationLabel(s.evaluation_seconds)}
Toleransi member baru: ${durationLabel(s.newcomer_grace_seconds)}

Ubah manual:
/setmin 25
/setperiod 1 menit / 1D / 1M / 1Y
/setgrace 1 menit / 1D / 1M / 1Y`);
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

Aturan: kurang dari ${s.min_messages} pesan dalam ${durationLabel(s.evaluation_seconds)}, setelah toleransi ${durationLabel(s.newcomer_grace_seconds)}.
Calon: ${rows.length}

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"Tidak ada anggota yang memenuhi aturan."}

Belum ada yang dikeluarkan.
Jika daftar sudah benar, jalankan: /autokick confirm`);
}
async function handleCommand(m:Message){
 if(!m.from)return;
 const parts=(m.text??"").trim().split(/\s+/),cmd=parts[0].split("@")[0].toLowerCase(),arg=parts.slice(1).join(" "),chatId=m.chat.id;
 if(cmd==="/start"||cmd==="/help")return sendMessage(chatId,helpText);
 if(cmd==="/settings") {
  if(!await requireAdmin(m))return;
  try{return await showSettings(chatId);}
  catch(error){console.error("settings_command_failed",error);return sendMessage(chatId,"⚠️ Gagal membaca pengaturan. Database belum siap atau migration timer belum dijalankan. Cek Supabase SQL migration.");}
 }
 if(["/setmin","/setperiod","/setgrace","/autokick"].includes(cmd)){if(!await requireAdmin(m))return;}
 if(cmd==="/setmin"||cmd==="/setperiod"||cmd==="/setgrace"){
  const kind=cmd==="/setmin"?"min":cmd==="/setperiod"?"period":"grace";
  if(kind==="min"){
   const value=Number(arg);
   if(!Number.isSafeInteger(value)||value<0||value>2147483647)return sendMessage(chatId,"Format: /setmin <jumlah pesan> (angka bulat 0 atau lebih)");
   try{
    await updateGroupSetting(chatId,"min_messages",value);
    return sendMessage(chatId,`✅ Target minimal diperbarui: ${value} pesan.`);
   }catch(error){console.error("setmin_failed",error);return sendMessage(chatId,"⚠️ Gagal menyimpan target pesan. Cek koneksi database dan izin tabel.");}
  }
  const seconds=parseDuration(arg);
  if(seconds===null)return sendMessage(chatId,"Format durasi: /setperiod 1 menit, /setperiod 1h, /setperiod 1D, /setperiod 1M, /setperiod 1Y. Berlaku juga untuk /setgrace. M = bulan, m = menit.");
  const field=kind==="period"?"evaluation_seconds":"newcomer_grace_seconds";
  try{
   await updateGroupSetting(chatId,field,seconds);
   return sendMessage(chatId,`✅ ${kind==="period"?"Periode penilaian":"Toleransi member baru"} diperbarui: ${durationLabel(seconds)}.`);
  }catch(error){console.error("duration_setting_failed",error);return sendMessage(chatId,"⚠️ Timer gagal disimpan. Kemungkinan migration flexible durations belum dijalankan di Supabase. Jalankan migration 20261103000700 dulu.");}
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
  return sendMessage(chatId,`👤 INACTIVE PERSON\nPeriode: ${durationLabel(s.evaluation_seconds)} • Toleransi: ${durationLabel(s.newcomer_grace_seconds)}\n\n${rows.slice(0,50).map(x=>`• ${displayName(x)}: ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"Tidak ada anggota yang masuk daftar."}`);
 }
 if(cmd==="/top"){const rows=await getTopMembers(chatId);return sendMessage(chatId,rows.map((x,i)=>`${i+1}. ${displayName(x)} — ${x.total_messages} pesan`).join("\n")||"Belum ada data.");}
 if(cmd==="/inactive"){const s=await getGroupSettings(chatId),days=Math.max(1,Math.ceil(s.evaluation_seconds/86400)),rows=await getInactiveMembers(chatId,days);return sendMessage(chatId,`👤 INACTIVE — lebih dari ${durationLabel(s.evaluation_seconds)}\n\n${rows.map(x=>`• ${displayName(x)}`).join("\n")||"Tidak ada anggota inaktif."}`);}
 if(cmd==="/report"){const [s,report]=await Promise.all([getGroupSettings(chatId),getGroupReport(chatId)]);return sendMessage(chatId,`📊 Ringkasan grup\nAnggota tercatat: ${report.member_count}\nTotal pesan: ${report.total_messages}\nTarget: ${s.min_messages} pesan / ${durationLabel(s.evaluation_seconds)}\nToleransi member baru: ${durationLabel(s.newcomer_grace_seconds)}`);}
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
