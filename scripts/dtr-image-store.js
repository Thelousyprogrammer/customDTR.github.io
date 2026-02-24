/**
 * DTR IMAGE STORE (IndexedDB)
 * Stores image data in IndexedDB to avoid localStorage quota limits.
 * Records hold imageIds; this module stores/retrieves by id.
 */

const DTR_IMAGE_DB_NAME = "DTRImageStore";
const DTR_IMAGE_STORE_NAME = "images";
const DTR_RECORDS_STORE_NAME = "records";
const DTR_RECORDS_KEY = "primary";
const DB_VERSION = 2;

let _db = null;

function buildStoreError(stage, err) {
    if (!err) return new Error(`${stage} failed with unknown error`);
    const name = err.name ? String(err.name) : "Error";
    const message = err.message ? String(err.message) : String(err);
    return new Error(`${stage} failed (${name}): ${message}`);
}

function openImageDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DTR_IMAGE_DB_NAME, DB_VERSION);
        req.onerror = () => reject(buildStoreError("openImageDB", req.error));
        req.onblocked = () => reject(new Error("openImageDB failed: database open is blocked by another tab/session"));
        req.onsuccess = () => {
            _db = req.result;
            _db.onversionchange = () => {
                _db.close();
                _db = null;
            };
            resolve(_db);
        };
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(DTR_IMAGE_STORE_NAME)) {
                db.createObjectStore(DTR_IMAGE_STORE_NAME, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(DTR_RECORDS_STORE_NAME)) {
                db.createObjectStore(DTR_RECORDS_STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

function generateImageId() {
    return "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

/**
 * Save a data URL to IndexedDB. Returns the image id to store in the record.
 */
function saveImageToStore(dataUrl) {
    // ✅ Final validation gate
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        return Promise.reject(new Error("Invalid image data URL"));
    }

    const id = generateImageId();

    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            tx.onabort = () => reject(buildStoreError("saveImageToStore transaction abort", tx.error));
            tx.onerror = () => reject(buildStoreError("saveImageToStore transaction", tx.error));

            const req = store.put({ id, dataUrl });

            req.onsuccess = () => resolve(id);
            req.onerror = () => reject(buildStoreError("saveImageToStore request", req.error));
        });
    });
}

/**
 * Get a data URL by id. Returns null if not found.
 */
function getImageFromStore(id) {
    if (!id) return Promise.resolve(null);
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
            req.onerror = () => reject(buildStoreError("getImageFromStore request", req.error));
        });
    });
}

/**
 * Delete one image by id.
 */
function deleteImageFromStore(id) {
    if (!id) return Promise.resolve();
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(buildStoreError("deleteImageFromStore request", req.error));
        });
    });
}

/**
 * Delete multiple images by id.
 */
function deleteImagesFromStore(ids) {
    if (!ids || !ids.length) return Promise.resolve();
    return openImageDB().then((db) => {
        const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
        const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
        ids.forEach((id) => store.delete(id));
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(buildStoreError("deleteImagesFromStore transaction", tx.error));
        });
    });
}

/**
 * Get total bytes used by the images store (sum of all dataUrl string lengths).
 */
function getImageStoreUsageBytes() {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                const bytes = items.reduce((sum, item) => sum + (item && item.dataUrl ? item.dataUrl.length : 0), 0);
                resolve(bytes);
            };
            req.onerror = () => reject(buildStoreError("getImageStoreUsageBytes request", req.error));
        });
    });
}

/**
 * Get storage estimate for origin (quota/usage) if available.
 */
function getImageStoreEstimate() {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.estimate === "function") {
        return navigator.storage.estimate();
    }
    return Promise.resolve({ usage: 0, quota: 0 });
}

function saveRecordsToStore(records) {
    const payload = Array.isArray(records) ? records : [];
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            tx.onabort = () => reject(buildStoreError("saveRecordsToStore transaction abort", tx.error));
            tx.onerror = () => reject(buildStoreError("saveRecordsToStore transaction", tx.error));

            const req = store.put({ id: DTR_RECORDS_KEY, records: payload });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("saveRecordsToStore request", req.error));
        });
    });
}

function getRecordsFromStore() {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            const req = store.get(DTR_RECORDS_KEY);
            req.onsuccess = () => {
                if (!req.result || !Array.isArray(req.result.records)) {
                    resolve(null);
                    return;
                }
                resolve(req.result.records);
            };
            req.onerror = () => reject(buildStoreError("getRecordsFromStore request", req.error));
        });
    });
}

function clearRecordsFromStore() {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            const req = store.delete(DTR_RECORDS_KEY);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("clearRecordsFromStore request", req.error));
        });
    });
}

/**
 * Returns image data URLs for a record. Supports legacy .images (base64) and new .imageIds (IndexedDB).
 */
function getRecordImageUrls(record) {
    if (!record) return Promise.resolve([]);
    if (record.imageIds && record.imageIds.length) {
        return Promise.all(record.imageIds.map((id) => getImageFromStore(id))).then((urls) =>
            urls.filter((u) => u != null)
        );
    }
    if (record.images && record.images.length) {
        return Promise.resolve(record.images.filter((s) => s && typeof s === "string"));
    }
    return Promise.resolve([]);
}
