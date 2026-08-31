import {
  PDF_DB_NAME,
  PDF_DB_VERSION,
  PDF_RECORD_TTL_MS,
  PDF_STORE_NAME
} from "./constants";
import type { PdfRecord } from "./types";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
        db.createObjectStore(PDF_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open PDF storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("PDF storage operation failed."));
  });
}

export async function putPdf(record: PdfRecord): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(PDF_STORE_NAME, "readwrite");
    transaction.objectStore(PDF_STORE_NAME).put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to store the PDF."));
      transaction.onabort = () => reject(transaction.error ?? new Error("PDF storage was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function getPdf(id: string): Promise<PdfRecord | undefined> {
  const db = await openDb();
  try {
    return await requestResult(db.transaction(PDF_STORE_NAME).objectStore(PDF_STORE_NAME).get(id));
  } finally {
    db.close();
  }
}

export async function deletePdf(id: string): Promise<void> {
  const db = await openDb();
  try {
    await requestResult(db.transaction(PDF_STORE_NAME, "readwrite").objectStore(PDF_STORE_NAME).delete(id));
  } finally {
    db.close();
  }
}

export async function deleteExpiredPdfs(now = Date.now()): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(PDF_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PDF_STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as PdfRecord;
        if (now - record.createdAt > PDF_RECORD_TTL_MS) cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  } finally {
    db.close();
  }
}
