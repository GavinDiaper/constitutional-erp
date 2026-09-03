import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const rootDir = process.cwd();
const testDbPath = path.join(rootDir, 'debug-allocation.db');
for (const filePath of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

const db = new Database(testDbPath);
const migrationsDir = path.join(rootDir, 'src', 'db', 'migrations');
for (const fileName of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'));
}
db.exec(`CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`);
for (const fileName of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
  db.prepare('INSERT INTO migration(id, applied_at) VALUES (?, ?)').run(fileName, new Date().toISOString());
}
db.close();

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.INTERNAL_ALLOWLIST = '127.0.0.1,::1';
process.env.INGRESS_ID_HEADER = 'x-ingress-id';
process.env.INGRESS_ID_VALUE = 'foundation-ingress';
process.env.DATABASE_PATH = testDbPath;

async function main() {
  const appModule = await import('./src/app.ts');
  const app = appModule.createApp();
  const headers = { 'x-api-key': 'test-api-key', 'x-ingress-id': 'foundation-ingress' };
  const unique = Date.now();
  const organization = await request(app).post('/api/v1/inv/organizations').set(headers).send({ name: `Resource Org ${unique}` }).expect(201);
  const employee = await request(app).post('/api/v1/h2r/employees').set(headers).send({ name: `Resource Employee ${unique}`, email: `resource.${unique}@example.com`, active: true }).expect(201);
  const project = await request(app).post('/api/v1/projects').set(headers).send({
    name: `Resource Project ${unique}`,
    projectType: 'Internal',
    budgetAmount: 1000,
    defaultWIPAccountId: 'SYS-120-ASSET-INVENTORY',
    defaultCloseAccountId: 'SYS-500-EXP-COGS',
    startDate: '2026-01-01',
    projectManagerId: employee.body.employee_id,
    organizationId: organization.body.organization_id,
    wbsId: `WBS-RESOURCE-${unique}`,
  }).expect(201);

  await request(app).post(`/api/v1/projects/${project.body.data.projectId}/activate`).set(headers).expect(200);
  const task = await request(app).post(`/api/v1/projects/${project.body.data.projectId}/tasks`).set(headers).send({
    name: `Planned Task ${unique}`,
    description: 'Resource scheduling task',
    estimatedHours: 40,
    remainingHours: 40,
    assignedTo: employee.body.employee_id,
  }).expect(201);

  try {
    const response = await request(app)
      .post(`/api/v1/projects/${project.body.data.projectId}/tasks/${task.body.data.taskId}/allocations`)
      .set(headers)
      .send({
        resourceId: employee.body.employee_id,
        resourceType: 'employee',
        role: 'Engineer',
        allocatedHours: 24,
      });

    console.log('status', response.status);
    console.log('body', JSON.stringify(response.body, null, 2));
  } catch (error: any) {
    console.error('error status', error.response?.status);
    console.error('error body', JSON.stringify(error.response?.body, null, 2));
    console.error(error.stack);
  }
}

main();
