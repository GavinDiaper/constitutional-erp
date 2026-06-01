#!/usr/bin/env node

const { spawn } = require('node:child_process');

function run(command, args, name) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

const api = run('npm', ['--workspace', 'services/erp-mapping-tool-api', 'run', 'dev'], 'erp-mapping-tool-api');
const ui = run('npm', ['--workspace', 'apps/ERPMappingTool', 'run', 'dev'], 'ERPMappingTool');

function shutdown() {
  api.kill();
  ui.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
