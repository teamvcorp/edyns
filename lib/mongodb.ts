import 'server-only'

import { MongoClient, type Db } from 'mongodb'

/**
 * Shared MongoDB connection.
 *
 * The client is created lazily on first `getDb()` call (not at import time) so
 * that `next build` and statically-rendered routes never open a connection.
 *
 * The connection promise is cached on `globalThis` in EVERY environment: in
 * development so hot-reloads don't reconnect, and in production so a warm
 * serverless instance reuses one pooled client instead of opening (and leaking)
 * a new pool on every `getDb()` call. A failed connect clears the cache so the
 * next call retries instead of re-throwing a stale rejection forever.
 */

const dbName = process.env.MONGODB_DATABASE ?? 'edyns'

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Missing MONGODB_URI environment variable')
  }

  global._mongoClientPromise ??= new MongoClient(uri).connect().catch((err) => {
    global._mongoClientPromise = undefined
    throw err
  })
  return global._mongoClientPromise
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise()
  return client.db(dbName)
}
