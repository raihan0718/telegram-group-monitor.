import { getCandidates, getGroupSettings, getGroupReport, getInactiveMembers, getTopMembers, getMonitoredGroupIds, recordMemberJoin, recordMessage, updateGroupSetting } from "./database.ts";
import { isGroupAdmin, kickMember, sendMessage } from "./telegram.ts";

type User={id:number;is_bot?:boolean;username?:string;first_name?:string;last_name?:string};
type Chat={id:number;type:string;title?:string};
type Message={message_id:number;date:number;chat:Chat;from?:User;text?:string;new_chat_members?:User[]};
type ChatMemberUpdate={chat:Chat;new_chat_member:{status:string;user:User};old_chat_member:{status:string;user:User}};
type Update={message?:Message;my_chat_member?:ChatMemberUpdate};

const ownerId=()=>Deno.env.get("OWNER_TELEGRAM_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_ID")?.trim()||Deno.env.get("TELEGRAM_ADMIN_IDS")?.split(",")[0]?.trim();
const helpText=`📊 GROUP MONITOR
━━━━━━━━━━━━━━━━

⚙️ PENGATURAN
/settings — lihat konfigurasi grup
/setmin 25 — atur target pesan
/setperiod 7d — atur periode penilaian
/setgrace 1d — atur toleransi member baru

📈 AKTIVITAS
/report — ringkasan aktivitas grup
/top — 10 anggota paling aktif
/inactive — daftar anggota tidak aktif
/inactiveperson — anggota di bawah target pesan

🛡️ MODERASI
/kickpreview — periksa calon Auto Kick
/autokick confirm — jalankan setelah pratinjau

/help — tampilkan panduan ini

━━━━━━━━━━━━━━━━
📌 Pesan dihitung sejak bot bergabung. Riwayat sebelumnya tidak tersedia.

Satuan waktu: m (menit), h (jam), d (hari), w (minggu), M (bulan), y (tahun).
Contoh: 30m • 12h • 7d • 1M

Bantuan: @Ipnexoraa`;

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
 if(seconds%31536000===0)return seconds/31536000+"y";
 if(seconds%2592000===0)return seconds/2592000+"M";
 if(seconds%604800===0)return seconds/604800+"w";
 if(seconds%86400===0)return seconds/86400+"d";
 if(seconds%3600===0)return seconds/3600+"h";
 if(seconds%60===0)return seconds/60+"m";
 return seconds+"s";
}
async function showSettings(chatId:number){
 const s=await getGroupSettings(chatId);
 return sendMessage(chatId,`⚙️ PENGATURAN GRUP
━━━━━━━━━━━━━━━━
🎯 Target minimal      ${s.min_messages} pesan
⏱ Periode penilaian   ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi member    ${durationLabel(s.newcomer_grace_seconds)}

✏️ UBAH PENGATURAN
/setmin 25
/setperiod 7d
/setgrace 1d

ℹ️ SATUAN WAKTU
m = menit  •  h = jam
d = hari   •  w = minggu
M = bulan  •  y = tahun`);
}
async function showKickPreview(chatId:number){
 const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
 return sendMessage(chatId,`🧹 PRATINJAU AUTO KICK
━━━━━━━━━━━━━━━━
🎯 Target minimal     ${s.min_messages} pesan
⏱ Periode penilaian  ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi member   ${durationLabel(s.newcomer_grace_seconds)}
👥 Calon terdeteksi   ${rows.length}

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"✅ Tidak ada anggota yang masuk kriteria."}

ℹ️ Belum ada anggota yang dikeluarkan.
Periksa daftar di atas sebelum menjalankan /autokick confirm.`);
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
   if(!Number.isSafeInteger(value)||value<0||value>2147483647)return sendMessage(chatId,"⚠️ FORMAT TIDAK VALID\n\nGunakan angka bulat 0 atau lebih.\nContoh: /setmin 25");
   try{
    await updateGroupSetting(chatId,"min_messages",value);
    return sendMessage(chatId,`✅ TARGET DIPERBARUI\n━━━━━━━━━━━━━━━━\nTarget minimal: ${value} pesan\n\nPerubahan berhasil disimpan.`);
   }catch(error){console.error("setmin_failed",error);return sendMessage(chatId,"⚠️ TARGET GAGAL DISIMPAN\n\nPeriksa koneksi database dan izin bot, lalu coba lagi.");}
  }
  const seconds=parseDuration(arg);
  if(seconds===null)return sendMessage(chatId,"⚠️ FORMAT DURASI TIDAK VALID\n\nContoh penggunaan:\n/setperiod 30m\n/setperiod 12h\n/setperiod 7d\n/setperiod 1M\n\nBerlaku juga untuk /setgrace. m = menit, M = bulan.");
  const field=kind==="period"?"evaluation_seconds":"newcomer_grace_seconds";
  try{
   await updateGroupSetting(chatId,field,seconds);
   return sendMessage(chatId,`✅ PENGATURAN DIPERBARUI
━━━━━━━━━━━━━━━━
${kind==="period"?"⏱ Periode penilaian":"🆕 Toleransi member"}: ${durationLabel(seconds)}

Perubahan berhasil disimpan.`);
  }catch(error){console.error("duration_setting_failed",error);const detail=(error instanceof Error?error.message:String(error)).slice(0,350);return sendMessage(chatId,`⚠️ Timer gagal disimpan. Detail error database:\n${detail}`);}
 }
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
  return sendMessage(chatId,`👤 DAFTAR INACTIVE PERSON
━━━━━━━━━━━━━━━━
⏱ Periode   ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi ${durationLabel(s.newcomer_grace_seconds)}
🎯 Target    ${s.min_messages} pesan
👥 Ditemukan ${rows.length} anggota

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"✅ Tidak ada anggota yang masuk kriteria."}`);
 }
 if(cmd==="/top"){const rows=await getTopMembers(chatId);return sendMessage(chatId,`🏆 10 ANGGOTA TERAKTIF
━━━━━━━━━━━━━━━━
${rows.map((x,i)=>`${i+1}. ${displayName(x)} — ${x.total_messages} pesan`).join("\n")||"Belum ada aktivitas yang tercatat."}`);}
 if(cmd==="/inactive"){const s=await getGroupSettings(chatId),days=Math.max(1,Math.ceil(s.evaluation_seconds/86400)),rows=await getInactiveMembers(chatId,days);return sendMessage(chatId,`💤 ANGGOTA TIDAK AKTIF
━━━━━━━━━━━━━━━━
⏱ Batas tidak aktif: ${durationLabel(s.evaluation_seconds)}
👥 Ditemukan: ${rows.length} anggota

${rows.map(x=>`• ${displayName(x)}`).join("\n")||"✅ Tidak ada anggota yang terdeteksi tidak aktif."}`);}
 if(cmd==="/report"){const [s,report]=await Promise.all([getGroupSettings(chatId),getGroupReport(chatId)]);return sendMessage(chatId,`📊 RINGKASAN GRUP
━━━━━━━━━━━━━━━━
👥 Anggota tercatat   ${report.member_count}
💬 Total pesan        ${report.total_messages}

⚙️ ATURAN GRUP
🎯 Target minimal     ${s.min_messages} pesan
⏱ Periode penilaian  ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi member   ${durationLabel(s.newcomer_grace_seconds)}`);}
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
