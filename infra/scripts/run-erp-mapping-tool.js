#!/usr/bin/env node

const { spawn } = require('node:child_process');

function run(command, args, name, env = process.env) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

const apiPort = process.env.ERP_MAPPING_API_PORT || '3011';
const apiKey = process.env.API_KEY || 'change-me';

const apiEnv = {
  ...process.env,
  PORT: apiPort,
  API_KEY: apiKey,
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176'
};

const uiEnv = {
  ...process.env,
  PUBLIC_ERP_MAPPING_API_URL: process.env.PUBLIC_ERP_MAPPING_API_URL || `http://localhost:${apiPort}`,
  PUBLIC_ERP_MAPPING_API_KEY: process.env.PUBLIC_ERP_MAPPING_API_KEY || apiKey
};

const api = run('npm', ['--workspace', 'services/erp-mapping-tool-api', 'run', 'dev'], 'erp-mapping-tool-api', apiEnv);
const ui = run('npm', ['--workspace', 'apps/ERPMappingTool', 'run', 'dev'], 'ERPMappingTool', uiEnv);

function shutdown() {
  api.kill();
  ui.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
