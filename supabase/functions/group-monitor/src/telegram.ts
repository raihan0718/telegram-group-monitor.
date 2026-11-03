const token = () => Deno.env.get("TELEGRAM_BOT_TOKEN")!;
export type InlineKeyboard = {inline_keyboard:Array<Array<{text:string;callback_data?:string;url?:string}>>};
export class TelegramApiError extends Error { constructor(message:string, public readonly migrateToChatId?:number) { super(message); } }
export function migrationTarget(error:unknown):number|undefined { return error instanceof TelegramApiError?error.migrateToChatId:undefined; }
async function call(method:string,payload:Record<string,unknown>){
  const response=await fetch(`https://api.telegram.org/bot${token()}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const raw=await response.text(); let result:any;
  try { result=raw?JSON.parse(raw):null; } catch { throw new TelegramApiError(`telegram_${method}_invalid_json:${response.status}:${raw.slice(0,300)}`); }
  if(!response.ok||!result?.ok){const id=Number(result?.parameters?.migrate_to_chat_id);const next=Number.isSafeInteger(id)&&id!==0?id:undefined;throw new TelegramApiError(`telegram_${method}_failed:${response.status}:${raw||"empty_response"}`,next);}
  return result.result;
}
export async function setGroupCommands(){
  const privateCommands=[{command:"start",description:"Mulai dan lihat panduan bot"},{command:"help",description:"Panduan penggunaan bot"}];
  const groupCommands=[...privateCommands,{command:"settings",description:"Lihat konfigurasi grup"},{command:"setmin",description:"Atur target pesan grup"},{command:"setperiod",description:"Atur periode penilaian"},{command:"setgrace",description:"Atur toleransi member baru"},{command:"report",description:"Lihat ringkasan aktivitas grup"},{command:"top",description:"Lihat anggota teraktif"},{command:"inactive",description:"Lihat anggota tidak aktif"},{command:"inactiveperson",description:"Lihat anggota di bawah target pesan"},{command:"kickpreview",description:"Pratinjau calon Auto Kick"},{command:"autokick",description:"Jalankan Auto Kick setelah konfirmasi"}];
  await call("setMyCommands",{commands:privateCommands,scope:{type:"default"}});
  await call("setMyCommands",{commands:privateCommands,scope:{type:"all_private_chats"}});
  return call("setMyCommands",{commands:groupCommands,scope:{type:"all_group_chats"}});
}
export async function sendMessage(chatId:number,text:string,replyMarkup?:InlineKeyboard){return call("sendMessage",{chat_id:chatId,text,disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});}
export async function editMessageText(chatId:number,messageId:number,text:string,replyMarkup?:InlineKeyboard){return call("editMessageText",{chat_id:chatId,message_id:messageId,text,disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});}
export async function answerCallbackQuery(callbackQueryId:string,text?:string){try{return await call("answerCallbackQuery",{callback_query_id:callbackQueryId,...(text?{text}:{})});}catch(error){console.warn("callback_ack_ignored",error instanceof Error?error.message:String(error));return null;}}
export async function isGroupAdmin(chatId:number,userId:number):Promise<boolean>{const result=await call("getChatMember",{chat_id:chatId,user_id:userId});return result.status==="creator"||result.status==="administrator";}
export async function kickMember(chatId:number,userId:number){await call("banChatMember",{chat_id:chatId,user_id:userId});return call("unbanChatMember",{chat_id:chatId,user_id:userId,only_if_banned:true});}
