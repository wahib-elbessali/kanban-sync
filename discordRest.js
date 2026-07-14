import { DISCORD_GUILD_ID } from "./config.js";

const discordBotToken = process.env.DISCORD_BOT_TOKEN;

async function discordFetch(path, options = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${discordBotToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Discord ${options.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getThread(threadId) {
  return discordFetch(`/channels/${threadId}`);
}

export async function getThreadTags(threadId) {
  const data = await getThread(threadId);
  return data.applied_tags ?? [];
}

export async function setThreadTags(threadId, tagIds) {
  await discordFetch(`/channels/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ applied_tags: tagIds }),
  });
}

export async function setThreadName(threadId, name) {
  await discordFetch(`/channels/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function archiveThread(threadId) {
  await discordFetch(`/channels/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true, locked: true }),
  });
}

export async function getStarterMessage(threadId) {
  return discordFetch(`/channels/${threadId}/messages/${threadId}`);
}

export async function editStarterMessage(threadId, content) {
  await discordFetch(`/channels/${threadId}/messages/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function listActiveFeatureThreads(featuresChannelId) {
  const data = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/threads/active`);
  return data.threads.filter((t) => t.parent_id === featuresChannelId);
}

export async function listArchivedFeatureThreads(featuresChannelId) {
  const data = await discordFetch(`/channels/${featuresChannelId}/threads/archived/public?limit=100`);
  return data.threads;
}

export async function createFeaturePost(featuresChannelId, name, content, tagIds) {
  const thread = await discordFetch(`/channels/${featuresChannelId}/threads`, {
    method: "POST",
    body: JSON.stringify({
      name,
      applied_tags: tagIds,
      message: { content },
    }),
  });
  return thread.id;
}
