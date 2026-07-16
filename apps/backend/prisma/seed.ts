import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing database tables...');
  
  // Clean tables in reverse dependency order
  await prisma.booking.deleteMany({});
  await prisma.waitlist.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.optOut.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.centre.deleteMany({});
  await prisma.company.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Seeding administrative users...');
  
  const seedPassword = process.env.SUPERADMIN_PASSWORD || process.env.SEED_PASSWORD || 'Password123';
  const hashedPassword = await bcrypt.hash(seedPassword, 10);
  
  // Super admin (Habib)
  const superAdmin = await prisma.user.create({
    data: {
      email: 'habib@slotcare.com',
      password: hashedPassword,
      name: 'Habib (Super Admin)',
      role: 'superadmin',
      status: 'Approved',
      centreIds: [],
    },
  });

  // Regular admin
  const regularAdmin = await prisma.user.create({
    data: {
      email: 'admin@slotcare.com',
      password: hashedPassword,
      name: 'Branch Manager',
      role: 'admin',
      status: 'Approved',
      centreIds: [],
    },
  });

  console.log('Seeding companies...');

  const spaCompany = await prisma.company.create({
    data: {
      name: 'Aurora Wellness Group',
      slug: 'aurora',
      description: 'Premium spa, massage, and facial therapy group.',
    },
  });

  const fitnessCompany = await prisma.company.create({
    data: {
      name: 'Apex Training Center',
      slug: 'apex',
      description: 'State of the art fitness and personal training gyms.',
    },
  });

  console.log('Seeding centres...');

  const spaCentre = await prisma.centre.create({
    data: {
      name: 'Aurora Spa Downtown',
      location: '123 Luxury Ave, Suite 100',
      serviceType: 'Spa & Wellness',
      openTime: '10:00',
      closeTime: '18:00',
      slotDurationMinutes: 60,
      prepTimeBeforeMinutes: 0,
      prepTimeAfterMinutes: 0,
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      companyId: spaCompany.id,
    },
  });

  const fitnessCentre = await prisma.centre.create({
    data: {
      name: 'Apex Gym East',
      location: '456 Muscle St, Block B',
      serviceType: 'Fitness & Gym',
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 30,
      prepTimeBeforeMinutes: 5,
      prepTimeAfterMinutes: 5,
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      companyId: fitnessCompany.id,
    },
  });

  // Assign regular admin to both centres
  await prisma.user.update({
    where: { id: regularAdmin.id },
    data: { centreIds: [spaCentre.id, fitnessCentre.id] },
  });

  console.log('Seeding services...');

  const massage = await prisma.service.create({
    data: {
      name: 'Deep Tissue Massage (60 Min)',
      centreId: spaCentre.id,
      durationOverrideMinutes: 60,
      price: 120.00,
    },
  });

  const facial = await prisma.service.create({
    data: {
      name: 'Aromatherapy Facial (45 Min)',
      centreId: spaCentre.id,
      durationOverrideMinutes: 45,
      price: 95.00,
    },
  });

  const personalTraining = await prisma.service.create({
    data: {
      name: 'Personal Training Session',
      centreId: fitnessCentre.id,
      durationOverrideMinutes: 30,
      price: 60.00,
    },
  });

  console.log('Seeding staff members...');

  // Aurora Spa staff (Emma - Female, John - Male)
  const emma = await prisma.staff.create({
    data: {
      name: 'Emma Stone',
      gender: 'Female',
      role: 'Therapist',
      centreId: spaCentre.id,
      employmentType: 'Permanent',
      dutyStartDate: '2026-06-01',
      dutyStartTime: '10:00',
      dutyEndTime: '18:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      servicesAllowed: [massage.id, facial.id],
    },
  });

  const john = await prisma.staff.create({
    data: {
      name: 'John Carter',
      gender: 'Male',
      role: 'Therapist',
      centreId: spaCentre.id,
      employmentType: 'Permanent',
      dutyStartDate: '2026-06-01',
      dutyStartTime: '10:00',
      dutyEndTime: '18:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      servicesAllowed: [massage.id],
    },
  });

  // Apex Fitness staff (Sarah - Female, David - Male)
  const sarah = await prisma.staff.create({
    data: {
      name: 'Sarah Connor',
      gender: 'Female',
      role: 'Personal Trainer',
      centreId: fitnessCentre.id,
      employmentType: 'Permanent',
      dutyStartDate: '2026-06-01',
      dutyStartTime: '08:00',
      dutyEndTime: '16:00',
      workingDays: ['Mon', 'Wed', 'Fri'],
      servicesAllowed: [personalTraining.id],
    },
  });

  const david = await prisma.staff.create({
    data: {
      name: 'David Miller',
      gender: 'Male',
      role: 'Personal Trainer',
      centreId: fitnessCentre.id,
      employmentType: 'Permanent',
      dutyStartDate: '2026-06-01',
      dutyStartTime: '12:00',
      dutyEndTime: '20:00',
      workingDays: ['Tue', 'Thu', 'Sat'],
      servicesAllowed: [personalTraining.id],
    },
  });

  console.log('Seeding bookings...');

  const today = new Date();
  const formatIso = (offsetDays: number, hour: number, minute: number = 0) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Historical completed booking
  await prisma.booking.create({
    data: {
      customerName: 'Alice Smith',
      customerContact: '+12223334444',
      customerEmail: 'alice@example.com',
      centreId: spaCentre.id,
      staffId: emma.id,
      serviceId: massage.id,
      slotStart: formatIso(-2, 11),
      slotEnd: formatIso(-2, 12),
      status: 'Completed',
      paymentStatus: 'Paid',
    },
  });

  // Historical cancelled booking
  await prisma.booking.create({
    data: {
      customerName: 'Bob Jenkins',
      customerContact: '+15556667777',
      centreId: spaCentre.id,
      staffId: john.id,
      serviceId: massage.id,
      slotStart: formatIso(-1, 14),
      slotEnd: formatIso(-1, 15),
      status: 'Cancelled',
      paymentStatus: 'Pending',
    },
  });

  // Upcoming tomorrow slots
  const booking1 = await prisma.booking.create({
    data: {
      customerName: 'Charlie Brown',
      customerContact: '+17778889999',
      customerEmail: 'charlie@example.com',
      centreId: spaCentre.id,
      staffId: emma.id,
      serviceId: massage.id,
      slotStart: formatIso(1, 10), // Tomorrow 10am
      slotEnd: formatIso(1, 11),
      status: 'Booked',
      paymentStatus: 'Paid',
    },
  });

  const booking2 = await prisma.booking.create({
    data: {
      customerName: 'Diana Prince',
      customerContact: '+18889990000',
      centreId: spaCentre.id,
      staffId: john.id,
      serviceId: massage.id,
      slotStart: formatIso(1, 15), // Tomorrow 3pm
      slotEnd: formatIso(1, 16),
      status: 'Booked',
      paymentStatus: 'Pending',
    },
  });

  const booking3 = await prisma.booking.create({
    data: {
      customerName: 'Ethan Hunt',
      customerContact: '+19990001111',
      centreId: fitnessCentre.id,
      staffId: david.id,
      serviceId: personalTraining.id,
      slotStart: formatIso(1, 14), // Tomorrow 2pm
      slotEnd: formatIso(1, 14, 30),
      status: 'Booked',
      paymentStatus: 'Pending',
    },
  });

  console.log('Seeding waitlist entries...');

  await prisma.waitlist.create({
    data: {
      customerName: 'Frank Castle',
      customerContact: '+14445556666',
      centreId: spaCentre.id,
      serviceId: massage.id,
      preferredDate: '2026-06-26',
      preferredGender: 'Male',
      notes: 'Wants an early morning massage slot if possible',
    },
  });

  console.log('Seeding conversation messages...');

  await prisma.conversation.create({
    data: {
      customerContact: '+1234567890',
      messages: JSON.stringify([
        { role: 'assistant', content: "Hi! I'm Slotcare. How can I assist you today?" },
        { role: 'user', content: 'Do you have any slots open tomorrow for Deep Tissue Massage?' },
        { role: 'assistant', content: 'Yes, John Carter is available at 10:00 AM, 11:00 AM, and 1:00 PM.' },
      ]),
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
