import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import http from 'node:http';

describe('Opportunities Pipeline Kanban & Sales Stages', () => {
  let db;
  let server;
  let baseUrl;
  let token;
  let accountId;
  let stages;
  let oppId;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Register organization
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'deals@pipeline.test',
        password: 'PipelinePassword123!',
        first_name: 'Gordon',
        last_name: 'Gekko',
        org_name: 'Wall Street Capital'
      })
    });
    const data = await res.json();
    token = data.token;

    // Fetch default stages
    const stagesRes = await fetch(`${baseUrl}/api/org/stages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const stagesData = await stagesRes.json();
    stages = stagesData.stages;

    // Create an account
    const accRes = await fetch(`${baseUrl}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'BlueStar Airlines',
        industry: 'Aviation'
      })
    });
    const accData = await accRes.json();
    accountId = accData.account.id;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('POST /api/opportunities creates a deal in initial stage', async () => {
    const res = await fetch(`${baseUrl}/api/opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'BlueStar Fleet Maintenance Contract',
        account_id: accountId,
        stage_id: stages[0].id, // Prospecting
        amount: 250000,
        type: 'New Business'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.opportunity.name, 'BlueStar Fleet Maintenance Contract');
    assert.equal(body.opportunity.amount, 250000);
    assert.equal(body.opportunity.probability, 10);
    oppId = body.opportunity.id;
  });

  test('GET /api/opportunities/pipeline returns grouped Kanban stages and accurate totals', async () => {
    const res = await fetch(`${baseUrl}/api/opportunities/pipeline`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.stages));
    assert.equal(body.stages.length, 6);

    const firstStage = body.stages[0];
    assert.equal(firstStage.name, 'Prospecting');
    assert.equal(firstStage.deals_count, 1);
    assert.equal(firstStage.total_amount, 250000);

    assert.equal(body.summary.total_pipeline_value, 250000);
    assert.equal(body.summary.weighted_pipeline_value, 25000); // 10% of 250,000
    assert.equal(body.summary.total_open_count, 1);
  });

  test('PATCH /api/opportunities/:id/stage transitions stage and adjusts probability', async () => {
    const targetStage = stages[2]; // Proposal / Quote (50%)
    const res = await fetch(`${baseUrl}/api/opportunities/${oppId}/stage`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        stage_id: targetStage.id
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.opportunity.stage_id, targetStage.id);
    assert.equal(body.opportunity.probability, 50);

    // Verify activity note was automatically logged
    const act = db.get(
      `SELECT * FROM activities WHERE related_to_type = 'Opportunity' AND related_to_id = ? AND subject = 'Stage Updated'`,
      [oppId]
    );
    assert.ok(act);
    assert.match(act.description, /transitioned from "Prospecting" to "Proposal \/ Quote"/);
  });
});
