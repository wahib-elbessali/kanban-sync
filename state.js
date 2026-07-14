import { readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = new URL("./state.json", import.meta.url);

export function loadState() {
  return JSON.parse(readFileSync(STATE_PATH));
}

export function saveState(records) {
  writeFileSync(STATE_PATH, JSON.stringify(records, null, 2) + "\n");
}
