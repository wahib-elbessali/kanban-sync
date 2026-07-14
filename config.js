export const DISCORD_GUILD_ID = "1526058211596177430";
export const FEATURES_CHANNEL_ID = "1526389794840645663";

export const GITHUB_OWNER = "wahib-elbessali";
export const GITHUB_REPO = "smartagency";

export const DISCORD_STATUS_TAGS = {
  todo: "1526393391489749128",
  "in-progress": "1526393391489749129",
  done: "1526393391489749130",
};

export const DISCORD_LAYER_TAGS = {
  foundation: "1526393391489749131",
  backend: "1526393391544271030",
  frontend: "1526393391544271031",
};

export const GITHUB_PROJECT_ID = "PVT_kwHOC9nja84BdUq_";
export const GITHUB_STATUS_FIELD_ID = "PVTSSF_lAHOC9nja84BdUq_zhX3BPY";

export const GITHUB_STATUS_OPTIONS = {
  todo: "f75ad846",
  "in-progress": "47fc9ee4",
  done: "98236657",
};

export const LAYERS = ["foundation", "backend", "frontend"];

export const DISCORD_TAG_TO_STATUS = Object.fromEntries(
  Object.entries(DISCORD_STATUS_TAGS).map(([status, id]) => [id, status])
);

export const DISCORD_TAG_TO_LAYER = Object.fromEntries(
  Object.entries(DISCORD_LAYER_TAGS).map(([layer, id]) => [id, layer])
);

export const GITHUB_OPTION_TO_STATUS = Object.fromEntries(
  Object.entries(GITHUB_STATUS_OPTIONS).map(([status, id]) => [id, status])
);
