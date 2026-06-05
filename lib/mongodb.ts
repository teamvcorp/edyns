import 'server-only'

import { MongoClient, type Db } from 'mongodb'

/**
 * Shared MongoDB connection.
 *
 * The client is created lazily on first `getDb()` call (not at import time) so
 * that `next build` and statically-rendered routes never open a connection.
 *
 * In development we cache the connection promise on `globalThis` so hot-reloads
 * don't open a new connection on every change.
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

  if (process.env.NODE_ENV === 'development') {
    global._mongoClientPromise ??= new MongoClient(uri).connect()
    return global._mongoClientPromise
  }

  return new MongoClient(uri).connect()
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise()
  return client.db(dbName)
}
