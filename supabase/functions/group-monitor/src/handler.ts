import { getMembers, recordMessage } from "./database.ts";
import { sendMessage } from "./telegram.ts";
type User = { id:number; is_bot?:boolean; username?:string; first_name?:string; last_name?:string };
type Message = { message_id:number; date:number; chat:{id:number;type:string}; from?:User; text?:string };
const envNumber=(name:string,fallback:number)=>Number(Deno.env.get(name)??fallback);
const admins=()=> (Deno.env.get("TELEGRAM_ADMIN_IDS")??"").split(",").map(x=>x.trim()).filter(Boolean);
const isAdmin=(id:number)=>admins().includes(String(id));
const label=(m:{username:string|null;first_name:string;total_messages:number},i:number)=>`${i+1}. ${m.username?"@"+m.username:m.first_name} — ${m.total_messages} pesan`;
async function command(m:Message) {
  const cmd=(m.text??"").trim().split(/\s+/)[0].split("@")[0].toLowerCase(), chatId=m.chat.id;
  if(cmd==="/help"||cmd==="/start") return sendMessage(chatId,"📊 Group Monitor\n/report — ringkasan aktivitas\n/top — 10 anggota teraktif\n/inactive — anggota tidak aktif\n/candidates — di bawah target (admin)");
  if(!["/report","/top","/inactive","/candidates"].includes(cmd)) return;
  if(cmd==="/candidates"&&(!m.from||!isAdmin(m.from.id))) return sendMessage(chatId,"Perintah ini khusus admin.");
  const members=await getMembers(chatId), min=envNumber("MIN_MESSAGES",20), days=envNumber("INACTIVE_DAYS",7);
  if(cmd==="/top") return sendMessage(chatId,members.slice(0,10).map(label).join("\n")||"Belum ada data.");
  if(cmd==="/inactive") {
    const cutoff=Date.now()-days*86400000, rows=members.filter(x=>new Date(x.last_seen_at).getTime()<cutoff);
    return sendMessage(chatId,rows.slice(0,30).map(x=>`• ${x.username?"@"+x.username:x.first_name}`).join("\n")||`Tidak ada anggota inaktif lebih dari ${days} hari.`);
  }
  if(cmd==="/candidates") {
    const rows=members.filter(x=>x.total_messages<min);
    return sendMessage(chatId,rows.slice(0,50).map(x=>`• ${x.username?"@"+x.username:x.first_name}: ${x.total_messages}/${min}`).join("\n")||"Semua anggota tercatat memenuhi target.");
  }
  const total=members.reduce((sum,x)=>sum+x.total_messages,0);
  return sendMessage(chatId,`📊 Ringkasan grup\nAnggota tercatat: ${members.length}\nTotal pesan tercatat: ${total}\nTarget minimum: ${min} pesan\nPeriode inaktif: ${days} hari`);
}
export async function handleUpdate(update:{message?:Message}) {
  const m=update.message;
  if(!m||m.chat.type==="private"||!m.from||m.from.is_bot) return;
  const target=Deno.env.get("TARGET_GROUP_ID");
  if(target&&String(m.chat.id)!==target) return;
  if(m.text?.startsWith("/")) return await command(m);
  await recordMessage({chatId:m.chat.id,userId:m.from.id,username:m.from.username,firstName:m.from.first_name??"",lastName:m.from.last_name,messageId:m.message_id,date:new Date(m.date*1000).toISOString()});
}
