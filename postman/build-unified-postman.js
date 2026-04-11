const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'postman');
fs.mkdirSync(outDir, { recursive: true });

const foundationCollectionPath = path.join(
  root,
  'FoundationERP',
  'ConstitutionalERP-FoundationERP',
  'postman',
  'FoundationERP.postman_collection.json'
);
const foundationEnvPath = path.join(
  root,
  'FoundationERP',
  'ConstitutionalERP-FoundationERP',
  'postman',
  'FoundationERP.local.postman_environment.json'
);

const clRoot = path.join(root, 'ConstitutionalLayer', 'ConstitutionalERP-ConstitutionalLayer');
const clServices = [
  ['authority-engine', 'AuthorityEngine'],
  ['governance-engine', 'GovernanceEngine'],
  ['mesh-gateway', 'MeshGateway'],
  ['event-processor', 'EventProcessor'],
  ['process-graph', 'ProcessGraph'],
  ['integration-hub', 'IntegrationHub'],
  ['navigator-ai', 'NavigatorAI']
];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceInObject(node, replacements) {
  if (typeof node === 'string') {
    let updated = node;
    for (const [from, to] of replacements) {
      updated = updated.split(from).join(to);
    }

    return updated;
  }

  if (Array.isArray(node)) {
    return node.map((item) => replaceInObject(item, replacements));
  }

  if (node && typeof node === 'object') {
    const updated = {};
    for (const key of Object.keys(node)) {
      updated[key] = replaceInObject(node[key], replacements);
    }

    return updated;
  }

  return node;
}

function getEnvValue(env, key) {
  const values = Array.isArray(env && env.values) ? env.values : [];
  const hit = values.find((entry) => entry && entry.key === key);
  return hit && typeof hit.value === 'string' ? hit.value : '';
}

function toServiceBaseUrlKey(name) {
  const normalized = name.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'serviceBaseUrl';
  }

  const camel = parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');

  return `${camel}BaseUrl`;
}

const foundationCollection = readJson(foundationCollectionPath);
const foundationEnv = readJson(foundationEnvPath);

const clCollections = clServices
  .map(([dir, name]) => {
    const collectionPath = path.join(clRoot, dir, 'postman', `${name}.postman_collection.json`);
    const environmentPath = path.join(clRoot, dir, 'postman', `${name}.local.postman_environment.json`);

    if (!fs.existsSync(collectionPath) || !fs.existsSync(environmentPath)) {
      console.warn('skipping_service_missing_postman', dir, name);
      return null;
    }

    return {
      dir,
      name,
      collection: readJson(collectionPath),
      environment: readJson(environmentPath)
    };
  })
  .filter(Boolean);

const foundationBaseUrlKey = 'foundationBaseUrl';
const foundationBaseUrl = getEnvValue(foundationEnv, 'baseUrl') || 'http://localhost:3000';
const foundationItems = replaceInObject(clone(foundationCollection.item || []), [
  ['{{baseUrl}}', `{{${foundationBaseUrlKey}}}`]
]);

const foundationFolder = {
  name: 'FoundationERP',
  description: 'Aggregated folder for Foundation ERP APIs',
  item: [
    {
      name: 'ConstitutionalERP-FoundationERP',
      description: 'Imported from FoundationERP.postman_collection.json',
      item: foundationItems
    }
  ]
};

const clFolderItems = clCollections.map(({ dir, name, collection, environment }) => {
  const baseUrlKey = toServiceBaseUrlKey(name);
  const baseUrlValue = getEnvValue(environment, 'baseUrl') || 'http://localhost:3000';
  const transformed = replaceInObject(clone(collection.item || []), [
    ['{{baseUrl}}', `{{${baseUrlKey}}}`]
  ]);

  return {
    dir,
    name,
    baseUrlKey,
    baseUrlValue,
    item: transformed
  };
});

const constitutionalLayerFolder = {
  name: 'ConstitutionalLayer',
  description: 'Aggregated folder for Constitutional Layer services',
  item: clFolderItems.map(({ dir, name, item }) => ({
    name,
    description: `Imported from ${dir}/postman/${name}.postman_collection.json`,
    item
  }))
};

const mergedCollection = {
  info: {
    _postman_id: 'e35decb9-8c30-4fb4-b2bb-4a46fa7a7ad4',
    name: 'ConstitutionalERP - Unified API Collection',
    description: 'Unified Postman collection aggregating FoundationERP and ConstitutionalLayer service collections.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  item: [foundationFolder, constitutionalLayerFolder],
  event: []
};

const mergedEnvValues = [];
const seen = new Set();

const addValues = (values) => {
  for (const v of values || []) {
    if (!v || !v.key) {
      continue;
    }
    if (seen.has(v.key)) {
      continue;
    }
    seen.add(v.key);

    const entry = {
      key: v.key,
      value: v.value ?? '',
      enabled: v.enabled !== false
    };
    if (v.type) {
      entry.type = v.type;
    }
    if (v.description) {
      entry.description = v.description;
    }

    mergedEnvValues.push(entry);
  }
};

addValues(foundationEnv.values);
for (const svc of clCollections) {
  addValues(svc.environment.values);
}

if (!seen.has(foundationBaseUrlKey)) {
  seen.add(foundationBaseUrlKey);
  mergedEnvValues.push({
    key: foundationBaseUrlKey,
    value: foundationBaseUrl,
    enabled: true,
    type: 'default'
  });
}

for (const svc of clFolderItems) {
  if (seen.has(svc.baseUrlKey)) {
    continue;
  }

  seen.add(svc.baseUrlKey);
  mergedEnvValues.push({
    key: svc.baseUrlKey,
    value: svc.baseUrlValue,
    enabled: true,
    type: 'default'
  });
}

const mergedEnv = {
  id: '8ff08f57-6698-4d86-afc4-bf03253d5f50',
  name: 'ConstitutionalERP.local',
  values: mergedEnvValues,
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: 'GitHub Copilot GPT-5.3-Codex'
};

const collectionOut = path.join(outDir, 'ConstitutionalERP.unified.postman_collection.json');
const envOut = path.join(outDir, 'ConstitutionalERP.local.postman_environment.json');

fs.writeFileSync(collectionOut, JSON.stringify(mergedCollection, null, 2));
fs.writeFileSync(envOut, JSON.stringify(mergedEnv, null, 2));

console.log('created', path.relative(root, collectionOut));
console.log('created', path.relative(root, envOut));
console.log('env_vars', mergedEnvValues.length);