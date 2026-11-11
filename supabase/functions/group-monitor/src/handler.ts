import { addAutokickExclusion, getAutokickExclusions, getCandidates, getGroupSettings, getGroupReport, getInactiveMembers, getTopMembers, getMonitoredGroupIds, recordMemberJoin, recordMessage, removeAutokickExclusion, updateGroupSetting } from "./database.ts";
import { isGroupAdmin, kickMember, sendMessage } from "./telegram.ts";

type User={id:number;is_bot?:boolean;username?:string;first_name?:string;last_name?:string};
type Chat={id:number;type:string;title?:string};
type Message={message_id:number;date:number;chat:Chat;from?:User;text?:string;new_chat_members?:User[];message_thread_id?:number};
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
 catch{await sendMessage(m.chat.id,"⚠️ VERIFIKASI ADMIN GAGAL\n\nPastikan bot memiliki status admin di grup, lalu coba lagi.",undefined,m.message_thread_id);return false;}
}
async function broadcastFromOwner(m:Message){
 const id=ownerId();if(!id||String(m.from?.id)!==id||!m.text?.trim())return;
 const groups=await getMonitoredGroupIds();if(!groups.length)return sendMessage(m.chat.id,"Belum ada grup yang tercatat.");
 let success=0,failed=0;for(const chatId of groups){try{await sendMessage(chatId,m.text);success++;}catch{failed++;}}
 return sendMessage(m.chat.id,`📣 BROADCAST SELESAI
━━━━━━━━━━━━━━━━
✅ Berhasil  ${success} grup
⚠️ Gagal     ${failed} grup`);
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
async function showSettings(chatId:number,threadId?:number){
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
M = bulan  •  y = tahun`,undefined,threadId);
}
function normalizeUsername(value:string){return value.replace(/^@/,"").trim().toLowerCase();}
function validUsername(value:string){return /^[a-z0-9_]{5,32}$/i.test(normalizeUsername(value));}
async function getKickCandidates(chatId:number,s:Awaited<ReturnType<typeof getGroupSettings>>){
 const [rows,excluded]=await Promise.all([getCandidates(chatId,s),getAutokickExclusions(chatId)]);
 const set=new Set(excluded.map(normalizeUsername));
 return rows.filter(x=>!x.username||!set.has(normalizeUsername(x.username)));
}
async function showKickPreview(chatId:number,threadId?:number){
 const s=await getGroupSettings(chatId),[rows,excluded]=await Promise.all([getKickCandidates(chatId,s),getAutokickExclusions(chatId)]);
 return sendMessage(chatId,`🧹 PRATINJAU AUTO KICK
━━━━━━━━━━━━━━━━
🎯 Target minimal     ${s.min_messages} pesan
⏱ Periode penilaian  ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi member   ${durationLabel(s.newcomer_grace_seconds)}
🛡️ Dikecualikan       ${excluded.length} username\n👥 Calon terdeteksi   ${rows.length}

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"✅ Tidak ada anggota yang masuk kriteria."}

ℹ️ Belum ada anggota yang dikeluarkan.
Periksa daftar di atas sebelum menjalankan /autokick confirm.`,undefined,threadId);
}
async function handleCommand(m:Message){
 if(!m.from)return;
 const parts=(m.text??"").trim().split(/\s+/),cmd=parts[0].split("@")[0].toLowerCase(),arg=parts.slice(1).join(" "),chatId=m.chat.id;
 const reply=(text:string)=>sendMessage(chatId,text,undefined,m.message_thread_id);
 if(cmd==="/start"||cmd==="/help")return reply(helpText);
 if(cmd==="/settings") {
  if(!await requireAdmin(m))return;
  try{return await showSettings(chatId,m.message_thread_id);}
  catch(error){console.error("settings_command_failed",error);return reply("⚠️ PENGATURAN GAGAL DIMUAT\n\nBot tidak dapat membaca konfigurasi grup. Coba lagi beberapa saat.");}
 }
 if(["/setmin","/setperiod","/setgrace","/autokick"].includes(cmd)){if(!await requireAdmin(m))return;}
 if(cmd==="/setmin"||cmd==="/setperiod"||cmd==="/setgrace"){
  const kind=cmd==="/setmin"?"min":cmd==="/setperiod"?"period":"grace";
  if(kind==="min"){
   const value=Number(arg);
   if(!Number.isSafeInteger(value)||value<0||value>2147483647)return reply("⚠️ FORMAT TIDAK VALID\n\nGunakan angka bulat 0 atau lebih.\nContoh: /setmin 25");
   try{
    await updateGroupSetting(chatId,"min_messages",value);
    return reply(`✅ TARGET DIPERBARUI\n━━━━━━━━━━━━━━━━\nTarget minimal: ${value} pesan\n\nPerubahan berhasil disimpan.`);
   }catch(error){console.error("setmin_failed",error);return reply("⚠️ TARGET GAGAL DISIMPAN\n\nPeriksa koneksi database dan izin bot, lalu coba lagi.");}
  }
  const seconds=parseDuration(arg);
  if(seconds===null)return reply("⚠️ FORMAT DURASI TIDAK VALID\n\nContoh penggunaan:\n/setperiod 30m\n/setperiod 12h\n/setperiod 7d\n/setperiod 1M\n\nBerlaku juga untuk /setgrace. m = menit, M = bulan.");
  const field=kind==="period"?"evaluation_seconds":"newcomer_grace_seconds";
  try{
   await updateGroupSetting(chatId,field,seconds);
   return reply(`✅ PENGATURAN DIPERBARUI
━━━━━━━━━━━━━━━━
${kind==="period"?"⏱ Periode penilaian":"🆕 Toleransi member"}: ${durationLabel(seconds)}

Perubahan berhasil disimpan.`);
  }catch(error){console.error("duration_setting_failed",error);const detail=(error instanceof Error?error.message:String(error)).slice(0,350);return reply(`⚠️ PENGATURAN GAGAL DISIMPAN
━━━━━━━━━━━━━━━━
Detail: ${detail}

Coba lagi beberapa saat. Jika masalah berulang, kirim detail ini ke pengelola bot.`);}
 }
 if(cmd==="/kickpreview")return showKickPreview(chatId,m.message_thread_id);
 if(cmd==="/autokick"){
  const [sub,...values]=parts.slice(1);
  if(sub==="exclude"||sub==="include"){
   const username=values[0]??"";
   if(!validUsername(username))return reply("⚠️ FORMAT USERNAME TIDAK VALID\n\nGunakan username Telegram tanpa spasi.\nContoh: /autokick exclude @username");
   const clean=normalizeUsername(username);
   try{
    if(sub==="exclude"){
     await addAutokickExclusion(chatId,clean);
     return reply(`✅ WHITELIST DIPERBARUI\n\n@${clean} sekarang dikecualikan dari Auto Kick.`);
    }
    await removeAutokickExclusion(chatId,clean);
    return reply(`✅ WHITELIST DIPERBARUI\n\n@${clean} dihapus dari pengecualian Auto Kick.`);
   }catch(error){console.error("autokick_exclusion_update_failed",error);return reply("⚠️ DAFTAR PENGECUALIAN GAGAL DIPERBARUI. Coba lagi.");}
  }
  if(sub==="list"){
   const excluded=await getAutokickExclusions(chatId);
   return reply("🛡️ WHITELIST AUTO KICK\n━━━━━━━━━━━━━━━━\n"+(excluded.map(x=>"• @"+x).join("\n")||"Belum ada username yang dikecualikan."));
  }
  if(sub!=="confirm")return reply("🛡️ PENGATURAN AUTO KICK\n━━━━━━━━━━━━━━━━\n/autokick exclude @username — tambahkan pengecualian\n/autokick include @username — hapus pengecualian\n/autokick list — lihat daftar pengecualian\n/kickpreview — pratinjau calon kick\n/autokick confirm — jalankan Auto Kick");
  const s=await getGroupSettings(chatId),rows=await getKickCandidates(chatId,s),excluded=await getAutokickExclusions(chatId);
  let done=0,failed=0;
  for(const member of rows.slice(0,50)){try{await kickMember(chatId,member.user_id);done++;}catch{failed++;}}
  return reply(`🧹 AUTO KICK SELESAI
━━━━━━━━━━━━━━━━
✅ Berhasil dikeluarkan  ${done}
⚠️ Gagal                 ${failed}
🛡️ Username dikecualikan ${excluded.length}
📋 Batas pemrosesan      50 anggota

Silakan periksa kembali daftar anggota grup.`);
 }
 if(cmd==="/inactiveperson"||cmd==="/candidates"){
  const s=await getGroupSettings(chatId),rows=await getCandidates(chatId,s);
  return reply(`👤 DAFTAR INACTIVE PERSON
━━━━━━━━━━━━━━━━
⏱ Periode   ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi ${durationLabel(s.newcomer_grace_seconds)}
🎯 Target    ${s.min_messages} pesan
👥 Ditemukan ${rows.length} anggota

${rows.slice(0,50).map(x=>`• ${displayName(x)} — ${x.period_messages}/${s.min_messages} pesan`).join("\n")||"✅ Tidak ada anggota yang masuk kriteria."}`);
 }
 if(cmd==="/top"){const rows=await getTopMembers(chatId);return reply(`🏆 10 ANGGOTA TERAKTIF
━━━━━━━━━━━━━━━━
${rows.map((x,i)=>`${i+1}. ${displayName(x)} — ${x.total_messages} pesan`).join("\n")||"Belum ada aktivitas yang tercatat."}`);}
 if(cmd==="/inactive"){const s=await getGroupSettings(chatId),days=Math.max(1,Math.ceil(s.evaluation_seconds/86400)),rows=await getInactiveMembers(chatId,days);return reply(`💤 ANGGOTA TIDAK AKTIF
━━━━━━━━━━━━━━━━
⏱ Batas tidak aktif: ${durationLabel(s.evaluation_seconds)}
👥 Ditemukan: ${rows.length} anggota

${rows.map(x=>`• ${displayName(x)}`).join("\n")||"✅ Tidak ada anggota yang terdeteksi tidak aktif."}`);}
 if(cmd==="/report"){const [s,report]=await Promise.all([getGroupSettings(chatId),getGroupReport(chatId)]);return reply(`📊 RINGKASAN GRUP
━━━━━━━━━━━━━━━━
👥 Anggota tercatat   ${report.member_count}
💬 Total pesan        ${report.total_messages}

⚙️ ATURAN GRUP
🎯 Target minimal     ${s.min_messages} pesan
⏱ Periode penilaian  ${durationLabel(s.evaluation_seconds)}
🆕 Toleransi member   ${durationLabel(s.newcomer_grace_seconds)}`);}
}
async function handlePrivateMessage(m:Message){
 if(!m.from||m.from.is_bot)return;
 const text=m.text?.trim()??"";
 if(!text.startsWith("/"))return broadcastFromOwner(m);
 const cmd=text.split(/\s+/)[0].split("@")[0].toLowerCase();
 if(cmd==="/start"||cmd==="/help")return sendMessage(m.chat.id,`👋 SELAMAT DATANG DI GROUP MONITOR
━━━━━━━━━━━━━━━━

Bot ini membantu admin memantau aktivitas anggota grup, melihat laporan, dan mengelola Auto Kick berdasarkan aturan grup.

📌 CARA PAKAI
1. Tambahkan bot ke grup Telegram.
2. Berikan izin admin yang diperlukan.
3. Gunakan perintah langsung di grup tersebut.

⚠️ KHUSUS PERINTAH GRUP
Pengaturan dan pemantauan hanya bisa dijalankan di dalam grup. Buka grup yang ingin dikelola, lalu kirim /help untuk melihat daftar perintah.

Contoh: /settings untuk melihat konfigurasi grup.

📌 PENGINGAT: bot hanya mencatat aktivitas sejak bot bergabung ke grup. Riwayat pesan sebelumnya tidak tersedia.

Butuh bantuan? Hubungi @Ipnexoraa`);
 if(cmd==="/settings")return sendMessage(m.chat.id,"⚙️ PERINTAH KHUSUS GRUP\n━━━━━━━━━━━━━━━━\n/settings hanya bisa digunakan di dalam grup Telegram.\n\nBuka grup yang ingin dikelola, lalu kirim /settings di sana.");
 const groupOnly=["/setmin","/setperiod","/setgrace","/report","/top","/inactive","/inactiveperson","/candidates","/kickpreview","/autokick"];
 if(groupOnly.includes(cmd))return sendMessage(m.chat.id,"📍 PERINTAH INI HANYA BERLAKU DI GRUP\n━━━━━━━━━━━━━━━━\nPerintah tersebut harus dikirim langsung di grup yang ingin dikelola.\n\nBuka grup tujuan, lalu jalankan perintah di sana. Ketik /help di grup untuk melihat panduan lengkap.");
 return sendMessage(m.chat.id,"Perintah tidak dikenali. Ketik /help untuk melihat panduan penggunaan bot.");
}
async function onboarding(chatId:number){return sendMessage(chatId,`👋 GROUP MONITOR AKTIF
━━━━━━━━━━━━━━━━

Bot berhasil bergabung dan siap mencatat aktivitas grup.

Ketik /help untuk melihat daftar perintah dan panduan penggunaan.

📌 PENGINGAT PEMANTAUAN
Pesan hanya dihitung sejak bot bergabung. Riwayat sebelumnya tidak tersedia, sehingga anggota lama yang belum tercatat tidak otomatis dianggap tidak aktif.
Bantuan: @Ipnexoraa`);}
export async function handleUpdate(update:Update){
 if(update.my_chat_member){
  const u=update.my_chat_member,old=u.old_chat_member.status,next=u.new_chat_member.status;
  if(["left","kicked"].includes(old)&&["member","administrator"].includes(next))return onboarding(u.chat.id);
  return;
 }
 const m=update.message;if(!m)return;
 if(m.chat.type==="private")return handlePrivateMessage(m);
 if(m.chat.type!=="group"&&m.chat.type!=="supergroup")return;
 if(m.new_chat_members?.length){
  const joined:string[]=[];
  for(const u of m.new_chat_members){
   if(u.is_bot)continue;
   await recordMemberJoin({chatId:m.chat.id,userId:u.id,username:u.username,firstName:u.first_name??"",lastName:u.last_name,joinedAt:new Date(m.date*1000).toISOString()});
   joined.push(u.username?"@"+u.username:u.first_name??"Anggota baru");
  }
  if(joined.length){
   await sendMessage(m.chat.id,"👋 SELAMAT DATANG "+joined.join(", ")+"\n\n📌 PENGINGAT PEMANTAUAN\nAktivitas pesan hanya dihitung sejak bot bergabung dan mulai memantau grup. Riwayat sebelumnya tidak tersedia, jadi anggota lama yang belum tercatat tidak otomatis dianggap tidak aktif.",undefined,m.message_thread_id);
  }
 }
 if(!m.from||m.from.is_bot)return;
 if(m.text?.startsWith("/"))return handleCommand(m);
 await recordMessage({chatId:m.chat.id,userId:m.from.id,username:m.from.username,firstName:m.from.first_name??"",lastName:m.from.last_name,messageId:m.message_id,date:new Date(m.date*1000).toISOString()});
}
