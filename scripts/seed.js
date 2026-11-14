import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const password = process.env.SEED_PASSWORD || process.env.ADMIN_PASSWORD;
if (!password) {
  throw new Error('Set SEED_PASSWORD or ADMIN_PASSWORD in backend/.env before running the seed.');
}

const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const adminPhone = process.env.ADMIN_PHONE || '+2348000000000';

async function seedUser(client, { email, fullName, phone, role, passwordHash }) {
  const { rows } = await client.query(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(email)) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = TRUE,
           updated_at = now()
     RETURNING id`,
    [fullName, email, phone, passwordHash, role],
  );
  return rows[0].id;
}

async function seedShop(client, { userId, businessName, description, state, cityArea, address, status, adminId }) {
  const { rows } = await client.query(
    `INSERT INTO shops
       (user_id, business_name, description, state, city_area, address, verification_status, verified_at, verified_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             CASE WHEN $7 = 'verified' THEN now() END,
             CASE WHEN $7 = 'verified' THEN $8::uuid END)
     ON CONFLICT (user_id) DO UPDATE
       SET business_name = EXCLUDED.business_name,
           description = EXCLUDED.description,
           state = EXCLUDED.state,
           city_area = EXCLUDED.city_area,
           address = EXCLUDED.address,
           verification_status = EXCLUDED.verification_status,
           verified_at = EXCLUDED.verified_at,
           verified_by = EXCLUDED.verified_by,
           updated_at = now()
     RETURNING id`,
    [userId, businessName, description, state, cityArea, address, status, adminId],
  );
  return rows[0].id;
}

async function setShopServices(client, shopId, codes, typesByCode) {
  const ids = codes.map((code) => typesByCode.get(code)).filter(Boolean);
  if (ids.length !== codes.length) {
    throw new Error(`Unknown service type in seed data: ${codes.filter((code) => !typesByCode.has(code)).join(', ')}`);
  }
  await client.query('DELETE FROM shop_services WHERE shop_id = $1', [shopId]);
  await client.query(
    `INSERT INTO shop_services (shop_id, service_type_id)
     SELECT $1::uuid, unnest($2::smallint[])`,
    [shopId, ids],
  );
}

async function seedVehicle(client, { ownerId, make, model, year, plateNumber }) {
  const { rows } = await client.query(
    `INSERT INTO vehicles (owner_id, vehicle_type, make, model, year, plate_number, fuel_type)
     VALUES ($1, 'car', $2, $3, $4, $5, 'petrol')
     ON CONFLICT (owner_id, plate_number) DO UPDATE
       SET make = EXCLUDED.make,
           model = EXCLUDED.model,
           year = EXCLUDED.year,
           updated_at = now()
     RETURNING id`,
    [ownerId, make, model, year, plateNumber],
  );
  return rows[0].id;
}

async function seedRequest(client, { ownerId, vehicleId, shopId, symptoms, serviceAddress }) {
  const { rows: existing } = await client.query(
    `SELECT id FROM service_requests
     WHERE owner_id = $1 AND vehicle_id = $2 AND shop_id = $3 AND symptoms = $4`,
    [ownerId, vehicleId, shopId, symptoms],
  );
  if (existing[0]) return existing[0].id;

  const { rows } = await client.query(
    `INSERT INTO service_requests
       (owner_id, vehicle_id, shop_id, symptoms, urgency, location_type, service_address)
     VALUES ($1, $2, $3, $4, 'standard', 'visit_shop', $5)
     RETURNING id`,
    [ownerId, vehicleId, shopId, symptoms, serviceAddress],
  );
  return rows[0].id;
}

async function seedQuote(client, { requestId, labourKobo, itemsTotalKobo, notes }) {
  await client.query(
    `INSERT INTO quotes
       (service_request_id, version, status, labour_kobo, items_total_kobo, total_kobo, notes)
     VALUES ($1, 1, 'active', $2, $3, $2::bigint + $3::bigint, $4)
     ON CONFLICT (service_request_id, version) DO UPDATE
       SET status = 'active',
           labour_kobo = EXCLUDED.labour_kobo,
           items_total_kobo = EXCLUDED.items_total_kobo,
           total_kobo = EXCLUDED.total_kobo,
           notes = EXCLUDED.notes,
           updated_at = now()`,
    [requestId, labourKobo, itemsTotalKobo, notes],
  );
  await client.query(
    `UPDATE service_requests SET status = 'quoted', updated_at = now()
     WHERE id = $1 AND status = 'open'`,
    [requestId],
  );
}

async function seed() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 12);
    const adminId = await seedUser(client, {
      email: adminEmail,
      fullName: 'Admin User',
      phone: adminPhone,
      role: 'admin',
      passwordHash,
    });

    const ownerDefs = [
      { email: 'repairer1@example.com', fullName: 'Chike Okafor', phone: '+2348000000002' },
      { email: 'repairer2@example.com', fullName: 'Ngozi Eze', phone: '+2348000000003' },
      { email: 'repairer3@example.com', fullName: 'Tunde Bello', phone: '+2348000000004' },
    ];
    const owners = new Map();
    for (const owner of ownerDefs) {
      owners.set(owner.email, await seedUser(client, { ...owner, role: 'shop', passwordHash }));
    }

    const customerDefs = [
      { email: 'customer1@example.com', fullName: 'Ada Nwosu', phone: '+2348000000005' },
      { email: 'customer2@example.com', fullName: 'Emeka Obi', phone: '+2348000000006' },
    ];
    const customers = new Map();
    for (const customer of customerDefs) {
      customers.set(customer.email, await seedUser(client, { ...customer, role: 'owner', passwordHash }));
    }

    const { rows: serviceTypes } = await client.query('SELECT id, code FROM service_types');
    const typesByCode = new Map(serviceTypes.map(({ id, code }) => [code, id]));
    if (!typesByCode.size) {
      throw new Error('No service types found. Run `npm run migrate` before `npm run seed`.');
    }

    const shopDefs = [
      {
        ownerEmail: 'repairer1@example.com',
        businessName: 'Okafor Auto Works',
        description: 'General vehicle repairs and mobile mechanic service.',
        state: 'Enugu',
        cityArea: 'Enugu',
        address: '12 Ogui Road',
        status: 'verified',
        services: ['general_repair', 'mobile_mechanic'],
      },
      {
        ownerEmail: 'repairer2@example.com',
        businessName: 'Eze Brake & Tyre',
        description: 'Tyre specialists and general vehicle repairs.',
        state: 'Lagos',
        cityArea: 'Ikeja',
        address: '45 Zik Avenue',
        status: 'verified',
        services: ['tire_specialist', 'general_repair'],
      },
      {
        ownerEmail: 'repairer3@example.com',
        businessName: 'Bello Electricals',
        description: 'Electrical diagnostics and EV technician services.',
        state: 'FCT',
        cityArea: 'Abuja',
        address: '7 Abakpa Road',
        status: 'pending',
        services: ['ev_technician', 'general_repair'],
      },
    ];
    const shops = new Map();
    for (const shop of shopDefs) {
      const id = await seedShop(client, {
        ...shop,
        userId: owners.get(shop.ownerEmail),
        adminId,
      });
      shops.set(shop.businessName, id);
      await setShopServices(client, id, shop.services, typesByCode);
    }

    const vehicle1 = await seedVehicle(client, {
      ownerId: customers.get('customer1@example.com'),
      make: 'Toyota',
      model: 'Camry',
      year: 2012,
      plateNumber: 'ENU-123-AA',
    });
    const vehicle2 = await seedVehicle(client, {
      ownerId: customers.get('customer2@example.com'),
      make: 'Honda',
      model: 'Accord',
      year: 2009,
      plateNumber: 'ENU-456-BB',
    });

    const request1 = await seedRequest(client, {
      ownerId: customers.get('customer1@example.com'),
      vehicleId: vehicle1,
      shopId: shops.get('Eze Brake & Tyre'),
      symptoms: 'Squeaking noise when braking',
      serviceAddress: null,
    });
    const request2 = await seedRequest(client, {
      ownerId: customers.get('customer2@example.com'),
      vehicleId: vehicle2,
      shopId: shops.get('Okafor Auto Works'),
      symptoms: 'Engine check light is on',
      serviceAddress: null,
    });

    await seedQuote(client, {
      requestId: request1,
      labourKobo: 3_000_000,
      itemsTotalKobo: 1_500_000,
      notes: 'Replace front pads and resurface discs.',
    });
    await seedQuote(client, {
      requestId: request2,
      labourKobo: 4_000_000,
      itemsTotalKobo: 2_000_000,
      notes: 'Diagnostic scan and sensor replacement.',
    });

    await client.query('COMMIT');
    console.log('Seed complete. Shops, users, vehicles, service requests, and quotes are ready.');
    console.log(`Admin: ${adminEmail}`);
    console.log('Demo accounts: repairer1@example.com, repairer2@example.com, repairer3@example.com, customer1@example.com, customer2@example.com');
    console.log('All seeded accounts use the password configured by SEED_PASSWORD or ADMIN_PASSWORD.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

seed();
