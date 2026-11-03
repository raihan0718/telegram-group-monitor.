const token = () => Deno.env.get("TELEGRAM_BOT_TOKEN")!;
export async function sendMessage(chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) throw new Error(`telegram_send_failed:${response.status}`);
}

export async function isGroupAdmin(chatId: number, userId: number): Promise<boolean> {
  const response = await fetch(`https://api.telegram.org/bot${token()}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: userId }),
  });
  if (!response.ok) throw new Error(`telegram_get_chat_member_failed:${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error("telegram_get_chat_member_rejected");
  const status = result.result?.status;
  return status === "creator" || status === "administrator";
}
