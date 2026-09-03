import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.INTERNAL_ALLOWLIST = '127.0.0.1,::1';
process.env.INGRESS_ID_HEADER = 'x-ingress-id';
process.env.INGRESS_ID_VALUE = 'foundation-ingress';
const testDbPath = path.join(process.cwd(), 'tmp-debug-timesheet.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
process.env.DATABASE_PATH = testDbPath;

const db = new Database(testDbPath);
db.exec(`CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`);
const migrationsDir = path.join(process.cwd(), 'src/db/migrations');
for (const fileName of fs.readdirSync(migrationsDir).filter((name)=>name.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'));
  db.prepare('INSERT INTO migration(id, applied_at) VALUES (?, ?)').run(fileName, new Date().toISOString());
}
db.close();

const headers = { 'x-api-key':'test-api-key','x-ingress-id':'foundation-ingress' };
const unique = Date.now();

(async () => {
  const { createApp } = await import('./src/app.ts');
  const app = createApp();
  try {
    const org = await request(app).post('/api/v1/inv/organizations').set(headers).send({ name: `Vendor Rate Org ${unique}` });
    console.log('ORG', org.status, org.body);

    const project = await request(app).post('/api/v1/projects').set(headers).send({
      name: `Vendor Rate Project ${unique}`,
      projectType: 'Service',
      contractId: `CON-VENDOR-${unique}`,
      wbsId: `WBS-VENDOR-${unique}`,
      budgetAmount: 5000,
      defaultWIPAccountId: 'SYS-120-ASSET-INVENTORY',
      defaultCloseAccountId: 'SYS-500-EXP-COGS',
      startDate: '2026-01-01',
      projectManagerId: `EMP-VENDOR-${unique}`,
      organizationId: org.body.organization_id,
    });
    console.log('PROJ', project.status, project.body);

    await request(app).post(`/api/v1/projects/${project.body.data.projectId}/activate`).set(headers).expect(200);

    const vendorRate = await request(app).post('/api/v1/h2r/vendor-rates').set(headers).send({
      contractorId: `CONT-${unique}`,
      vendorName: `Vendor ${unique}`,
      role: 'Senior Engineer',
      hourlyRate: 120,
      effectiveFrom: '2026-01-01',
      currency: 'USD',
    });
    console.log('VENDOR', vendorRate.status, vendorRate.body);

    const employee = await request(app).post('/api/v1/h2r/employees').set(headers).send({
      name: `Timesheet Employee ${unique}`,
      email: `timesheet.${unique}@example.com`
    });
    console.log('EMP', employee.status, employee.body);

    const created = await request(app).post('/api/v1/timesheets').set(headers).send({
      organizationId: org.body.organization_id,
      employeeId: employee.body.employee_id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-07'
    });
    console.log('TS', created.status, created.body);

    const line = await request(app)
      .post(`/api/v1/timesheets/${created.body.data.timesheetId}/lines`)
      .set(headers)
      .send({
        projectId: project.body.data.projectId,
        resourceId: vendorRate.body.data.contractorId,
        resourceType: 'contractor',
        vendorRateId: vendorRate.body.data.vendorRateId,
        workDate: '2026-01-02',
        hours: 8,
        costElementId: 'COST-LABOR-PRIMARY',
        description: 'Consulting work',
      });

    console.log('LINE', line.status, line.body);
  } catch (e) {
    console.error('OUTER', e);
    process.exit(1);
  }
})();
