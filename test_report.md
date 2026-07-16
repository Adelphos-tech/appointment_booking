# Slotcare API — Verification & Integration Test Report

## Execution Metadata
- **Date/Time (UTC):** Thu, 25 Jun 2026 13:17:54 GMT
- **Target Database:** `slotcare` (PostgreSQL)
- **Database Host:** `127.0.0.1:5432`
- **Runtime Environment:** Local test environment
- **Test Framework:** Jest + Supertest (Express integration)

## Summary Dashboard

| Metric | Count | Status |
|--------|-------|--------|
| **Total Test Suites** | 1 | Passed ✅ |
| **Total Test Cases** | 34 | Passed ✅ |
| **Passed Tests** | 34 | ✅ |
| **Failed Tests** | 0 | None |
| **Execution Time** | 4.54s | - |

## Detailed Test Results

### Test Suite: `apps/backend/src/__tests__/api.test.ts`

| Test Case / Feature Checked | Status | Duration (ms) | Notes / Error logs |
|-----------------------------|--------|---------------|--------------------|
| Slotcare API — Comprehensive Integration Test Suite > GET /api/health > should return 200 OK and database connection status | PASSED ✅ | 13ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Authentication Route Suite > should fail registration with weak passwords or invalid emails | PASSED ✅ | 22ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Authentication Route Suite > should allow register when valid | PASSED ✅ | 81ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Authentication Route Suite > should block logins with wrong passwords | PASSED ✅ | 72ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Authentication Route Suite > should login admin successfully and return token | PASSED ✅ | 72ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Authentication Route Suite > should fetch user details using me endpoint with token | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should reject unauthenticated requests to Company CRUD | PASSED ✅ | 1ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should create a new company | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should fetch all companies | PASSED ✅ | 8ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should retrieve company details by ID | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should fetch public companies details (slug lookup) | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Company Route Suite > should update company properties | PASSED ✅ | 8ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Centre Route Suite > should create a new centre under the company | PASSED ✅ | 6ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Centre Route Suite > should retrieve all centres | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Centre Route Suite > should retrieve public centre listings | PASSED ✅ | 2ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Centre Route Suite > should update centre properties | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Service Route Suite > should create a service in the centre | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Service Route Suite > should get services list | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Service Route Suite > should support updating service prices and options | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Staff Route Suite > should create a staff member in the centre | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Staff Route Suite > should display list of staff | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Staff Route Suite > should update staff details | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Availability & Slot Generation Suite > should list open slots for tomorrow based on staff working hours and working days | PASSED ✅ | 6ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should allow creation of a customer booking | PASSED ✅ | 87ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should reject a duplicate booking for the exact same staff member and slot (double booking) | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should reject an overlapping slot (e.g. partial overlap with existing booking) | PASSED ✅ | 2ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should list bookings for admin | PASSED ✅ | 16ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should allow looking up booking by contact number | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Booking Creation & Double-Booking prevention Suite > should support admin editing bookings | PASSED ✅ | 6ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Waitlist Route Suite > should join the waitlist | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Waitlist Route Suite > should retrieve waitlist entries | PASSED ✅ | 4ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Waitlist Route Suite > should delete a waitlist entry | PASSED ✅ | 3ms |  |
| Slotcare API — Comprehensive Integration Test Suite > AI Chat Concierge Route > should return a reply from the AI assistant chat route | PASSED ✅ | 1567ms |  |
| Slotcare API — Comprehensive Integration Test Suite > Cascade Delete Verification > should delete the company and guarantee that all matching centres, staff, services, and bookings are cascade deleted | PASSED ✅ | 19ms |  |

## Database Constraint Integrity Checks
1. **No Double-Booking Exclusion Constraint**: Drop-tested the original buggy exclusion constraint. Replaced it with a correct PostgreSQL `tsrange` + `&&` (overlap operator) constraint. Verified that any exact or partial scheduling conflicts raise a `409 Conflict` error.
2. **Company to Centre Cascade Delete**: Verified that deleting a company cascade deletes its child centres.
3. **Centre Cascade Deletion**: Verified that deleting a centre deletes child services, staff members, bookings, and waitlist allocations.
