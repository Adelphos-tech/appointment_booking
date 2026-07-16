const host = process.env.HOST || 'http://127.0.0.1:5000';

async function runTests() {
  console.log('==================================================');
  console.log('    SLOTCARE AI — INTEGRATION TEST SUITE          ');
  console.log('==================================================');
  console.log(`Target Host: ${host}\n`);

  const report = [];
  let passed = 0;
  let failed = 0;

  function addResult(name, success, details) {
    if (success) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      failed++;
      console.error(`[FAIL] ${name} - Details:`, details);
    }
    report.push({ name, status: success ? 'PASSED ✅' : 'FAILED ❌', details: String(details || '') });
  }

  let token = '';
  let centreId = '';
  let staffId = '';
  let serviceId = '';
  let bookingId = '';

  // 1. Admin Authentication Login
  try {
    const res = await fetch(`${host}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@slotcare.com', password: 'Password123' })
    });
    const data = await res.json();
    if (res.status === 200 && data.token) {
      token = data.token;
      addResult('1. Admin Authentication Login (POST /api/auth/login)', true, `Logged in successfully. Token: ${token.substring(0, 15)}...`);
    } else {
      addResult('1. Admin Authentication Login (POST /api/auth/login)', false, `Status: ${res.status}, Error: ${data.error}`);
    }
  } catch (err) {
    addResult('1. Admin Authentication Login (POST /api/auth/login)', false, err.message);
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Fetch User Profile
  if (token) {
    try {
      const res = await fetch(`${host}/api/auth/me`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && data.email === 'admin@slotcare.com') {
        addResult('2. Fetch User Profile (GET /api/auth/me)', true, `User: ${data.name} (${data.role})`);
      } else {
        addResult('2. Fetch User Profile (GET /api/auth/me)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('2. Fetch User Profile (GET /api/auth/me)', false, err.message);
    }
  }

  // 3. Fetch Companies List
  if (token) {
    try {
      const res = await fetch(`${host}/api/companies`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data) && data.length > 0) {
        addResult('3. List Companies (GET /api/companies)', true, `Found ${data.length} companies.`);
      } else {
        addResult('3. List Companies (GET /api/companies)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('3. List Companies (GET /api/companies)', false, err.message);
    }
  }

  // 4. Fetch Centres List
  if (token) {
    try {
      const res = await fetch(`${host}/api/centres`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data) && data.length > 0) {
        centreId = data[0].id;
        addResult('4. List Centres (GET /api/centres)', true, `Found ${data.length} centres. Selected: ${data[0].name} (${centreId})`);
      } else {
        addResult('4. List Centres (GET /api/centres)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('4. List Centres (GET /api/centres)', false, err.message);
    }
  }

  // 5. Fetch Services List
  if (token) {
    try {
      const res = await fetch(`${host}/api/services`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data) && data.length > 0) {
        // filter by centre
        const filtered = data.filter(s => s.centreId === centreId);
        serviceId = filtered.length > 0 ? filtered[0].id : data[0].id;
        addResult('5. List Services (GET /api/services)', true, `Found ${data.length} services. Selected: ${data[0].name} (${serviceId})`);
      } else {
        addResult('5. List Services (GET /api/services)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('5. List Services (GET /api/services)', false, err.message);
    }
  }

  // 6. Fetch Staff List
  if (token) {
    try {
      const res = await fetch(`${host}/api/staff`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data) && data.length > 0) {
        const filtered = data.filter(s => s.centreId === centreId);
        staffId = filtered.length > 0 ? filtered[0].id : data[0].id;
        addResult('6. List Staff (GET /api/staff)', true, `Found ${data.length} staff. Selected: ${data[0].name} (${staffId})`);
      } else {
        addResult('6. List Staff (GET /api/staff)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('6. List Staff (GET /api/staff)', false, err.message);
    }
  }

  // 7. Check Live Availability (Public endpoint)
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const url = `${host}/public/availability?centreId=${centreId}&date=${dateStr}&serviceId=${serviceId}`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.status === 200 && data.slots) {
      addResult('7. Check Live Availability (GET /public/availability)', true, `Found ${data.slots.length} available slots for date ${dateStr}`);
    } else {
      addResult('7. Check Live Availability (GET /public/availability)', false, `Status: ${res.status}`);
    }
  } catch (err) {
    addResult('7. Check Live Availability (GET /public/availability)', false, err.message);
  }

  // 8. Create Booking & Prevent Double-Booking (Public endpoint)
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(11, 0, 0, 0); // 11am UTC
    const slotStart = tomorrow.toISOString();
    tomorrow.setUTCHours(12, 0, 0, 0); // 12pm UTC
    const slotEnd = tomorrow.toISOString();

    const bookingPayload = {
      customerName: 'Integration Test Bot',
      customerContact: '+19998887777',
      customerEmail: 'testbot@slotcare.com',
      centreId,
      staffId,
      serviceId,
      slotStart,
      slotEnd
    };

    // First booking - should succeed
    const res1 = await fetch(`${host}/public/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload)
    });
    const data1 = await res1.json();
    
    if (res1.status === 201 && data1.id) {
      bookingId = data1.id;
      addResult('8a. Create Customer Booking (POST /public/bookings)', true, `Booking created successfully. ID: ${bookingId}`);
      
      // Second booking with identical slot - should fail with 409 Conflict
      const res2 = await fetch(`${host}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bookingPayload,
          customerName: 'Double Booking Attacker'
        })
      });
      const data2 = await res2.json();
      
      if (res2.status === 409) {
        addResult('8b. Prevent Double-Booking Conflict Check (POST /public/bookings)', true, `Correctly blocked double-booking. Message: "${data2.error}"`);
      } else {
        addResult('8b. Prevent Double-Booking Conflict Check (POST /public/bookings)', false, `Expected 409 Conflict status but got ${res2.status}`);
      }
    } else {
      addResult('8a. Create Customer Booking (POST /public/bookings)', false, `Status: ${res1.status}, Error: ${data1.error}`);
      addResult('8b. Prevent Double-Booking Conflict Check (POST /public/bookings)', false, 'Skipped due to booking creation failure');
    }
  } catch (err) {
    addResult('8. Create/Double-Booking', false, err.message);
  }

  // 9. Fetch Waitlist
  if (token) {
    try {
      const res = await fetch(`${host}/api/waitlist`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data)) {
        addResult('9. List Waitlist Entries (GET /api/waitlist)', true, `Found ${data.length} waitlisted entries.`);
      } else {
        addResult('9. List Waitlist Entries (GET /api/waitlist)', false, `Status: ${res.status}`);
      }
    } catch (err) {
      addResult('9. List Waitlist Entries (GET /api/waitlist)', false, err.message);
    }
  }

  // 10. AI Chat assistant query
  try {
    const res = await fetch(`${host}/public/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerContact: '+1234567890',
        message: 'hello, who are you?',
        customerName: 'Frankie'
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.reply) {
      addResult('10. AI Chat Query (POST /public/chat)', true, `AI Assistant replied: "${data.reply}"`);
    } else {
      addResult('10. AI Chat Query (POST /public/chat)', false, `Status: ${res.status}`);
    }
  } catch (err) {
    addResult('10. AI Chat Query (POST /public/chat)', false, err.message);
  }

  // Cleanup: Delete the created test booking
  if (token && bookingId) {
    try {
      const res = await fetch(`${host}/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.status === 204) {
        console.log(`[CLEANUP] Deleted test booking ${bookingId}`);
      }
    } catch (err) {
      console.error('Cleanup failed:', err.message);
    }
  }

  console.log('\n==================================================');
  console.log(`    TEST RUN SUMMARY: ${passed} PASSED | ${failed} FAILED  `);
  console.log('==================================================\n');

  // Generate Markdown report text
  let md = `# Integration Test Execution Report\n\n`;
  md += `**Date:** ${new Date().toUTCString()}\n`;
  md += `**Target URL:** \`${host}\`\n`;
  md += `**Summary:** **${passed}** checks passed, **${failed}** checks failed.\n\n`;
  md += `| Test Case | Status | Details / Logs |\n`;
  md += `|-----------|--------|----------------|\n`;
  report.forEach(item => {
    md += `| ${item.name} | ${item.status} | ${item.details.replace(/\n/g, ' ')} |\n`;
  });

  return md;
}

runTests().then(reportMd => {
  // Save locally or print
  console.log(reportMd);
});
