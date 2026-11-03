const token = () => Deno.env.get("TELEGRAM_BOT_TOKEN")!;
export type InlineKeyboard = {inline_keyboard:Array<Array<{text:string;callback_data?:string;url?:string}>>};
async function call(method:string,payload:Record<string,unknown>){
  const response=await fetch(`https://api.telegram.org/bot${token()}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(`telegram_${method}_failed:${response.status}:${JSON.stringify(result)}`);
  return result.result;
}
export async function setGroupCommands(){
  return call("setMyCommands",{
    commands:[
      {command:"start",description:"Buka menu utama"},
      {command:"help",description:"Panduan penggunaan bot"},
      {command:"settings",description:"Atur konfigurasi grup"},
      {command:"report",description:"Lihat ringkasan aktivitas grup"},
      {command:"top",description:"Lihat 10 anggota teraktif"},
      {command:"inactive",description:"Lihat anggota yang tidak aktif"},
      {command:"inactiveperson",description:"Lihat anggota yang belum memenuhi target"}
    ],
    scope:{type:"all_group_chats"}
  });
}
export async function sendMessage(chatId:number,text:string,replyMarkup?:InlineKeyboard){
  return call("sendMessage",{chat_id:chatId,text,disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});
}
export async function editMessageText(chatId:number,messageId:number,text:string,replyMarkup?:InlineKeyboard){
  return call("editMessageText",{chat_id:chatId,message_id:messageId,text,disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})});
}
export async function answerCallbackQuery(callbackQueryId:string,text?:string){
  return call("answerCallbackQuery",{callback_query_id:callbackQueryId,...(text?{text}:{})});
}
export async function isGroupAdmin(chatId:number,userId:number):Promise<boolean>{
  const result=await call("getChatMember",{chat_id:chatId,user_id:userId});
  return result.status==="creator"||result.status==="administrator";
}
