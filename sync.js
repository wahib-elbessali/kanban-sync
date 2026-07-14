import {
  FEATURES_CHANNEL_ID,
  DISCORD_STATUS_TAGS,
  DISCORD_LAYER_TAGS,
  DISCORD_TAG_TO_STATUS,
  DISCORD_TAG_TO_LAYER,
  GITHUB_PROJECT_ID,
  GITHUB_STATUS_FIELD_ID,
  GITHUB_STATUS_OPTIONS,
  GITHUB_OPTION_TO_STATUS,
  LAYERS,
} from "./config.js";
import {
  getThreadTags,
  setThreadTags,
  setThreadName,
  archiveThread,
  getStarterMessage,
  editStarterMessage,
  listActiveFeatureThreads,
  listArchivedFeatureThreads,
  createFeaturePost,
} from "./discordRest.js";
import {
  listProjectItems,
  setItemStatusOptionId,
  createIssue,
  updateIssue,
  closeIssue,
  addIssueToProject,
} from "./github.js";
import { loadState, saveState } from "./state.js";

function statusFromTags(tagIds) {
  for (const id of tagIds) if (DISCORD_TAG_TO_STATUS[id]) return DISCORD_TAG_TO_STATUS[id];
  return null;
}

function layersFromTags(tagIds) {
  return tagIds.map((id) => DISCORD_TAG_TO_LAYER[id]).filter(Boolean);
}

function layersFromLabels(labelNodes) {
  const names = labelNodes.map((l) => l.name);
  return LAYERS.filter((l) => names.includes(l));
}

async function fetchDiscordThreads() {
  const [active, archived] = await Promise.all([
    listActiveFeatureThreads(FEATURES_CHANNEL_ID),
    listArchivedFeatureThreads(FEATURES_CHANNEL_ID),
  ]);
  const all = [...active.map((t) => ({ ...t, archived: false })), ...archived.map((t) => ({ ...t, archived: true }))];
  return new Map(all.map((t) => [t.id, t]));
}

async function fetchGithubItems() {
  const items = await listProjectItems(GITHUB_PROJECT_ID);
  return new Map(items.map((i) => [i.id, i]));
}

async function handleDeletions(records, discordThreads, githubItems) {
  const survivors = [];
  let changed = false;

  for (const record of records) {
    const thread = discordThreads.get(record.discordThreadId);
    const item = githubItems.get(record.githubItemId);
    const discordDeleted = !thread || thread.archived;
    const githubDeleted = !item || item.content.state === "CLOSED";

    if (!discordDeleted && !githubDeleted) {
      survivors.push(record);
      continue;
    }

    changed = true;
    if (discordDeleted && !githubDeleted) {
      console.log(`[delete: discord->github] ${record.feature}`);
      await closeIssue(record.githubIssueNumber);
    } else if (githubDeleted && !discordDeleted) {
      console.log(`[delete: github->discord] ${record.feature}`);
      await archiveThread(record.discordThreadId);
    } else {
      console.log(`[delete: both sides already gone] ${record.feature} - cleaning up state`);
    }
  }

  return { survivors, changed };
}

async function syncStatusAndEdits(records, discordThreads, githubItems) {
  let changed = false;

  for (const record of records) {
    const thread = discordThreads.get(record.discordThreadId);
    const item = githubItems.get(record.githubItemId);

    // --- status ---
    const discordStatus = statusFromTags(thread.applied_tags ?? []);
    const optionId = item.fieldValueByName?.optionId;
    const githubStatus = optionId ? GITHUB_OPTION_TO_STATUS[optionId] : null;
    const discordStatusChanged = discordStatus && discordStatus !== record.lastStatus;
    const githubStatusChanged = githubStatus && githubStatus !== record.lastStatus;

    if (discordStatusChanged && githubStatusChanged && discordStatus !== githubStatus) {
      console.warn(`[conflict: status] ${record.feature}: discord=${discordStatus} github=${githubStatus} - GitHub wins`);
      await pushStatusToDiscord(record, githubStatus, thread.applied_tags);
      record.lastStatus = githubStatus;
      changed = true;
    } else if (discordStatusChanged) {
      console.log(`[discord->github] ${record.feature} status: ${record.lastStatus} -> ${discordStatus}`);
      await setItemStatusOptionId(GITHUB_PROJECT_ID, record.githubItemId, GITHUB_STATUS_FIELD_ID, GITHUB_STATUS_OPTIONS[discordStatus]);
      record.lastStatus = discordStatus;
      changed = true;
    } else if (githubStatusChanged) {
      console.log(`[github->discord] ${record.feature} status: ${record.lastStatus} -> ${githubStatus}`);
      await pushStatusToDiscord(record, githubStatus, thread.applied_tags);
      record.lastStatus = githubStatus;
      changed = true;
    }

    // --- title ---
    const discordTitle = thread.name;
    const githubTitle = item.content.title;
    const discordTitleChanged = discordTitle !== record.lastTitle;
    const githubTitleChanged = githubTitle !== record.lastTitle;

    if (discordTitleChanged && githubTitleChanged && discordTitle !== githubTitle) {
      console.warn(`[conflict: title] ${record.feature} - GitHub wins`);
      await setThreadName(record.discordThreadId, githubTitle);
      record.lastTitle = githubTitle;
      record.feature = githubTitle;
      changed = true;
    } else if (discordTitleChanged) {
      console.log(`[discord->github] title: "${record.lastTitle}" -> "${discordTitle}"`);
      await updateIssue(record.githubIssueNumber, { title: discordTitle });
      record.lastTitle = discordTitle;
      record.feature = discordTitle;
      changed = true;
    } else if (githubTitleChanged) {
      console.log(`[github->discord] title: "${record.lastTitle}" -> "${githubTitle}"`);
      await setThreadName(record.discordThreadId, githubTitle);
      record.lastTitle = githubTitle;
      record.feature = githubTitle;
      changed = true;
    }

    // --- body/description ---
    const starter = await getStarterMessage(record.discordThreadId);
    const discordBody = starter.content ?? "";
    const githubBody = item.content.body ?? "";
    const discordBodyChanged = discordBody !== record.lastBody;
    const githubBodyChanged = githubBody !== record.lastBody;

    if (discordBodyChanged && githubBodyChanged && discordBody !== githubBody) {
      console.warn(`[conflict: body] ${record.feature} - GitHub wins`);
      await editStarterMessage(record.discordThreadId, githubBody);
      record.lastBody = githubBody;
      changed = true;
    } else if (discordBodyChanged) {
      console.log(`[discord->github] body updated: ${record.feature}`);
      await updateIssue(record.githubIssueNumber, { body: discordBody });
      record.lastBody = discordBody;
      changed = true;
    } else if (githubBodyChanged) {
      console.log(`[github->discord] body updated: ${record.feature}`);
      await editStarterMessage(record.discordThreadId, githubBody);
      record.lastBody = githubBody;
      changed = true;
    }
  }

  return changed;
}

async function pushStatusToDiscord(record, status, currentTags) {
  const statusTagIds = Object.values(DISCORD_STATUS_TAGS);
  const kept = currentTags.filter((t) => !statusTagIds.includes(t));
  await setThreadTags(record.discordThreadId, [...kept, DISCORD_STATUS_TAGS[status]]);
}

async function handleAdditions(records, discordThreads, githubItems) {
  let changed = false;
  const mappedDiscordIds = new Set(records.map((r) => r.discordThreadId));
  const mappedGithubItemIds = new Set(records.map((r) => r.githubItemId));

  const newDiscordThreads = [...discordThreads.values()].filter((t) => !t.archived && !mappedDiscordIds.has(t.id));
  const newGithubItems = [...githubItems.values()].filter((i) => i.content.state === "OPEN" && !mappedGithubItemIds.has(i.id));

  for (const thread of newDiscordThreads) {
    changed = true;
    // idempotency: does a matching open github item with the same title already exist?
    const match = newGithubItems.find((i) => i.content.title === thread.name && !mappedGithubItemIds.has(i.id));
    const starter = await getStarterMessage(thread.id);
    const body = starter.content ?? "";
    const status = statusFromTags(thread.applied_tags ?? []) ?? "todo";
    const layers = layersFromTags(thread.applied_tags ?? []);

    if (match) {
      console.log(`[link existing] ${thread.name} (matched by title, not creating a duplicate)`);
      mappedGithubItemIds.add(match.id);
      records.push({
        feature: thread.name,
        discordThreadId: thread.id,
        githubIssueNumber: match.content.number,
        githubItemId: match.id,
        lastStatus: status,
        lastTitle: thread.name,
        lastBody: body,
      });
      continue;
    }

    console.log(`[add: discord->github] ${thread.name}`);
    const issue = await createIssue(thread.name, body, layers);
    const itemId = await addIssueToProject(GITHUB_PROJECT_ID, issue.node_id);
    await setItemStatusOptionId(GITHUB_PROJECT_ID, itemId, GITHUB_STATUS_FIELD_ID, GITHUB_STATUS_OPTIONS[status]);
    records.push({
      feature: thread.name,
      discordThreadId: thread.id,
      githubIssueNumber: issue.number,
      githubItemId: itemId,
      lastStatus: status,
      lastTitle: thread.name,
      lastBody: body,
    });
  }

  for (const item of newGithubItems) {
    if (mappedGithubItemIds.has(item.id)) continue; // consumed by a title-match above
    changed = true;
    console.log(`[add: github->discord] ${item.content.title}`);
    const status = item.fieldValueByName?.optionId ? GITHUB_OPTION_TO_STATUS[item.fieldValueByName.optionId] ?? "todo" : "todo";
    const layers = layersFromLabels(item.content.labels?.nodes ?? []);
    const tagIds = [DISCORD_STATUS_TAGS[status], ...layers.map((l) => DISCORD_LAYER_TAGS[l])];
    const body = item.content.body ?? "(no description)";
    const threadId = await createFeaturePost(FEATURES_CHANNEL_ID, item.content.title, body, tagIds);
    records.push({
      feature: item.content.title,
      discordThreadId: threadId,
      githubIssueNumber: item.content.number,
      githubItemId: item.id,
      lastStatus: status,
      lastTitle: item.content.title,
      lastBody: item.content.body ?? "",
    });
  }

  return changed;
}

async function main() {
  const records = loadState();
  let discordThreads = await fetchDiscordThreads();
  let githubItems = await fetchGithubItems();

  const { survivors, changed: deleteChanged } = await handleDeletions(records, discordThreads, githubItems);

  if (deleteChanged) {
    // Deletions just mutated the other side (archived a thread / closed an issue) -
    // the snapshots above are now stale, refetch so later passes don't act on
    // pre-mutation data (this is exactly what caused the duplicate-issue bug).
    discordThreads = await fetchDiscordThreads();
    githubItems = await fetchGithubItems();
  }

  const editChanged = await syncStatusAndEdits(survivors, discordThreads, githubItems);
  const addChanged = await handleAdditions(survivors, discordThreads, githubItems);

  if (deleteChanged || editChanged || addChanged) {
    saveState(survivors);
    console.log("State updated.");
  } else {
    console.log("No changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
