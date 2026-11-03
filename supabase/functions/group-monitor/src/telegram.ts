const token = () => Deno.env.get("TELEGRAM_BOT_TOKEN")!;
export async function sendMessage(chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) throw new Error(`telegram_send_failed:${response.status}`);
}
