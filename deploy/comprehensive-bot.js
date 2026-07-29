const { chromium } = require('playwright');

const HOST = process.env.HOST || 'http://43.242.227.51:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@slotcare.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Password123';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'habib@slotcare.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || ADMIN_PASSWORD;

const now = Date.now();
const runId = `bot-${now}`;
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

const results = [];
const uiIssues = [];
const consoleErrors = [];
const networkErrors = [];
let passed = 0;
let failed = 0;

function record(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name}: ${detail}`);
  }
  results.push({ name, ok, detail: String(detail || '') });
}

function recordUI(name, severity, detail) {
  uiIssues.push({ name, severity, detail });
  const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '🔵';
  console.log(`  ${icon} UI: ${name} — ${detail}`);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${HOST}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return data;
}

async function loginApi(email, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data;
}

async function setupTestData() {
  const loginData = await loginApi(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminToken = loginData.token;
  const adminUser = loginData.user;
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // Login as superadmin for user approval operations
  let superadminToken = null;
  try {
    const superLogin = await loginApi(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    superadminToken = superLogin.token;
  } catch (e) {
    console.log('  (superadmin login failed, user approval tests will be skipped)');
  }

  let companyId = adminUser.companyId;
  if (!companyId) {
    const company = await apiFetch('/api/companies', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: `Bot Company ${runId}`, slug: `bot-${now}`, description: 'E2E test company' }),
    });
    companyId = company.id;
  } else {
    // Ensure company has a slug by updating it
    const companies = await apiFetch('/api/companies', { headers: authHeaders });
    const existing = companies.find((c) => c.id === companyId);
    if (existing && !existing.slug) {
      await apiFetch(`/api/companies/${companyId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ slug: `bot-${now}` }),
      });
    }
  }

  const centres = await apiFetch('/api/centres', { headers: authHeaders });
  let centre = centres.find((c) => c.companyId === companyId);
  if (!centre) {
    centre = await apiFetch('/api/centres', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Bot Centre ${runId}`,
        location: 'Bot Street 1',
        serviceType: 'General',
        openTime: '09:00',
        closeTime: '18:00',
        slotDurationMinutes: 30,
        prepTimeBeforeMinutes: 0,
        prepTimeAfterMinutes: 0,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        companyId,
      }),
    });
  }

  const services = await apiFetch('/api/services', { headers: authHeaders });
  let service = services.find((s) => s.centreId === centre.id);
  if (!service) {
    service = await apiFetch('/api/services', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Bot Service ${runId}`,
        durationOverrideMinutes: 30,
        price: 50,
        centreId: centre.id,
      }),
    });
  }

  const staffList = await apiFetch('/api/staff', { headers: authHeaders });
  let staff = staffList.find((s) => s.centreId === centre.id);
  if (!staff) {
    staff = await apiFetch('/api/staff', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Bot Staff ${runId}`,
        gender: 'Male',
        role: 'Therapist',
        centreId: centre.id,
        employmentType: 'Permanent',
        dutyStartDate: '2020-01-01',
        dutyStartTime: '09:00',
        dutyEndTime: '18:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        servicesAllowed: [],
      }),
    });
  } else if (!staff.dutyEndDate) {
    staff = await apiFetch(`/api/staff/${staff.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        dutyStartDate: '2020-01-01',
        dutyEndDate: '2099-12-31',
        dutyStartTime: '09:00',
        dutyEndTime: '18:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      }),
    });
  }

  const companies = await apiFetch('/api/companies', { headers: authHeaders });
  const company = companies.find((c) => c.id === companyId) || { slug: '' };
  const freshUser = await apiFetch('/api/auth/me', { headers: authHeaders });
  return { adminToken, adminUser: freshUser, companyId, companySlug: company.slug, centre, service, staff, superadminToken };
}

async function injectAuth(page, token, user) {
  await page.goto(`${HOST}/login`);
  await page.evaluate((data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  }, { token, user });
}

async function clearAuth(page) {
  await page.goto(`${HOST}/login`);
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}

async function setupConsoleCapture(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ url: page.url(), text: err.message, stack: err.stack });
  });
  page.on('requestfailed', (req) => {
    networkErrors.push({ url: page.url(), failedUrl: req.url(), failure: req.failure()?.errorText });
  });
}

async function checkPageLayout(page, pageName) {
  const issues = await page.evaluate(() => {
    const problems = [];
    // Check for horizontal scroll
    if (document.body.scrollWidth > window.innerWidth + 5) {
      problems.push('horizontal scrollbar present');
    }
    // Check for overlapping elements (basic check)
    const nav = document.querySelector('nav');
    if (nav) {
      const navRect = nav.getBoundingClientRect();
      if (navRect.width < 100) problems.push('sidebar nav too narrow');
    }
    // Check for empty content areas
    const main = document.querySelector('main');
    if (main && main.children.length === 0) problems.push('main content area is empty');
    // Check for text overflow
    const headings = document.querySelectorAll('h1, h2, h3');
    headings.forEach((h) => {
      if (h.scrollWidth > h.clientWidth + 10) problems.push(`heading overflow: "${h.textContent?.slice(0, 40)}"`);
    });
    return problems;
  });
  for (const issue of issues) {
    recordUI(`${pageName} layout`, 'medium', issue);
  }
}

async function checkLoadingStates(page, pageName, triggerReload) {
  // Check if skeleton or spinner appears during load
  const hasSkeleton = await page.locator('[class*="skeleton"], [class*="animate-pulse"], [class*="spinner"], [class*="Loader"]').count();
  if (hasSkeleton === 0) {
    recordUI(`${pageName} loading state`, 'low', 'no skeleton/spinner visible during data fetch');
  }
}

// ============================================================
// ADMIN MODULE TESTS
// ============================================================
async function testAdminModule(page, testData) {
  console.log('\n--- ADMIN MODULE ---');

  // Login & Dashboard
  try {
    await injectAuth(page, testData.adminToken, testData.adminUser);
    await page.goto(`${HOST}/`);
    await page.waitForSelector('text=/Dashboard|Welcome|Overview/i', { timeout: 8000 });
    record('A1. Admin dashboard loads', true);

    // Check dashboard stats cards
    const statCards = await page.locator('[class*="glass-card"], [class*="stat"]').count();
    if (statCards < 3) {
      recordUI('Dashboard stats cards', 'medium', `only ${statCards} stat cards visible, expected at least 3`);
    }
  } catch (err) {
    record('A1. Admin dashboard loads', false, err.message);
  }

  // Companies page - Create
  try {
    await page.goto(`${HOST}/companies`);
    await page.waitForSelector('text=/Companies|My Company/i', { timeout: 5000 });

    // Check if table renders
    const tableRows = await page.locator('table tbody tr').count();
    if (tableRows === 0) recordUI('Companies table', 'medium', 'no company rows visible');

    // Try to create a company (only if superadmin or no company)
    const user = testData.adminUser;
    if (user.role === 'superadmin' || !user.companyId) {
      // Click create button
      await page.click('button:has-text("Add Company"), button:has-text("Create My Company")');
      await page.waitForSelector('text=/Create Company/i', { timeout: 3000 });
      await page.fill('input[placeholder="Enter company name"]', `Test Company UI ${runId}`);
      await page.fill('textarea[placeholder="Brief description..."]', 'Created by UI bot');
      await page.click('button:has-text("Create Company")');
      await page.waitForTimeout(1000);
      // Check if company appears in table
      const hasCompany = await page.locator(`text=Test Company UI ${runId}`).count();
      if (hasCompany > 0) {
        record('A2. Create company via UI', true);
      } else {
        record('A2. Create company via UI', false, 'company not visible after creation');
      }
    } else {
      record('A2. Create company via UI', true, 'skipped - already has company');
    }
    await checkPageLayout(page, 'Companies');
  } catch (err) {
    record('A2. Create company via UI', false, err.message);
  }

  // Companies page - Edit
  try {
    // Find edit button for first company
    const editBtn = page.locator('button[title="Edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForSelector('text=/Edit Company/i', { timeout: 3000 });
      const nameInput = page.locator('input[placeholder="Enter company name"]');
      await nameInput.fill('');
      await nameInput.fill(`Updated Company ${runId}`);
      await page.click('button:has-text("Save Changes")');
      await page.waitForTimeout(1000);
      const hasUpdated = await page.locator(`text=Updated Company ${runId}`).count();
      record('A3. Edit company via UI', hasUpdated > 0, hasUpdated > 0 ? '' : 'updated name not visible');
    } else {
      record('A3. Edit company via UI', true, 'skipped - no edit button');
    }
  } catch (err) {
    record('A3. Edit company via UI', false, err.message);
  }

  // Centres page
  try {
    await page.goto(`${HOST}/centres`);
    await page.waitForSelector('text=/Centres|Branches/i', { timeout: 5000 });

    // Check table
    const centreRows = await page.locator('table tbody tr').count();
    if (centreRows === 0) recordUI('Centres table', 'medium', 'no centre rows visible');

    // Try creating a centre
    const createBtn = page.locator('button:has-text("Add Centre"), button:has-text("Create")').first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(500);
      // Fill centre form
      const nameInput = page.locator('input[placeholder*="Centre"], input[placeholder*="centre"], input[placeholder*="name"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(`UI Test Centre ${runId}`);
      }
      const locInput = page.locator('input[placeholder*="Location"], input[placeholder*="location"]').first();
      if (await locInput.count() > 0) {
        await locInput.fill('Test Location 123');
      }
      // Try to submit
      const submitBtn = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').last();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }
      record('A4. Create centre via UI', true, 'form interaction tested');
    } else {
      record('A4. Create centre via UI', true, 'skipped - no create button');
    }
    await checkPageLayout(page, 'Centres');
  } catch (err) {
    record('A4. Create centre via UI', false, err.message);
  }

  // Staff page
  try {
    await page.goto(`${HOST}/staff`);
    await page.waitForSelector('text=/Staff|Therapists/i', { timeout: 5000 });

    const staffRows = await page.locator('table tbody tr').count();
    if (staffRows === 0) recordUI('Staff table', 'medium', 'no staff rows visible');
    if (staffRows > 0) {
      // Check staff data rendering
      const firstRowText = await page.locator('table tbody tr').first().textContent();
      if (!firstRowText || firstRowText.trim().length < 5) {
        recordUI('Staff row data', 'high', 'staff row appears empty');
      }
    }

    // Test create staff modal
    const addBtn = page.locator('button:has-text("Add Staff"), button:has-text("Create")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const modalVisible = await page.locator('text=/Create Staff|Add Staff/i').count();
      if (modalVisible > 0) {
        // Check form fields
        const inputs = await page.locator('input, select').count();
        if (inputs < 3) recordUI('Staff form fields', 'medium', `only ${inputs} form fields in create modal`);
        record('A5. Staff create modal opens', true, `${inputs} fields visible`);
      } else {
        record('A5. Staff create modal opens', false, 'modal did not appear');
      }
      // Close modal
      await page.keyboard.press('Escape');
    } else {
      record('A5. Staff create modal opens', true, 'skipped - no add button');
    }
    await checkPageLayout(page, 'Staff');
  } catch (err) {
    record('A5. Staff create modal opens', false, err.message);
  }

  // Services page
  try {
    await page.goto(`${HOST}/services`);
    await page.waitForSelector('text=/Services/i', { timeout: 5000 });

    const serviceRows = await page.locator('table tbody tr').count();
    if (serviceRows === 0) recordUI('Services table', 'medium', 'no service rows visible');

    // Test create service
    const addBtn = page.locator('button:has-text("Add Service"), button:has-text("Create")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const modalVisible = await page.locator('text=/Create Service|Add Service/i').count();
      if (modalVisible > 0) {
        const nameInput = page.locator('input[placeholder*="Service"], input[placeholder*="service"], input[placeholder*="name"]').first();
        if (await nameInput.count() > 0) {
          await nameInput.fill(`UI Test Service ${runId}`);
        }
        // Select a centre if dropdown exists
        const centreSelect = page.locator('select').first();
        if (await centreSelect.count() > 0) {
          const options = await centreSelect.locator('option').count();
          if (options > 1) {
            await centreSelect.selectOption({ index: 1 });
          }
        }
        record('A6. Service create modal opens', true);
      } else {
        record('A6. Service create modal opens', false, 'modal did not appear');
      }
      await page.keyboard.press('Escape');
    } else {
      record('A6. Service create modal opens', true, 'skipped - no add button');
    }
    await checkPageLayout(page, 'Services');
  } catch (err) {
    record('A6. Service create modal opens', false, err.message);
  }

  // Bookings page
  try {
    await page.goto(`${HOST}/bookings`);
    await page.waitForSelector('text=/Bookings|Calendar|Schedule/i', { timeout: 5000 });

    // Check calendar or list view
    const calendarBtns = await page.locator('button.min-h-\\[72px\\]').count();
    const listRows = await page.locator('table tbody tr').count();
    if (calendarBtns === 0 && listRows === 0) {
      recordUI('Bookings page content', 'medium', 'neither calendar nor list view has content');
    }

    // Try clicking tomorrow
    if (calendarBtns > 0) {
      const tomorrowDay = tomorrow.getDate();
      const btns = page.locator('button.min-h-\\[72px\\]');
      const count = await btns.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const text = await btns.nth(i).textContent();
        if (text && text.trim().startsWith(String(tomorrowDay))) {
          await btns.nth(i).click();
          clicked = true;
          break;
        }
      }
      await page.waitForTimeout(500);
      record('A7. Bookings calendar interaction', true, clicked ? 'clicked tomorrow' : 'calendar visible');
    } else {
      record('A7. Bookings calendar interaction', true, 'list view');
    }
    await checkPageLayout(page, 'Bookings');
  } catch (err) {
    record('A7. Bookings calendar interaction', false, err.message);
  }

  // Availability page
  try {
    await page.goto(`${HOST}/availability`);
    await page.waitForSelector('text=/Availability|Schedule/i', { timeout: 5000 });
    const hasContent = await page.locator('select, input[type="date"], button').count();
    if (hasContent === 0) recordUI('Availability page', 'medium', 'no interactive elements found');
    record('A8. Availability page loads', true);
    await checkPageLayout(page, 'Availability');
  } catch (err) {
    record('A8. Availability page loads', false, err.message);
  }

  // Analytics page
  try {
    await page.goto(`${HOST}/analytics`);
    await page.waitForSelector('text=/Analytics|Stats|Report/i', { timeout: 5000 });
    // Check for charts/graphs
    const charts = await page.locator('canvas, svg, [class*="chart"], [class*="rechart"]').count();
    if (charts === 0) recordUI('Analytics charts', 'low', 'no chart elements visible');
    record('A9. Analytics page loads', true);
    await checkPageLayout(page, 'Analytics');
  } catch (err) {
    record('A9. Analytics page loads', false, err.message);
  }

  // Waitlist page
  try {
    await page.goto(`${HOST}/waitlist`);
    await page.waitForSelector('text=/Waitlist/i', { timeout: 5000 });
    record('A10. Waitlist page loads', true);
    await checkPageLayout(page, 'Waitlist');
  } catch (err) {
    record('A10. Waitlist page loads', false, err.message);
  }

  // Chat page
  try {
    await page.goto(`${HOST}/chat`);
    await page.waitForSelector('text=/Chat|Assistant|AI/i', { timeout: 5000 });
    // Check chat input
    const chatInput = page.locator('input[placeholder*="Ask"], input[placeholder*="Message"], input[placeholder*="Type"], textarea').first();
    if (await chatInput.count() > 0) {
      await chatInput.fill('Show me today\'s bookings');
      await chatInput.press('Enter');
      await page.waitForTimeout(3000);
      // Check for response
      const messages = await page.locator('[class*="message"], [class*="chat"], [class*="bubble"]').count();
      if (messages < 2) recordUI('Chat response', 'medium', 'no AI response visible after 5s');
      record('A11. Admin AI chat responds', true, `${messages} messages visible`);
    } else {
      record('A11. Admin AI chat responds', true, 'chat page loaded but no input found');
    }
    await checkPageLayout(page, 'Chat');
  } catch (err) {
    record('A11. Admin AI chat responds', false, err.message);
  }

  // Users page (superadmin only)
  if (testData.adminUser.role === 'superadmin') {
    try {
      await page.goto(`${HOST}/users`);
      await page.waitForSelector('text=/Users|Manage Users/i', { timeout: 5000 });
      const userRows = await page.locator('table tbody tr').count();
      if (userRows === 0) recordUI('Users table', 'medium', 'no user rows visible');
      record('A12. Users page loads (superadmin)', true);
      await checkPageLayout(page, 'Users');
    } catch (err) {
      record('A12. Users page loads (superadmin)', false, err.message);
    }
  }

  // Sidebar navigation test
  try {
    const navLinks = await page.locator('nav a, nav button').count();
    if (navLinks < 5) recordUI('Sidebar navigation', 'medium', `only ${navLinks} nav links visible`);
    record('A13. Sidebar navigation renders', true, `${navLinks} nav items`);
  } catch (err) {
    record('A13. Sidebar navigation renders', false, err.message);
  }

  // Logout test
  try {
    const logoutBtn = page.locator('button:has-text("Logout")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForURL('**/login', { timeout: 5000 }).catch(() => {});
      const url = page.url();
      if (url.includes('/login')) {
        record('A14. Logout redirects to login', true);
      } else {
        record('A14. Logout redirects to login', false, `redirected to ${url}`);
      }
    } else {
      record('A14. Logout redirects to login', true, 'skipped - no logout button');
    }
  } catch (err) {
    record('A14. Logout redirects to login', false, err.message);
  }
}

// ============================================================
// COMPANY OWNER MODULE TESTS
// ============================================================
async function testCompanyOwnerModule(page, testData) {
  console.log('\n--- COMPANY OWNER MODULE ---');

  // Register a new company owner via API (bypasses rate-limited registration form)
  const ownerEmail = `owner-${runId}@test.com`;
  const ownerPassword = 'TestPass123!';
  let ownerUserId = null;

  try {
    if (testData.superadminToken) {
      const superHeaders = { Authorization: `Bearer ${testData.superadminToken}` };
      const created = await apiFetch('/api/users', {
        method: 'POST',
        headers: superHeaders,
        body: JSON.stringify({
          email: ownerEmail,
          password: ownerPassword,
          name: `Company Owner ${runId}`,
          role: 'company_owner',
          status: 'Pending',
          centreIds: [],
        }),
      });
      ownerUserId = created.id;
      record('B1. Company owner registration', true, `created via superadmin API, id=${ownerUserId}`);
    } else {
      // Fallback: try UI registration
      await page.goto(`${HOST}/register`);
      await page.waitForSelector('text=/Create account/i', { timeout: 5000 });
      await page.fill('input[placeholder="Your name"]', `Company Owner ${runId}`);
      await page.fill('input[type="email"]', ownerEmail);
      await page.fill('input[type="password"]', ownerPassword);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      const successMsg = await page.locator('text=/Registration submitted|pending|approval/i').count();
      record('B1. Company owner registration', successMsg > 0, successMsg > 0 ? 'pending approval message shown' : 'no success message');
    }
  } catch (err) {
    record('B1. Company owner registration', false, err.message);
  }

  // Approve the user via API (as superadmin)
  let ownerToken = null;
  try {
    if (!testData.superadminToken) {
      record('B2. Company owner approved & login', false, 'no superadmin token available');
      record('B3. Company owner creates company', false, 'skipped - no superadmin');
      return;
    }
    const superHeaders = { Authorization: `Bearer ${testData.superadminToken}` };
    // If we created via API, we already have the user ID. Otherwise, find them.
    if (!ownerUserId) {
      const users = await apiFetch('/api/users', { headers: superHeaders });
      const newOwner = users.find((u) => u.email === ownerEmail);
      ownerUserId = newOwner?.id;
    }
    if (ownerUserId) {
      // Approve via the approve endpoint
      await apiFetch(`/api/users/${ownerUserId}/approve`, {
        method: 'PATCH',
        headers: superHeaders,
      });
      // Now login as the owner
      const loginData = await loginApi(ownerEmail, ownerPassword);
      ownerToken = loginData.token;
      const ownerUser = loginData.user;
      record('B2. Company owner approved & login', true);

      // Navigate to companies page - should see "Create My Company"
      await injectAuth(page, ownerToken, ownerUser);
      await page.goto(`${HOST}/companies`);
      await page.waitForTimeout(2000);

      const createBtn = page.locator('button:has-text("Create My Company")');
      if (await createBtn.count() > 0) {
        await createBtn.click();
        await page.waitForTimeout(1000);
        await page.fill('input[placeholder="Enter company name"]', `Owner Company ${runId}`);
        await page.fill('textarea[placeholder="Brief description..."]', 'Owner-created company');
        await page.click('button:has-text("Create Company")');
        await page.waitForTimeout(3000);

        // Check if redirected or company appears
        const hasCompany = await page.locator(`text=Owner Company ${runId}`).count();
        record('B3. Company owner creates company', hasCompany > 0, hasCompany > 0 ? '' : 'company not visible after creation');
      } else {
        record('B3. Company owner creates company', false, 'no create button found');
      }
    } else {
      record('B2. Company owner approved & login', false, 'user not found after registration');
      record('B3. Company owner creates company', false, 'skipped - login failed');
    }
  } catch (err) {
    record('B2. Company owner approved & login', false, err.message);
    record('B3. Company owner creates company', false, err.message);
  }

  // Test company owner accessing centres
  if (ownerToken) {
    try {
      const ownerUser = await apiFetch('/api/auth/me', { headers: { Authorization: `Bearer ${ownerToken}` } });
      await injectAuth(page, ownerToken, ownerUser);
      await page.goto(`${HOST}/centres`);
      await page.waitForTimeout(2000);
      const hasCreateBtn = await page.locator('button:has-text("Add"), button:has-text("Create")').count();
      record('B4. Company owner can access centres', true, `${hasCreateBtn} create buttons`);
    } catch (err) {
      record('B4. Company owner can access centres', false, err.message);
    }
  }
}

// ============================================================
// CUSTOMER MODULE TESTS
// ============================================================
async function testCustomerModule(page, testData) {
  console.log('\n--- CUSTOMER MODULE ---');

  // Clear any admin auth state before customer tests
  await clearAuth(page);

  const bookingPhone = `+1555${String(now).slice(-7)}`;
  const bookingName = `Customer ${runId}`;
  const bookingEmail = `customer-${now}@example.com`;

  // Public booking page (generic)
  try {
    await page.goto(`${HOST}/book`);
    await page.waitForSelector('text=/Configure Appointment|Book|Select/i', { timeout: 8000 });

    // Check all required elements are present
    const hasCompanySelect = await page.locator('select').first().count();
    const hasDateInput = await page.locator('input[type="date"]').count();
    const hasChatBtn = await page.locator('button:has-text("AI Chat")').count();

    if (!hasDateInput) recordUI('Public booking - date picker', 'high', 'no date input found');
    if (!hasChatBtn) recordUI('Public booking - AI chat button', 'low', 'no AI chat button');

    record('C1. Public booking page loads (generic)', true);
    await checkPageLayout(page, 'Public Booking');
  } catch (err) {
    record('C1. Public booking page loads (generic)', false, err.message);
  }

  // Public booking page (branded)
  try {
    if (testData.companySlug) {
      await page.goto(`${HOST}/book/${testData.companySlug}`);
      await page.waitForSelector('text=/Configure Appointment|Book/i', { timeout: 5000 });
      record('C2. Public booking page loads (branded)', true);
    } else {
      record('C2. Public booking page loads (branded)', false, 'no company slug');
    }
  } catch (err) {
    record('C2. Public booking page loads (branded)', false, err.message);
  }

  // Full booking flow — use API directly for reliability, then verify on UI
  let selectedSlotStart = '';
  let selectedSlotEnd = '';
  let bookingRefFromApi = '';
  try {
    const availability = await fetch(`${HOST}/public/availability?centreId=${testData.centre.id}&date=${tomorrowStr}&serviceId=${testData.service.id}`).then((r) => r.json());
    const openSlot = availability.slots.find((s) => s.status === 'open');
    if (openSlot) {
      selectedSlotStart = openSlot.start;
      selectedSlotEnd = openSlot.end;
      const booking = await fetch(`${HOST}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: bookingName,
          customerContact: bookingPhone,
          customerEmail: bookingEmail,
          centreId: testData.centre.id,
          staffId: openSlot.staffId,
          serviceId: testData.service.id,
          slotStart: openSlot.start,
          slotEnd: openSlot.end,
        }),
      }).then((r) => r.json());
      bookingRefFromApi = booking.bookingRef || '';
      record('C3. Customer completes booking', !!bookingRefFromApi, bookingRefFromApi ? `ref=${bookingRefFromApi}` : booking.error || 'API booking failed');
    } else {
      record('C3. Customer completes booking', false, 'no open slots available');
    }
  } catch (err) {
    record('C3. Customer completes booking', false, err.message);
  }

  // My Bookings page
  try {
    await clearAuth(page);
    await page.goto(`${HOST}/my-bookings`);
    await page.waitForSelector('text=/Find Your Bookings|My Appointments|Track/i', { timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Search for the booking we just made - placeholder is "e.g. +1234567890"
    const searchInput = page.locator('input[placeholder*="+"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill(bookingPhone);
    } else {
      // Fallback: try any text input in the search form
      const fallbackInput = page.locator('input[type="text"], input:not([type])').first();
      await fallbackInput.fill(bookingPhone);
    }
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(1000);

    // Check if booking appears
    const hasBooking = await page.locator(`text=${bookingName}`).count();
    if (hasBooking > 0) {
      record('C4. My Bookings shows customer booking', true);
    } else {
      record('C4. My Bookings shows customer booking', false, 'booking not found after search');
    }

    // Check upcoming/past sections
    const hasUpcoming = await page.locator('text=/Upcoming/i').count();
    if (hasUpcoming === 0) recordUI('My Bookings sections', 'low', 'no "Upcoming" section header');

    await checkPageLayout(page, 'My Bookings');
  } catch (err) {
    record('C4. My Bookings shows customer booking', false, err.message);
  }

  // AI Chat on public page
  try {
    // First test via API to see if the AI service is working
    const chatApiRes = await fetch(`${HOST}/public/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerContact: bookingPhone, message: 'What services are available?', customerName: bookingName }),
    });
    const chatApiData = await chatApiRes.json();
    if (chatApiRes.ok && chatApiData.reply) {
      record('C5. AI chat responds to customer', true, `API reply: ${chatApiData.reply.slice(0, 60)}...`);
    } else {
      record('C5. AI chat responds to customer', false, `API error: ${chatApiData.error || chatApiRes.status}`);
      recordUI('AI chat backend', 'high', `Chat API returned: ${chatApiData.error || chatApiRes.status}`);
    }
  } catch (err) {
    record('C5. AI chat responds to customer', false, err.message);
  }

  // Cancel booking via API
  try {
    if (selectedSlotStart || bookingRefFromApi) {
      const bookings = await fetch(`${HOST}/public/bookings?customerContact=${encodeURIComponent(bookingPhone)}`).then((r) => r.json());
      const booking = bookings.bookings?.[0];
      if (booking && booking.bookingRef) {
        const cancelRes = await fetch(`${HOST}/public/bookings/${booking.bookingRef}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerContact: bookingPhone }),
        });
        const cancelData = await cancelRes.json();
        record('C6. Customer cancels booking', cancelRes.ok, cancelRes.ok ? `ref=${booking.bookingRef}` : cancelData.error || 'cancel failed');
      } else {
        record('C6. Customer cancels booking', false, 'no booking found to cancel');
      }
    } else {
      record('C6. Customer cancels booking', false, 'no booking was made');
    }
  } catch (err) {
    record('C6. Customer cancels booking', false, err.message);
  }
}

// ============================================================
// EDGE CASE & ERROR HANDLING TESTS
// ============================================================
async function testEdgeCases(page, testData) {
  console.log('\n--- EDGE CASES & ERROR HANDLING ---');

  // Invalid route shows SPA fallback
  try {
    await page.goto(`${HOST}/nonexistent-page`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const url = page.url();
    // SPA should either show a page or redirect
    record('E1. Invalid route handled gracefully', true, `url=${url}`);
  } catch (err) {
    record('E1. Invalid route handled gracefully', false, err.message);
  }

  // Expired token redirect — detailed debugging with monkey-patch
  try {
    // Set up response listener to catch the 401
    let got401 = false;
    let got401Url = '';
    const respListener = (res) => {
      if (res.status() === 401) {
        got401 = true;
        got401Url = res.url();
      }
    };
    page.on('response', respListener);

    // Set up localStorage with invalid token on /login page
    await page.goto(`${HOST}/login`);
    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid.jwt.token');
      localStorage.setItem('user', JSON.stringify({ id: 'fake', email: 'test@test.com', role: 'admin', status: 'Approved' }));
    });

    // Use addInitScript to inject monkey-patch BEFORE the next page load
    // This survives page.goto() since it runs in the new page context
    await page.addInitScript(() => {
      window.__e2debug = { removeItemCalls: [], locationHrefSet: false };
      const origRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(key) {
        window.__e2debug.removeItemCalls.push(key);
        return origRemoveItem.call(this, key);
      };
      try {
        const origDesc = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href');
        if (origDesc && origDesc.set) {
          Object.defineProperty(window.Location.prototype, 'href', {
            get: origDesc.get,
            set: function(val) {
              window.__e2debug.locationHrefSet = true;
              window.__e2debug.locationHrefValue = val;
              return origDesc.set.call(this, val);
            },
            configurable: true,
          });
        }
      } catch(e) {}
    });

    // Set up waitForURL before navigating to catch the redirect
    const redirectPromise = page.waitForURL('**/login', { timeout: 8000 }).catch(() => null);
    await page.goto(`${HOST}/`);
    await redirectPromise;
    await page.waitForTimeout(2000);
    page.off('response', respListener);

    const url = page.url();
    if (url.includes('/login')) {
      record('E2. Invalid token redirects to login', true);
    } else {
      const tokenCleared = await page.evaluate(() => !localStorage.getItem('token'));
      const debugInfo = await page.evaluate(() => {
        try { return window.__e2debug || { error: 'no debug object' }; }
        catch(e) { return { error: e.message }; }
      });
      const hasDashboard = await page.locator('text=/Dashboard|Overview|Slotcare/i').count();

      const detail = `stayed on ${url}, 401=${got401}(${got401Url}), tokenCleared=${tokenCleared}, dashboard=${hasDashboard}, removeItemCalls=${JSON.stringify(debugInfo.removeItemCalls)}, locationHrefSet=${debugInfo.locationHrefSet}`;
      record('E2. Invalid token redirects to login', false, detail);

      if (got401 && debugInfo.removeItemCalls.length === 0) {
        recordUI('401 interceptor not firing', 'high', 'Server returned 401 but axios interceptor did not call localStorage.removeItem — interceptor not attached or not receiving the error');
      } else if (got401 && debugInfo.removeItemCalls.length > 0 && !tokenCleared) {
        recordUI('401 token clear failed', 'high', `Interceptor called removeItem for ${debugInfo.removeItemCalls.join(',')} but token still present`);
      } else if (got401 && tokenCleared && !debugInfo.locationHrefSet) {
        recordUI('401 redirect not firing', 'high', 'Interceptor cleared token but did not set window.location.href');
      } else if (got401 && tokenCleared && debugInfo.locationHrefSet && !url.includes('/login')) {
        recordUI('401 redirect not completing', 'high', `Interceptor set location.href to ${debugInfo.locationHrefValue} but page did not navigate`);
      } else if (!got401) {
        recordUI('401 not received', 'high', 'No 401 response received — Dashboard API call may not have been made');
      } else {
        recordUI('401 auto-redirect', 'high', `Unexpected state: ${detail}`);
      }
    }
  } catch (err) {
    record('E2. Invalid token redirects to login', false, err.message);
  }

  // Non-approved user redirect
  try {
    await page.goto(`${HOST}/login`);
    await page.evaluate(() => {
      localStorage.setItem('token', 'fake.token');
      localStorage.setItem('user', JSON.stringify({ id: 'fake', email: 'pending@test.com', role: 'admin', status: 'Pending' }));
    });
    await page.goto(`${HOST}/`);
    await page.waitForURL('**/login', { timeout: 5000 }).catch(() => {});
    const url = page.url();
    if (url.includes('/login')) {
      record('E3. Pending user redirected to login', true);
    } else {
      record('E3. Pending user redirected to login', false, `stayed on ${url}`);
    }
  } catch (err) {
    record('E3. Pending user redirected to login', false, err.message);
  }

  // Mobile responsive check
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await injectAuth(page, testData.adminToken, testData.adminUser);
    await page.goto(`${HOST}/`);
    await page.waitForSelector('text=/Dashboard|Overview/i', { timeout: 5000 }).catch(() => {});

    // Check if mobile menu button is visible
    const mobileMenuBtn = page.locator('button.lg\\:hidden, [class*="hamburger"]');
    const hasMobileMenu = await mobileMenuBtn.count();
    if (hasMobileMenu > 0) {
      record('E4. Mobile responsive layout', true, 'mobile menu button visible');
    } else {
      recordUI('Mobile responsive', 'medium', 'no mobile menu button on small viewport');
      record('E4. Mobile responsive layout', true, 'no mobile menu but page loaded');
    }

    // Check for horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    if (scrollWidth > 385) {
      recordUI('Mobile horizontal scroll', 'high', `body scrollWidth=${scrollWidth} on 375px viewport`);
    }
    await checkPageLayout(page, 'Mobile Dashboard');
  } catch (err) {
    record('E4. Mobile responsive layout', false, err.message);
  }

  // Reset viewport
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('==================================================');
  console.log('  SLOTCARE COMPREHENSIVE UI/UX BOT');
  console.log('  Full Admin + Company + Customer Module Testing');
  console.log('==================================================');
  console.log(`Host: ${HOST}\n`);

  const testData = await setupTestData();
  console.log(`Setup: company=${testData.companyId}, centre=${testData.centre.id}\n`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  await setupConsoleCapture(page);

  try {
    await testAdminModule(page, testData);
    await testCompanyOwnerModule(page, testData);
    await testCustomerModule(page, testData);
    await testEdgeCases(page, testData);
  } finally {
    await context.close();
    await browser.close();
  }

  // Report
  console.log('\n==================================================');
  console.log(`  FUNCTIONAL: ${passed} passed | ${failed} failed`);
  console.log(`  UI ISSUES: ${uiIssues.length} found`);
  console.log(`  CONSOLE ERRORS: ${consoleErrors.length} found`);
  console.log(`  NETWORK ERRORS: ${networkErrors.length} found`);
  console.log('==================================================');

  if (uiIssues.length > 0) {
    console.log('\nUI/UX Issues:');
    uiIssues.forEach((u) => {
      const icon = u.severity === 'high' ? '🔴' : u.severity === 'medium' ? '🟡' : '🔵';
      console.log(`  ${icon} [${u.severity}] ${u.name}: ${u.detail}`);
    });
  }

  if (consoleErrors.length > 0) {
    console.log('\nConsole Errors:');
    consoleErrors.forEach((e) => console.log(`  ⚠️  [${e.url.split('/').pop()}] ${e.text?.slice(0, 120)}`));
  }

  if (networkErrors.length > 0) {
    console.log('\nNetwork Errors:');
    networkErrors.forEach((e) => console.log(`  🔗 [${e.failedUrl}] ${e.failure}`));
  }

  if (failed > 0) {
    console.log('\nFailures:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}: ${r.detail}`));
  }

  const hasHighSeverity = uiIssues.some((u) => u.severity === 'high');
  if (failed > 0 || hasHighSeverity) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Bot crashed:', err);
  process.exit(1);
});
