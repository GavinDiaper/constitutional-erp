const { readdirSync, statSync } = require('node:fs');
const { resolve, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src');

function collectTestFiles(dir, destination) {
	for (const entry of readdirSync(dir)) {
		const fullPath = resolve(dir, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			collectTestFiles(fullPath, destination);
			continue;
		}

		if (entry.endsWith('.test.ts')) {
			destination.push(relative(rootDir, fullPath));
		}
	}
}

const testFiles = [];
collectTestFiles(srcDir, testFiles);
testFiles.sort();

if (testFiles.length === 0) {
	console.error('No integration test files found under src/**/*.test.ts');
	process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
	cwd: rootDir,
	stdio: 'inherit'
});

if (result.error) {
	console.error(result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
