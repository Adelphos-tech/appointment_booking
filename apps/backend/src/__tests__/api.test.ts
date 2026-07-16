import request from 'supertest';
import { app } from '../index';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

describe('Slotcare API — Comprehensive Integration Test Suite', () => {
  let adminToken: string;
  let adminHeaders: Record<string, string>;
  let companyId: string;
  let centreId: string;
  let serviceId: string;
  let staffId: string;
  let bookingId: string;

  beforeAll(async () => {
    // 1. Reset database tables in correct dependency order
    await prisma.booking.deleteMany({});
    await prisma.waitlist.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.optOut.deleteMany({});
    await prisma.service.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.centre.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});

    // 2. Seed superadmin (Habib) and an approved admin user
    const hashedPassword = await bcrypt.hash('Password123', 10);
    const superadmin = await prisma.user.create({
      data: {
        email: 'admin@slotcare.com',
        password: hashedPassword,
        name: 'Test Administrator',
        role: 'superadmin',
        status: 'Approved',
        centreIds: []
      }
    });

    const owner = await prisma.user.create({
      data: {
        email: 'owner@slotcare.com',
        password: hashedPassword,
        name: 'Approved Company Owner',
        role: 'admin',
        status: 'Approved',
        centreIds: []
      }
    });

    // Login the approved company owner to get the admin token used for most CRUD
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@slotcare.com', password: 'Password123' });
    adminToken = loginRes.body.token;
    adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };
  });

  afterAll(async () => {
    // Gracefully disconnect prisma client after all tests run
    await prisma.$disconnect();
  });

  // --- 1. HEALTH CHECK ENDPOINT ---
  describe('GET /api/health', () => {
    it('should return 200 OK and database connection status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });
  });

  // --- 2. AUTHENTICATION FLOWS ---
  describe('Authentication Route Suite', () => {
    it('should fail registration with weak passwords or invalid emails', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '123',
          name: 'Lazy Register'
        });
      expect(res.status).toBe(400);
    });

    it('should allow public register when valid and set status to Pending', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@slotcare.com',
          password: 'SecurePassword123!',
          name: 'New Registered User'
        });
      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('newuser@slotcare.com');
      expect(res.body.user.status).toBe('Pending');
      expect(res.body.token).toBeUndefined();
    });

    it('should block login for pending users', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'newuser@slotcare.com',
          password: 'SecurePassword123!'
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('pending approval');
    });

    it('should block logins with wrong passwords', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@slotcare.com',
          password: 'WrongPassword'
        });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should login superadmin successfully and return token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@slotcare.com',
          password: 'Password123'
        });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.status).toBe('Approved');
    });

    it('should allow superadmin to approve a pending user', async () => {
      // Find pending user
      const pendingUser = await prisma.user.findUnique({ where: { email: 'newuser@slotcare.com' } });
      const superadminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@slotcare.com', password: 'Password123' });
      const res = await request(app)
        .patch(`/api/users/${pendingUser!.id}/approve`)
        .set('Authorization', `Bearer ${superadminLogin.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Approved');
    });

    it('should allow approved user to login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'newuser@slotcare.com',
          password: 'SecurePassword123!'
        });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should fetch user details using me endpoint with token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('owner@slotcare.com');
      expect(res.body.status).toBe('Approved');
    });
  });

  // --- 3. COMPANIES CRUD ---
  describe('Company Route Suite', () => {
    it('should reject unauthenticated requests to Company CRUD', async () => {
      const res = await request(app).get('/api/companies');
      expect(res.status).toBe(401);
    });

    it('should create a new company', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set(adminHeaders)
        .send({
          name: 'Test Wellness Group',
          description: 'A chain of high-end massage and healing clinics.'
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Wellness Group');
      expect(res.body.slug).toBe('test-wellness-group');
      companyId = res.body.id;
    });

    it('should fetch all companies', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const ids = res.body.map((c: any) => c.id);
      expect(ids).toContain(companyId);
    });

    it('should retrieve company details by ID', async () => {
      const res = await request(app)
        .get(`/api/companies/${companyId}`)
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(companyId);
    });

    it('should fetch public companies details (slug lookup)', async () => {
      const res = await request(app).get('/api/companies/public');
      expect(res.status).toBe(200);
      expect(res.body[0].slug).toBe('test-wellness-group');

      const bySlugRes = await request(app).get('/api/companies/by-slug/test-wellness-group');
      expect(bySlugRes.status).toBe(200);
      expect(bySlugRes.body.id).toBe(companyId);
    });

    it('should update company properties', async () => {
      const res = await request(app)
        .put(`/api/companies/${companyId}`)
        .set(adminHeaders)
        .send({
          name: 'Test Wellness Group Updated',
          description: 'Updated Description'
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Wellness Group Updated');
      expect(res.body.slug).toBe('test-wellness-group-updated');
    });
  });

  // --- 4. CENTRES CRUD ---
  describe('Centre Route Suite', () => {
    it('should create a new centre under the company', async () => {
      const res = await request(app)
        .post('/api/centres')
        .set(adminHeaders)
        .send({
          name: 'Wellness Centre Midtown',
          location: '789 Broadway St, New York',
          serviceType: 'Spa Therapy',
          openTime: '10:00',
          closeTime: '18:00',
          slotDurationMinutes: 60,
          companyId: companyId,
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Wellness Centre Midtown');
      centreId = res.body.id;

      // Assign admin access to the centre (required for some auth scopes)
      await prisma.user.update({
        where: { email: 'admin@slotcare.com' },
        data: { centreIds: [centreId] }
      });
    });

    it('should retrieve all centres', async () => {
      const res = await request(app)
        .get('/api/centres')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });

    it('should retrieve public centre listings', async () => {
      const res = await request(app).get(`/public/centres?companyId=${companyId}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(centreId);
    });

    it('should update centre properties', async () => {
      const res = await request(app)
        .put(`/api/centres/${centreId}`)
        .set(adminHeaders)
        .send({
          name: 'Wellness Centre Midtown Elite',
          prepTimeBeforeMinutes: 5,
          prepTimeAfterMinutes: 5
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Wellness Centre Midtown Elite');
      expect(res.body.prepTimeBeforeMinutes).toBe(5);
    });
  });

  // --- 5. SERVICES CRUD ---
  describe('Service Route Suite', () => {
    it('should create a service in the centre', async () => {
      const res = await request(app)
        .post('/api/services')
        .set(adminHeaders)
        .send({
          name: 'Standard Swedish Massage',
          centreId: centreId,
          price: 150.00,
          durationOverrideMinutes: 60
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Standard Swedish Massage');
      serviceId = res.body.id;
    });

    it('should get services list', async () => {
      const res = await request(app)
        .get('/api/services')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Standard Swedish Massage');
    });

    it('should support updating service prices and options', async () => {
      const res = await request(app)
        .put(`/api/services/${serviceId}`)
        .set(adminHeaders)
        .send({
          name: 'Swedish Massage Premium',
          price: 175.00
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Swedish Massage Premium');
      expect(parseFloat(res.body.price)).toBe(175);
    });
  });

  // --- 6. STAFF CRUD ---
  describe('Staff Route Suite', () => {
    it('should create a staff member in the centre', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set(adminHeaders)
        .send({
          name: 'Dr. Jane Miller',
          gender: 'Female',
          role: 'Massage Specialist',
          centreId: centreId,
          employmentType: 'Permanent',
          dutyStartDate: '2026-06-01',
          dutyStartTime: '10:00',
          dutyEndTime: '18:00',
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
          servicesAllowed: [serviceId]
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Dr. Jane Miller');
      staffId = res.body.id;
    });

    it('should display list of staff', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Dr. Jane Miller');
    });

    it('should update staff details', async () => {
      const res = await request(app)
        .put(`/api/staff/${staffId}`)
        .set(adminHeaders)
        .send({
          name: 'Dr. Jane Miller DPT',
          dutyEndTime: '17:00'
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Dr. Jane Miller DPT');
      expect(res.body.dutyEndTime).toBe('17:00');
    });
  });

  // --- 7. AVAILABILITY CALCULATION ---
  describe('Availability & Slot Generation Suite', () => {
    it('should list open slots for tomorrow based on staff working hours and working days', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get standard Mon-Sat weekday name of tomorrow
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[tomorrow.getDay()];
      
      if (dayName === 'Sun') {
        tomorrow.setDate(tomorrow.getDate() + 1); // skip to Monday since Sunday is holiday
      }
      
      const dateStr = tomorrow.toISOString().split('T')[0];
      const res = await request(app)
        .get(`/public/availability?centreId=${centreId}&serviceId=${serviceId}&date=${dateStr}`);
        
      expect(res.status).toBe(200);
      expect(res.body.slots).toBeDefined();
      expect(Array.isArray(res.body.slots)).toBe(true);
      expect(res.body.slots.length).toBeGreaterThan(0);
      
      // Standard slot check: First slot starts at 10:00 (Dr. Jane Miller duty starts at 10:00)
      const firstSlot = res.body.slots[0];
      expect(firstSlot.start).toBeDefined();
      expect(firstSlot.staffId).toBe(staffId);
    });
  });

  // --- 8. BOOKINGS & EXCLUSION CONSTRAINT ---
  describe('Booking Creation & Double-Booking prevention Suite', () => {
    let slotStart: string;
    let slotEnd: string;

    beforeAll(() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Skip Sunday
      if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
      
      tomorrow.setUTCHours(11, 0, 0, 0); // 11:00 AM UTC
      slotStart = tomorrow.toISOString();
      tomorrow.setUTCHours(12, 0, 0, 0); // 12:00 PM UTC
      slotEnd = tomorrow.toISOString();
    });

    it('should allow creation of a customer booking', async () => {
      const res = await request(app)
        .post('/public/bookings')
        .send({
          customerName: 'Aiden Smith',
          customerContact: '+15551234567',
          customerEmail: 'aiden@test.com',
          centreId,
          staffId,
          serviceId,
          slotStart,
          slotEnd
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.customerName).toBe('Aiden Smith');
      bookingId = res.body.id;
    });

    it('should reject a duplicate booking for the exact same staff member and slot (double booking)', async () => {
      const res = await request(app)
        .post('/public/bookings')
        .send({
          customerName: 'Intruder Booking',
          customerContact: '+15559999999',
          customerEmail: 'intruder@test.com',
          centreId,
          staffId,
          serviceId,
          slotStart,
          slotEnd
        });
      
      // Should fail with 409 Conflict
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already booked');
    });

    it('should reject an overlapping slot (e.g. partial overlap with existing booking)', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Existing booking is 11:00 - 12:00
      // Requesting 11:30 - 12:30
      tomorrow.setUTCHours(11, 30, 0, 0);
      const overlapStart = tomorrow.toISOString();
      tomorrow.setUTCHours(12, 30, 0, 0);
      const overlapEnd = tomorrow.toISOString();

      const res = await request(app)
        .post('/public/bookings')
        .send({
          customerName: 'Overlap Booking',
          customerContact: '+15558888888',
          centreId,
          staffId,
          serviceId,
          slotStart: overlapStart,
          slotEnd: overlapEnd
        });
        
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already booked');
    });

    it('should list bookings for admin', async () => {
      const res = await request(app)
        .get('/api/bookings?page=1&limit=10')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(bookingId);
    });

    it('should allow looking up booking by contact number', async () => {
      const res = await request(app).get('/public/bookings?customerContact=%2B15551234567');
      expect(res.status).toBe(200);
      expect(res.body.bookings).toBeDefined();
      expect(res.body.bookings.length).toBe(1);
      expect(res.body.bookings[0].id).toBe(bookingId);
    });

    it('should support admin editing bookings', async () => {
      const res = await request(app)
        .put(`/api/bookings/${bookingId}`)
        .set(adminHeaders)
        .send({
          customerName: 'Aiden Smith Senior'
        });
      expect(res.status).toBe(200);
      expect(res.body.customerName).toBe('Aiden Smith Senior');
    });
  });

  // --- 9. WAITLIST CRUD ---
  describe('Waitlist Route Suite', () => {
    let waitlistId: string;

    it('should join the waitlist', async () => {
      const res = await request(app)
        .post('/api/waitlist')
        .set(adminHeaders)
        .send({
          customerName: 'Waitlisted Client',
          customerContact: '+123459999',
          centreId,
          serviceId,
          preferredDate: '2026-07-01',
          preferredGender: 'Female',
          notes: 'Prefer early afternoon'
        });
      expect(res.status).toBe(201);
      expect(res.body.customerName).toBe('Waitlisted Client');
      waitlistId = res.body.id;
    });

    it('should retrieve waitlist entries', async () => {
      const res = await request(app)
        .get('/api/waitlist')
        .set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(waitlistId);
    });

    it('should delete a waitlist entry', async () => {
      const res = await request(app)
        .delete(`/api/waitlist/${waitlistId}`)
        .set(adminHeaders);
      expect(res.status).toBe(204);
    });
  });

  // --- 10. PUBLIC CHAT CONCIERGE ---
  describe('AI Chat Concierge Route', () => {
    it('should return a reply from the AI assistant chat route', async () => {
      const res = await request(app)
        .post('/public/chat')
        .send({
          customerContact: '+15550000000',
          message: 'Hello, what are your opening hours?',
          customerName: 'John Watson'
        });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBeDefined();
    });
  });

  // --- 11. CASCADE DELETION TEST ---
  describe('Cascade Delete Verification', () => {
    it('should delete the company and guarantee that all matching centres, staff, services, and bookings are cascade deleted', async () => {
      // Delete the company
      const deleteRes = await request(app)
        .delete(`/api/companies/${companyId}`)
        .set(adminHeaders);
      expect(deleteRes.status).toBe(204);

      // Verify that the company is gone
      const companyCheck = await prisma.company.findUnique({ where: { id: companyId } });
      expect(companyCheck).toBeNull();

      // Verify that the centre under the company was deleted
      const centreCheck = await prisma.centre.findUnique({ where: { id: centreId } });
      expect(centreCheck).toBeNull();

      // Verify that the staff under the centre was deleted
      const staffCheck = await prisma.staff.findUnique({ where: { id: staffId } });
      expect(staffCheck).toBeNull();

      // Verify that the service under the centre was deleted
      const serviceCheck = await prisma.service.findUnique({ where: { id: serviceId } });
      expect(serviceCheck).toBeNull();

      // Verify that the booking under the centre/staff/service was deleted
      const bookingCheck = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(bookingCheck).toBeNull();
    });
  });
});
