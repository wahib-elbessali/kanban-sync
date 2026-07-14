import { GITHUB_OWNER, GITHUB_REPO } from "./config.js";

const githubToken = process.env.GH_PAT;

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function rest(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${options.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function listProjectItems(projectId) {
  const data = await graphql(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { optionId }
              }
              content {
                ... on Issue {
                  id
                  number
                  title
                  body
                  state
                  labels(first: 10) { nodes { name } }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId }
  );
  return data.node.items.nodes.filter((n) => n.content);
}

export async function setItemStatusOptionId(projectId, itemId, fieldId, optionId) {
  await graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) { clientMutationId }
    }`,
    { projectId, itemId, fieldId, optionId }
  );
}

export async function createIssue(title, body, labels) {
  return rest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

export async function updateIssue(number, fields) {
  await rest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function closeIssue(number) {
  await updateIssue(number, { state: "closed" });
}

export async function addIssueToProject(projectId, issueNodeId) {
  const data = await graphql(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId: issueNodeId }
  );
  return data.addProjectV2ItemById.item.id;
}
