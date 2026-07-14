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
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

export async function getItemStatusOptionId(itemId) {
  const data = await graphql(
    `query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue {
              optionId
            }
          }
        }
      }
    }`,
    { itemId }
  );
  return data.node?.fieldValueByName?.optionId ?? null;
}

export async function setItemStatusOptionId(projectId, itemId, fieldId, optionId) {
  await graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId, optionId }
  );
}
