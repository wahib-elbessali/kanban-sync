const discordBotToken = process.env.DISCORD_BOT_TOKEN;

export async function getThreadTags(threadId) {
  const res = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
    headers: { Authorization: `Bot ${discordBotToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord GET ${threadId} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.applied_tags ?? [];
}

export async function setThreadTags(threadId, tagIds) {
  const res = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${discordBotToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ applied_tags: tagIds }),
  });
  if (!res.ok) {
    throw new Error(`Discord PATCH ${threadId} failed: ${res.status} ${await res.text()}`);
  }
}
