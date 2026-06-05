import 'server-only'

import { ObjectId, type Collection } from 'mongodb'
import bcrypt from 'bcryptjs'
import { getDb } from './mongodb'
import type { Role } from './session'

/**
 * User records for the two credential-based audiences (property partners and
 * tenants). The admin is gated by a shared password and has no user record.
 */
export interface UserDoc {
  _id: ObjectId
  email: string
  name: string
  passwordHash: string
  role: Exclude<Role, 'admin'>
  createdAt: Date
}

export type PublicUser = {
  id: string
  email: string
  name: string
  role: Exclude<Role, 'admin'>
}

async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb()
  const col = db.collection<UserDoc>('users')
  // Idempotent: ensures unique email per role on first use.
  await col.createIndex({ email: 1, role: 1 }, { unique: true })
  return col
}

function toPublicUser(doc: UserDoc): PublicUser {
  return { id: doc._id.toString(), email: doc.email, name: doc.name, role: doc.role }
}

export async function findUserByEmail(email: string, role: Exclude<Role, 'admin'>): Promise<UserDoc | null> {
  const col = await usersCollection()
  return col.findOne({ email: email.toLowerCase().trim(), role })
}

/**
 * Verify email + password for a given role. Returns the public user on success,
 * null otherwise. Performs a hash comparison even when the user is missing to
 * avoid leaking which emails exist via timing.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  role: Exclude<Role, 'admin'>,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email, role)
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await bcrypt.compare(password, hash)
  if (!ok || !user) return null
  return toPublicUser(user)
}

export async function createUser(input: {
  email: string
  name: string
  password: string
  role: Exclude<Role, 'admin'>
}): Promise<PublicUser> {
  const col = await usersCollection()
  const passwordHash = await bcrypt.hash(input.password, 10)
  const doc: UserDoc = {
    _id: new ObjectId(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    passwordHash,
    role: input.role,
    createdAt: new Date(),
  }
  await col.insertOne(doc)
  return toPublicUser(doc)
}
