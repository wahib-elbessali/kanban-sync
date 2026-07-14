import {
  DISCORD_STATUS_TAGS,
  DISCORD_TAG_TO_STATUS,
  GITHUB_PROJECT_ID,
  GITHUB_STATUS_FIELD_ID,
  GITHUB_STATUS_OPTIONS,
  GITHUB_OPTION_TO_STATUS,
} from "./config.js";
import { getItemStatusOptionId, setItemStatusOptionId } from "./github.js";
import { getThreadTags, setThreadTags } from "./discordRest.js";
import { loadState, saveState } from "./state.js";

function statusFromTags(tags) {
  for (const tagId of tags) {
    if (DISCORD_TAG_TO_STATUS[tagId]) return DISCORD_TAG_TO_STATUS[tagId];
  }
  return null;
}

async function pushToGithub(record, status) {
  await setItemStatusOptionId(GITHUB_PROJECT_ID, record.githubItemId, GITHUB_STATUS_FIELD_ID, GITHUB_STATUS_OPTIONS[status]);
}

async function pushToDiscord(record, status, currentDiscordTags) {
  const statusTagIds = Object.values(DISCORD_STATUS_TAGS);
  const keptTags = currentDiscordTags.filter((t) => !statusTagIds.includes(t));
  await setThreadTags(record.discordThreadId, [...keptTags, DISCORD_STATUS_TAGS[status]]);
}

async function syncRecord(record) {
  const [discordTags, githubOptionId] = await Promise.all([
    getThreadTags(record.discordThreadId),
    getItemStatusOptionId(record.githubItemId),
  ]);

  const discordStatus = statusFromTags(discordTags);
  const githubStatus = githubOptionId ? GITHUB_OPTION_TO_STATUS[githubOptionId] : null;

  if (discordStatus === githubStatus) {
    if (discordStatus && discordStatus !== record.lastStatus) {
      record.lastStatus = discordStatus;
      return true;
    }
    return false;
  }

  const discordChanged = discordStatus && discordStatus !== record.lastStatus;
  const githubChanged = githubStatus && githubStatus !== record.lastStatus;

  if (discordChanged && !githubChanged) {
    console.log(`[discord->github] ${record.feature}: ${record.lastStatus} -> ${discordStatus}`);
    await pushToGithub(record, discordStatus);
    record.lastStatus = discordStatus;
    return true;
  }

  if (githubChanged && !discordChanged) {
    console.log(`[github->discord] ${record.feature}: ${record.lastStatus} -> ${githubStatus}`);
    await pushToDiscord(record, githubStatus, discordTags);
    record.lastStatus = githubStatus;
    return true;
  }

  if (discordChanged && githubChanged) {
    // Both sides changed since the last sync, to different values - conflict.
    // GitHub (the visual board) wins; Discord tags get overwritten to match.
    console.warn(`[conflict] ${record.feature}: discord=${discordStatus} github=${githubStatus} - GitHub wins`);
    await pushToDiscord(record, githubStatus, discordTags);
    record.lastStatus = githubStatus;
    return true;
  }

  return false;
}

async function main() {
  const records = loadState();
  let changed = false;

  for (const record of records) {
    try {
      const recordChanged = await syncRecord(record);
      changed = changed || recordChanged;
    } catch (err) {
      console.error(`[error] ${record.feature}:`, err.message);
    }
  }

  if (changed) {
    saveState(records);
    console.log("State updated.");
  } else {
    console.log("No changes.");
  }
}

main();
