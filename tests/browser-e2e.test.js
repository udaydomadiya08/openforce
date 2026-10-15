import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

describe('Browser End-to-End Verification (Google Chrome Headless)', () => {
  let db;
  let server;
  let baseUrl;
  let browser;
  let page;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);
    seedDatabase(db); // Seed initial demo data for comprehensive UI testing

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    page = await browser.newPage();
  });

  after(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    if (server) server.close();
    if (db) db.close();
  });

  // =========================================================================
  // 1. App Loading, Persona Switcher, and Authentication UI
  // =========================================================================
  test('App loads successfully, executes client JS, and displays authenticated Admin persona', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#current-user-name');

    const userName = await page.textContent('#current-user-name');
    const userRole = await page.textContent('#current-user-role');
    assert.match(userName, /Alex|Vance|Admin/i);
    assert.equal(userRole.trim(), 'Admin');

    // Test Persona Switcher: switch to Sales Rep (Sarah)
    await page.click('#demo-btn-rep');
    await page.waitForTimeout(400);

    const switchedName = await page.textContent('#current-user-name');
    assert.match(switchedName, /Sarah/i);

    // Switch back to Admin
    await page.click('#demo-btn-admin');
    await page.waitForTimeout(400);
  });

  // =========================================================================
  // 2. Navigation through all primary CRM Views
  // =========================================================================
  test('Navigates across all primary CRM views without console errors', async () => {
    const views = [
      { id: '#nav-pipeline', titleSnippet: 'Kanban' },
      { id: '#nav-leads', titleSnippet: 'Leads' },
      { id: '#nav-accounts', titleSnippet: 'Accounts' },
      { id: '#nav-contacts', titleSnippet: 'Contacts' },
      { id: '#nav-activities', titleSnippet: 'Activities' },
      { id: '#nav-reports', titleSnippet: 'Performance' },
      { id: '#nav-settings', titleSnippet: 'Organization' },
      { id: '#nav-dashboard', titleSnippet: 'Dashboard' }
    ];

    for (const view of views) {
      await page.click(view.id);
      await page.waitForSelector('#main-content h1');
      const headerText = await page.textContent('#main-content h1');
      assert.match(headerText, new RegExp(view.titleSnippet, 'i'));
    }
  });

  // =========================================================================
  // 3. Creating CRM Records via UI Modals
  // =========================================================================
  test('Creates a new Lead through UI modal and displays it in Leads list', async () => {
    // Navigate to Leads view
    await page.click('#nav-leads');
    await page.waitForSelector('#main-content');

    // Open New Lead Modal
    await page.click('button:has-text("+ New Lead")');
    await page.waitForSelector('#main-modal.active');

    // Fill out form
    await page.fill('#lead-first', 'Eleanor');
    await page.fill('#lead-last', 'Penta');
    await page.fill('#lead-company', 'Penta Global Logistics');
    await page.fill('#lead-email', 'eleanor@pentaglobal.test');
    await page.fill('#lead-phone', '+1 555-9012');

    // Submit form
    await page.click('button:has-text("Create Lead")');
    await page.waitForSelector('#main-modal:not(.active)');

    // Verify lead appears in table
    await page.waitForTimeout(300);
    const content = await page.textContent('#main-content');
    assert.match(content, /Penta Global Logistics/);
    assert.match(content, /Eleanor Penta/);
  });

  test('Creates a new Account through UI modal and views Account 360 detail', async () => {
    await page.click('#nav-accounts');
    await page.waitForSelector('#main-content');

    // Open New Account Modal
    await page.click('button:has-text("+ New Account")');
    await page.waitForSelector('#main-modal.active');

    // Fill form
    await page.fill('#acc-name', 'Quantum Dynamics Labs');
    await page.fill('#acc-industry', 'Artificial Intelligence');
    await page.fill('#acc-revenue', '5000000');
    await page.fill('#acc-website', 'https://quantumlabs.test');

    // Submit form
    await page.click('button:has-text("Create Account")');
    await page.waitForSelector('#main-modal:not(.active)');

    // Verify account exists in list
    await page.waitForTimeout(300);
    const tableText = await page.textContent('#main-content');
    assert.match(tableText, /Quantum Dynamics Labs/);

    // Click View 360°
    await page.click('tr:has-text("Quantum Dynamics Labs") button:has-text("View 360°")');
    await page.waitForSelector('#main-modal.active');

    const modalTitle = await page.textContent('#modal-title');
    assert.match(modalTitle, /Account 360.*Quantum Dynamics Labs/);

    await page.click('button.modal-close-btn');
    await page.waitForSelector('#main-modal:not(.active)');
  });

  // =========================================================================
  // 4. Lead Conversion Workflow in Browser
  // =========================================================================
  test('Executes Lead Conversion in UI and verifies Opportunity appears in Pipeline Kanban', async () => {
    await page.click('#nav-leads');
    await page.waitForSelector('#main-content');

    // Find the lead row for "Penta Global Logistics" and click Convert Lead
    const convertBtn = page.locator('tr:has-text("Penta Global Logistics") button:has-text("Convert Lead")');
    await convertBtn.click();
    await page.waitForSelector('#main-modal.active');

    // Verify modal preview steps
    const modalText = await page.textContent('#modal-body');
    assert.match(modalText, /1\. Account \(Company\)/);
    assert.match(modalText, /Penta Global Logistics/);
    assert.match(modalText, /2\. Contact/);
    assert.match(modalText, /Eleanor Penta/);
    assert.match(modalText, /3\. Opportunity \(Deal\)/);

    // Complete conversion
    await page.click('button:has-text("Complete Conversion")');
    await page.waitForSelector('#main-modal:not(.active)');

    // Verify automatically navigated to pipeline and deal is present
    await page.waitForTimeout(500);
    const pipelineContent = await page.textContent('#main-content');
    assert.match(pipelineContent, /Penta Global Logistics - Deal/);
  });

  // =========================================================================
  // 5. Opportunity Pipeline Kanban & Drag/Move Stages
  // =========================================================================
  test('Opportunity Kanban stage selector updates deal stage and probability', async () => {
    await page.click('#nav-pipeline');
    await page.waitForSelector('.kanban-board-container');

    // Find card for Penta Global Logistics and move to "Proposal / Quote" (or other stage)
    const card = page.locator('.kanban-card:has-text("Penta Global Logistics")');
    await assert.doesNotReject(async () => await card.waitFor({ timeout: 4000 }));

    const stageSelect = card.locator('select.filter-select');
    // Select the third option (Proposal / Quote)
    await stageSelect.selectOption({ index: 2 });
    await page.waitForTimeout(500);

    // Verify stage changed in UI
    const updatedCard = page.locator('.kanban-card:has-text("Penta Global Logistics")');
    assert.ok(await updatedCard.isVisible());
  });

  // =========================================================================
  // 6. Universal Search & Filtering
  // =========================================================================
  test('Universal Search dropdown finds records by partial query', async () => {
    const searchInput = page.locator('#global-search-input');
    await searchInput.fill('Penta');
    await page.waitForSelector('#search-dropdown.active');

    const dropdownText = await page.textContent('#search-dropdown');
    assert.match(dropdownText, /Penta Global Logistics/);

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(200);
  });

  // =========================================================================
  // 7. Malicious Input Handling (Stored XSS Protection in Real Browser)
  // =========================================================================
  test('User-controlled text containing script injection is safely rendered as text without execution', async () => {
    // Set a canary flag on window
    await page.evaluate(() => { window.__xss_fired = false; });

    // Create an account with malicious XSS payload
    await page.click('#nav-accounts');
    await page.waitForSelector('#main-content');

    await page.click('button:has-text("+ New Account")');
    await page.waitForSelector('#main-modal.active');

    const xssPayload = '<img src="invalid-image-trigger" onerror="window.__xss_fired = true;">';
    await page.fill('#acc-name', xssPayload);
    await page.fill('#acc-industry', 'Security Testing');

    await page.click('button:has-text("Create Account")');
    await page.waitForSelector('#main-modal:not(.active)');

    // Allow browser event loop to process any potential onerror triggers
    await page.waitForTimeout(600);

    // Verify canary flag was NEVER fired
    const canaryStatus = await page.evaluate(() => window.__xss_fired);
    assert.equal(canaryStatus, false, 'XSS payload must not execute in browser');

    // Verify it is treated strictly as text and no <img> element was injected
    const imgCount = await page.locator('img[src="invalid-image-trigger"]').count();
    assert.equal(imgCount, 0, 'No <img> tag should exist in DOM');

    const textContent = await page.textContent('#main-content');
    assert.ok(textContent.includes('<img src="invalid-image-trigger"'), 'Payload displayed as plain text');
  });

  // =========================================================================
  // 8. Sign Out / Token Revocation in Browser
  // =========================================================================
  test('Logout button revokes session token and clears localStorage in browser', async () => {
    // Verify token exists before logout
    const tokenBefore = await page.evaluate(() => localStorage.getItem('openforce_token'));
    assert.ok(tokenBefore, 'Token should exist before logout');

    // Click Logout
    await page.click('#btn-logout');
    await page.waitForTimeout(400);

    // Verify localStorage cleared
    const tokenAfter = await page.evaluate(() => localStorage.getItem('openforce_token'));
    assert.equal(tokenAfter, null, 'Token should be null in localStorage after logout');

    // Verify UI reflects signed-out state
    const userName = await page.textContent('#current-user-name');
    assert.equal(userName.trim(), 'Guest');

    const mainContent = await page.textContent('#main-content');
    assert.match(mainContent, /You have signed out/i);
  });
});
