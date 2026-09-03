import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { createApp } from './src/app.ts';

const root = process.cwd();
const testDbPath = path.join(root, 'tmp-task-lock.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
const db = new Database(testDbPath);
const migrationsDir = path.join(root, 'src', 'db', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort();

db.exec('CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO migration(id, applied_at) VALUES (?, ?)');
for (const fileName of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
  db.exec(sql);
  insert.run(fileName, new Date().toISOString());
}
db.close();

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.INTERNAL_ALLOWLIST = '127.0.0.1,::1';
process.env.INGRESS_ID_HEADER = 'x-ingress-id';
process.env.INGRESS_ID_VALUE = 'foundation-ingress';
process.env.DATABASE_PATH = testDbPath;

async function main() {
  const app = createApp();
  const headers = { 'x-api-key': 'test-api-key', 'x-ingress-id': 'foundation-ingress' };
  const unique = Date.now();

  const org = (await request(app).post('/api/v1/inv/organizations').set(headers).send({ name: `Task Lock Org ${unique}` })).body;
  const project = (await request(app).post('/api/v1/projects').set(headers).send({
    name: `Task Lock Project ${unique}`,
    projectType: 'Internal',
    budgetAmount: 5000,
    defaultWIPAccountId: 'SYS-120-ASSET-INVENTORY',
    defaultCloseAccountId: 'SYS-500-EXP-COGS',
    startDate: '2026-01-01',
    projectManagerId: 'EMP-TASK-LOCK-MGR',
    organizationId: org.organization_id,
    wbsId: `WBS-TASK-LOCK-${unique}`,
  })).body;
  await request(app).post(`/api/v1/projects/${project.data.projectId}/activate`).set(headers).expect(200);
  const employee = (await request(app).post('/api/v1/h2r/employees').set(headers).send({
    name: `Task Lock Employee ${unique}`,
    email: `tasklock.${unique}@example.com`,
  })).body;
  await request(app).post(`/api/v1/h2r/employees/${employee.employee_id}/skills`).set(headers).send({
    skillName: 'Project Planning',
    proficiency: 'Advanced',
  }).expect(201);
  await request(app).post('/api/v1/h2r/employee-availability').set(headers).send({
    employeeId: employee.employee_id,
    workDate: '2026-01-02',
    availableHours: 10,
  }).expect(201);
  const task = (await request(app).post(`/api/v1/projects/${project.data.projectId}/tasks`).set(headers).send({
    name: `Task Lock Task ${unique}`,
    estimatedHours: 12,
    remainingHours: 12,
    assignedTo: employee.employee_id,
    requiredSkill: 'Project Planning',
  })).body;
  console.log('TASK', JSON.stringify(task, null, 2));
  const alloc = (await request(app).post(`/api/v1/projects/${project.data.projectId}/tasks/${task.data.taskId}/allocations`).set(headers).send({
    resourceId: employee.employee_id,
    resourceType: 'employee',
    role: 'Engineer',
    allocatedHours: 6,
    skillRequired: 'Project Planning',
    workDate: '2026-01-02',
  })).body;
  console.log('ALLOC', JSON.stringify(alloc, null, 2));
  const timesheet = (await request(app).post('/api/v1/timesheets').set(headers).send({
    organizationId: org.organization_id,
    employeeId: employee.employee_id,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-07',
  })).body;
  console.log('TIMESHEET', JSON.stringify(timesheet, null, 2));
  const res = await request(app).post(`/api/v1/timesheets/${timesheet.data.timesheetId}/lines`).set(headers).send({
    taskId: task.data.taskId,
    projectId: project.data.projectId,
    resourceId: employee.employee_id,
    resourceType: 'employee',
    workDate: '2026-01-02',
    hours: 4,
    costElementId: 'COST-LABOR-PRIMARY',
    description: 'Task-linked time entry',
  });
  console.log('STATUS', res.status);
  console.log(JSON.stringify(res.body, null, 2));
}

void main();
