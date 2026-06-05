// Seeds demo partner + tenant accounts so the login flows can be exercised.
// Usage: npm run seed   (reads MONGODB_URI / MONGODB_DATABASE from .env)
import 'dotenv/config'
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DATABASE ?? 'edyns'

if (!uri) {
  console.error('Missing MONGODB_URI in .env')
  process.exit(1)
}

const demoUsers = [
  { email: 'partner@edynsgate.test', name: 'Demo Partner', password: 'partner123', role: 'partner' },
  { email: 'tenant@edynsgate.test', name: 'Demo Tenant', password: 'tenant123', role: 'tenant' },
]

const client = new MongoClient(uri)

try {
  await client.connect()
  const users = client.db(dbName).collection('users')
  await users.createIndex({ email: 1, role: 1 }, { unique: true })

  for (const u of demoUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    await users.updateOne(
      { email: u.email, role: u.role },
      { $set: { email: u.email, name: u.name, passwordHash, role: u.role }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    )
    console.log(`Seeded ${u.role}: ${u.email} / ${u.password}`)
  }
  console.log('\nDone.')
} catch (err) {
  console.error('Seed failed:', err)
  process.exitCode = 1
} finally {
  await client.close()
}
