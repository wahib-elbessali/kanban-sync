import { DISCORD_GUILD_ID } from "./config.js";

const discordBotToken = process.env.DISCORD_BOT_TOKEN;

const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Discord's API occasionally has transient blips (upstream 502/503, dropped
// connections) that have nothing to do with our request being wrong - retry
// those a few times with backoff instead of failing the whole sync run.
async function discordFetch(path, options = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(`https://discord.com/api/v10${path}`, {
      ...options,
      headers: {
        Authorization: `Bot ${discordBotToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    if (attempt > MAX_RETRIES) throw err;
    const delay = 500 * 2 ** (attempt - 1);
    console.warn(`Discord ${options.method ?? "GET"} ${path} network error (attempt ${attempt}/${MAX_RETRIES}): ${err.message} - retrying in ${delay}ms`);
    await sleep(delay);
    return discordFetch(path, options, attempt + 1);
  }

  if (!res.ok) {
    if (RETRYABLE_STATUS_CODES.has(res.status) && attempt <= MAX_RETRIES) {
      let delay = 500 * 2 ** (attempt - 1);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter) delay = retryAfter * 1000;
      }
      console.warn(`Discord ${options.method ?? "GET"} ${path} failed: ${res.status} (attempt ${attempt}/${MAX_RETRIES}) - retrying in ${delay}ms`);
      await sleep(delay);
      return discordFetch(path, options, attempt + 1);
    }
    throw new Error(`Discord ${options.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getThread(threadId) {
  return discordFetch(`/channels/${threadId}`);
}

export async function getChannel(channelId) {
  return discordFetch(`/channels/${channelId}`);
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

export async function unarchiveThread(threadId) {
  await discordFetch(`/channels/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: false, locked: false }),
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
