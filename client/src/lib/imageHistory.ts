/**
 * IndexedDB 管理工具，用于本地持久化存储图像生成历史记录
 */

const DB_NAME = "ai-image-generator";
const DB_VERSION = 1;
const STORE_NAME = "generation_history";
const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

export interface GenerationRecord {
  id: string;
  createdAt: string;
  status: "success" | "failed";
  originalPrompt: string;
  optimizedPrompt: string;
  params: {
    size: string;
    quality: string;
    format: string;
    n: number;
  };
  images: Array<{
    url?: string;
    b64_json?: string;
  }>;
  elapsedMs?: number;
  isFavorite: boolean;
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("isFavorite", "isFavorite", { unique: false });
      }
    };
  });
}

export async function saveRecord(record: GenerationRecord): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getRecord(id: string): Promise<GenerationRecord | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function getAllRecords(): Promise<GenerationRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("createdAt");
    const request = index.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result as GenerationRecord[];
      // Sort by createdAt descending and filter expired records
      const now = Date.now();
      resolve(
        records
          .filter(
            (r) =>
              now - new Date(r.createdAt).getTime() < EXPIRY_TIME
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          )
      );
    };
  });
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function updateFavorite(
  id: string,
  isFavorite: boolean
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const record = getRequest.result as GenerationRecord;
      if (record) {
        record.isFavorite = isFavorite;
        const putRequest = store.put(record);
        putRequest.onerror = () => reject(putRequest.error);
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearExpiredRecords(): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const records = await getAllRecords();

  for (const record of records) {
    if (now - new Date(record.createdAt).getTime() > EXPIRY_TIME) {
      await deleteRecord(record.id);
    }
  }
}

export async function clearAllRecords(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
