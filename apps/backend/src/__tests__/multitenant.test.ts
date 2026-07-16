import request from 'supertest';
import { app } from '../index';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

describe('Multi-Tenant Company Admin Isolation Test Suite', () => {
  let superadminToken: string;
  let companyAId: string;
  let companyBId: string;
  
  let adminAToken: string;
  let adminBToken: string;

  let centreAId: string;
  let centreBId: string;

  beforeAll(async () => {
    // Clean up
    await prisma.booking.deleteMany({});
    await prisma.waitlist.deleteMany({});
    await prisma.service.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.centre.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.user.deleteMany({});

    // Create superadmin
    const superadminPass = await bcrypt.hash('SuperAdmin123!', 10);
    const superadmin = await prisma.user.create({
      data: {
        email: 'super@slotcare.com',
        password: superadminPass,
        name: 'Super Admin',
        role: 'superadmin',
        status: 'Approved',
      },
    });

    // Login superadmin to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@slotcare.com', password: 'SuperAdmin123!' });
    superadminToken = loginRes.body.token;

    // Create approved admin users who will each own a company
    const passHash = await bcrypt.hash('AdminPass123!', 10);
    const userA = await prisma.user.create({
      data: {
        email: 'admina@comp-a.com',
        password: passHash,
        name: 'Admin A',
        role: 'admin',
        status: 'Approved',
      },
    });

    const userB = await prisma.user.create({
      data: {
        email: 'adminb@comp-b.com',
        password: passHash,
        name: 'Admin B',
        role: 'admin',
        status: 'Approved',
      },
    });

    // Login Admins to get tokens
    const loginARes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admina@comp-a.com', password: 'AdminPass123!' });
    adminAToken = loginARes.body.token;

    const loginBRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'adminb@comp-b.com', password: 'AdminPass123!' });
    adminBToken = loginBRes.body.token;

    // Create Company A by Admin A and Company B by Admin B
    const compARes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ name: 'Company A', slug: 'comp-a' });
    companyAId = compARes.body.id;

    const compBRes = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ name: 'Company B', slug: 'comp-b' });
    companyBId = compBRes.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Centre Isolation', () => {
    it('should allow Admin A to create a centre under Company A', async () => {
      const res = await request(app)
        .post('/api/centres')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          name: 'Centre A',
          location: 'Location A',
          serviceType: 'Health',
          openTime: '09:00',
          closeTime: '17:00',
          slotDurationMinutes: 30,
          companyId: companyAId,
        });
      expect(res.status).toBe(201);
      centreAId = res.body.id;
      expect(res.body.companyId).toBe(companyAId);
    });

    it('should prevent Admin A from creating a centre under Company B', async () => {
      const res = await request(app)
        .post('/api/centres')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          name: 'Centre Bad',
          location: 'Location B',
          serviceType: 'Health',
          openTime: '09:00',
          closeTime: '17:00',
          slotDurationMinutes: 30,
          companyId: companyBId,
        });
      expect(res.status).toBe(403);
    });

    it('should allow Admin B to create a centre under Company B', async () => {
      const res = await request(app)
        .post('/api/centres')
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({
          name: 'Centre B',
          location: 'Location B',
          serviceType: 'Health',
          openTime: '09:00',
          closeTime: '17:00',
          slotDurationMinutes: 30,
          companyId: companyBId,
        });
      expect(res.status).toBe(201);
      centreBId = res.body.id;
    });

    it('should only return Centre A when Admin A requests centres', async () => {
      const res = await request(app)
        .get('/api/centres')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(centreAId);
    });

    it('should prevent Admin A from retrieving Centre B details directly', async () => {
      const res = await request(app)
        .get(`/api/centres/${centreBId}`)
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(res.status).toBe(403);
    });

    it('should prevent Admin A from updating Centre B', async () => {
      const res = await request(app)
        .put(`/api/centres/${centreBId}`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ name: 'Hacked name' });
      expect(res.status).toBe(403);
    });

    it('should prevent Admin A from deleting Centre B', async () => {
      const res = await request(app)
        .delete(`/api/centres/${centreBId}`)
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Staff & Services Isolation', () => {
    it('should prevent Admin A from adding staff to Centre B', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          name: 'Hacker Staff',
          gender: 'Male',
          role: 'Therapist',
          centreId: centreBId,
          dutyStartDate: '2026-06-25',
          dutyStartTime: '09:00',
          dutyEndTime: '17:00',
        });
      expect(res.status).toBe(403);
    });

    it('should prevent Admin A from adding a service to Centre B', async () => {
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          name: 'Hacker Massage',
          centreId: centreBId,
        });
      expect(res.status).toBe(403);
    });
  });
});
