const base = () => Deno.env.get("SUPABASE_URL")!;
const key = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: {
    apikey: key(), authorization: `Bearer ${key()}`, "content-type": "application/json", ...init.headers,
  }});
  if (!response.ok) throw new Error(`database_error:${response.status}:${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
export type GroupSettings = { min_messages:number; evaluation_days:number; newcomer_grace_days:number };
const defaults:GroupSettings={min_messages:20,evaluation_days:7,newcomer_grace_days:7};
export async function getGroupSettings(chatId:number):Promise<GroupSettings>{
  const rows=await rest(`group_settings?chat_id=eq.${chatId}&select=min_messages,evaluation_days,newcomer_grace_days&limit=1`) as GroupSettings[];
  if(rows[0]) return rows[0];
  await rest("group_settings",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({chat_id:chatId})});
  return defaults;
}
export async function updateGroupSetting(chatId:number,field:"min_messages"|"evaluation_days"|"newcomer_grace_days",value:number){
  const body={chat_id:chatId,[field]:value,updated_at:new Date().toISOString()};
  return rest("group_settings",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(body)});
}
export async function recordMemberJoin(m:{chatId:number;userId:number;username?:string;firstName:string;lastName?:string;joinedAt:string}){
  return rest("rpc/record_group_member_join",{method:"POST",body:JSON.stringify({p_chat_id:m.chatId,p_user_id:m.userId,p_username:m.username??null,p_first_name:m.firstName,p_last_name:m.lastName??null,p_joined_at:m.joinedAt})});
}
export async function getCandidates(chatId:number,s:GroupSettings){
  return await rest("rpc/get_group_inactive_people",{method:"POST",body:JSON.stringify({p_chat_id:chatId,p_min_messages:s.min_messages,p_evaluation_days:s.evaluation_days,p_grace_days:s.newcomer_grace_days})}) as Array<{user_id:number;username:string|null;first_name:string;period_messages:number;joined_at:string}>;
}
export async function getTestCandidates(chatId:number,s:GroupSettings){
  return await rest("rpc/get_group_test_inactive_people",{method:"POST",body:JSON.stringify({p_chat_id:chatId,p_min_messages:s.min_messages,p_evaluation_days:s.evaluation_days,p_grace_minutes:1})}) as Array<{user_id:number;username:string|null;first_name:string;period_messages:number;joined_at:string}>;
}
export async function recordMessage(m: { chatId:number; userId:number; username?:string; firstName:string; lastName?:string; messageId:number; date:string }) {
  return rest("rpc/record_group_message", { method:"POST", body:JSON.stringify({
    p_chat_id:m.chatId,p_user_id:m.userId,p_username:m.username??null,p_first_name:m.firstName,
    p_last_name:m.lastName??null,p_message_id:m.messageId,p_message_date:m.date,
  })});
}
export async function getTopMembers(chatId:number) {
  return await rest(`rpc/get_group_top_members`, {method:"POST",body:JSON.stringify({p_chat_id:chatId,p_limit:10})}) as Array<{user_id:number;username:string|null;first_name:string;total_messages:number;last_seen_at:string}>;
}
export async function getInactiveMembers(chatId:number,days:number) {
  return await rest(`rpc/get_group_inactive_members`, {method:"POST",body:JSON.stringify({p_chat_id:chatId,p_days:days,p_limit:30})}) as Array<{user_id:number;username:string|null;first_name:string;total_messages:number;last_seen_at:string}>;
}
export async function getGroupReport(chatId:number) {
  const rows=await rest(`rpc/get_group_report`, {method:"POST",body:JSON.stringify({p_chat_id:chatId})}) as Array<{member_count:number;total_messages:number}>;
  return rows[0]??{member_count:0,total_messages:0};
}
export async function getMembers(chatId:number) {
  return await rest(`group_members?chat_id=eq.${chatId}&select=user_id,username,first_name,total_messages,last_seen_at&order=total_messages.desc`) as Array<{
    user_id:number; username:string|null; first_name:string; total_messages:number; last_seen_at:string;
  }>;
}
export async function getMonitoredGroupIds(): Promise<number[]> {
  const rows = await rest("group_members?select=chat_id&limit=10000") as Array<{chat_id:number}>;
  return [...new Set(rows.map(row => Number(row.chat_id)))];
}
