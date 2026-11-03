const base = () => Deno.env.get("SUPABASE_URL")!;
const key = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: {
    apikey: key(), authorization: `Bearer ${key()}`, "content-type": "application/json", ...init.headers,
  }});
  if (!response.ok) throw new Error(`database_error:${response.status}:${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
export async function recordMessage(m: { chatId:number; userId:number; username?:string; firstName:string; lastName?:string; messageId:number; date:string }) {
  return rest("rpc/record_group_message", { method:"POST", body:JSON.stringify({
    p_chat_id:m.chatId,p_user_id:m.userId,p_username:m.username??null,p_first_name:m.firstName,
    p_last_name:m.lastName??null,p_message_id:m.messageId,p_message_date:m.date,
  })});
}
export async function getMembers(chatId:number) {
  return await rest(`group_members?chat_id=eq.${chatId}&select=user_id,username,first_name,total_messages,last_seen_at&order=total_messages.desc`) as Array<{
    user_id:number; username:string|null; first_name:string; total_messages:number; last_seen_at:string;
  }>;
}
