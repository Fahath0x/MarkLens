/**
 * Tiny promise wrapper around IndexedDB.
 *
 * Documents can be large, so localStorage is not an option for content. If
 * IndexedDB is unavailable (private browsing, exotic browsers) every call
 * transparently falls back to an in-memory store so the app still works for
 * the current session instead of crashing.
 */

const DB_NAME = 'mdkm'
const DB_VERSION = 1

export const STORE_DOCS = 'docs'
export const STORE_FOLDERS = 'folders'
export const STORE_KV = 'kv'

/** Records in the kv store are `{ key, value }`; everything else uses `{ id }`. */
export interface KvRecord<T = unknown> {
  key: string
  value: T
}

const MEMORY_STORES = [STORE_DOCS, STORE_FOLDERS, STORE_KV] as const

const memory = new Map<string, Map<string, unknown>>(
  MEMORY_STORES.map((store) => [store, new Map<string, unknown>()]),
)

let dbPromise: Promise<IDBDatabase | null> | null = null
let usingMemoryFallback = false

export function isUsingMemoryFallback(): boolean {
  return usingMemoryFallback
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    const fail = () => {
      usingMemoryFallback = true
      resolve(null)
    }
    if (typeof indexedDB === 'undefined') {
      fail()
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      fail()
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV, { keyPath: 'key' })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => fail()
    request.onblocked = () => fail()
  })

  return dbPromise
}

function memoryStore(store: string): Map<string, unknown> {
  let map = memory.get(store)
  if (!map) {
    map = new Map<string, unknown>()
    memory.set(store, map)
  }
  return map
}

function keyOf(store: string, record: unknown): string {
  const keyPath = store === STORE_KV ? 'key' : 'id'
  const value = (record as Record<string, unknown> | null)?.[keyPath]
  return typeof value === 'string' ? value : String(value)
}

/** Runs `work` inside a single transaction and resolves when it commits. */
async function withStore(
  store: string,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(store, mode)
    } catch (error) {
      reject(error)
      return
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    try {
      work(transaction.objectStore(store))
    } catch (error) {
      try {
        transaction.abort()
      } catch {
        /* already aborting */
      }
      reject(error)
    }
  })
}

export async function getAllRecords<T>(store: string): Promise<T[]> {
  const db = await openDatabase()
  if (!db) return Array.from(memoryStore(store).values()) as T[]
  return new Promise<T[]>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(store, 'readonly')
    } catch (error) {
      reject(error)
      return
    }
    const request = transaction.objectStore(store).getAll()
    request.onsuccess = () => resolve((request.result ?? []) as T[])
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
}

export async function putRecords(store: string, records: unknown[]): Promise<void> {
  if (records.length === 0) return
  const db = await openDatabase()
  if (!db) {
    const map = memoryStore(store)
    for (const record of records) map.set(keyOf(store, record), record)
    return
  }
  await withStore(store, 'readwrite', (objectStore) => {
    for (const record of records) objectStore.put(record)
  })
}

export async function deleteRecords(store: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await openDatabase()
  if (!db) {
    const map = memoryStore(store)
    for (const key of keys) map.delete(key)
    return
  }
  await withStore(store, 'readwrite', (objectStore) => {
    for (const key of keys) objectStore.delete(key)
  })
}

export async function clearStores(stores: string[]): Promise<void> {
  const db = await openDatabase()
  if (!db) {
    for (const store of stores) memoryStore(store).clear()
    return
  }
  for (const store of stores) {
    await withStore(store, 'readwrite', (objectStore) => objectStore.clear())
  }
}

/** Reads the whole kv store as a plain object. */
export async function readKv<T>(): Promise<Record<string, T>> {
  const records = await getAllRecords<KvRecord<T>>(STORE_KV)
  const result: Record<string, T> = {}
  for (const record of records) result[record.key] = record.value
  return result
}

export async function writeKv(key: string, value: unknown): Promise<void> {
  await putRecords(STORE_KV, [{ key, value }])
}

export async function removeKv(keys: string[]): Promise<void> {
  await deleteRecords(STORE_KV, keys)
}
