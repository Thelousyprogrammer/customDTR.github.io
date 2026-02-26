/**
 * DTR STORAGE MODULE
 * Handles all CRUD operations and data validation
 */

function isQuotaError(e) {
    return e && (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        (e.code === 22) ||
        /quota/i.test(e.message || "")
    );
}

function safeSetDTR(data) {
    try {
        localStorage.setItem("dtr", JSON.stringify(data));
        return true;
    } catch (e) {
        if (isQuotaError(e)) {
            alert("Storage full! Try:\nâ€¢ Run \"Optimize Storage\" to compress images\nâ€¢ Remove images from older records\nâ€¢ Export & clear some data");
        } else {
            alert("Failed to save: " + (e.message || e));
        }
        return false;
    }
}

async function deleteLastRecord() {
    if (!dailyRecords.length) return alert("No records to delete.");
    if (!confirm("Delete the most recent DTR entry?")) return;

    const last = dailyRecords[dailyRecords.length - 1];
    const idsToDelete = (last.imageIds || []).length ? last.imageIds : [];
    dailyRecords.pop();
    if (!await persistDTR(dailyRecords)) return;
    if (idsToDelete.length && typeof deleteImagesFromStore === "function") {
        deleteImagesFromStore(idsToDelete).catch(() => {});
    }

    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
    loadReflectionViewer();
    if (dailyRecords.length) {
        showSummary(dailyRecords[dailyRecords.length - 1]);
        updateWeeklyCounter(dailyRecords[dailyRecords.length - 1].date);
    }
    renderDailyGraph();
    renderWeeklyGraph();
    alert("Last DTR entry deleted.");
}

async function clearAllRecords() {
    if (!confirm("This will delete ALL DTR records. Continue?")) return;

    const allImageIds = (dailyRecords || []).flatMap((r) => r.imageIds || []);
    dailyRecords = [];
    if (typeof clearRecordsFromStore === "function") {
        try { await clearRecordsFromStore(); } catch (_) {}
    }
    localStorage.removeItem("dtr");
    if (allImageIds.length && typeof deleteImagesFromStore === "function") {
        deleteImagesFromStore(allImageIds).catch(() => {});
    }

    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
    loadReflectionViewer();
    showSummary({});
    updateWeeklyCounter();
    renderDailyGraph();
    renderWeeklyGraph();
    alert("All DTR records cleared.");
}

function checkDataHealth(record) {
    const warnings = [];
    if (record.sleepHours === 0) warnings.push("Sleep Duration is 0");
    if (record.recoveryHours === 0) warnings.push("Recovery Time is 0");
    if (!record.identityScore) warnings.push("Identity Alignment not set");
    
    if (warnings.length > 0) {
        return confirm(`Warning: The following metrics are missing:\n- ${warnings.join("\n- ")}\n\nSave anyway?`);
    }
    return true;
}

async function persistDTR(data) {
    let primaryOk = true;
    if (typeof saveRecordsToStore === "function") {
        try {
            await saveRecordsToStore(data);
        } catch (e) {
            primaryOk = false;
            console.error("Primary record store write failed. Falling back to localStorage.", e);
        }
    }

    try {
        localStorage.setItem("dtr", JSON.stringify(data));
        return true;
    } catch (e) {
        if (primaryOk) {
            console.warn("Secondary localStorage backup write failed while primary IndexedDB save succeeded.", e);
            return true;
        }
        if (isQuotaError(e)) {
            alert("Storage full and primary storage is unavailable. Please free space and try again.");
        } else {
            alert("Failed to save records: " + (e.message || e));
        }
        return false;
    }
}

async function loadDTRRecords() {
    if (typeof getRecordsFromStore === "function") {
        try {
            const stored = await getRecordsFromStore();
            if (Array.isArray(stored)) return stored;
        } catch (e) {
            console.error("Primary record store read failed. Falling back to localStorage.", e);
        }
    }

    let fallback = [];
    try {
        fallback = JSON.parse(localStorage.getItem("dtr") || "[]");
    } catch (_) {
        fallback = [];
    }
    if (Array.isArray(fallback) && fallback.length && typeof saveRecordsToStore === "function") {
        try {
            await saveRecordsToStore(fallback);
        } catch (_) {}
    }
    return Array.isArray(fallback) ? fallback : [];
}

function getErrorSummary(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const name = err.name ? String(err.name) : "Error";
    const message = err.message ? String(err.message) : String(err);
    return `${name}: ${message}`;
}

function submitDTR() {
    const date = document.getElementById("date").value;
    const hours = parseFloat(document.getElementById("hours").value);
    const reflection = document.getElementById("reflection").value;

    if (!date || isNaN(hours)) {
        alert("Please enter a valid date and number of hours.");
        return;
    }
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const accomplishments = document.getElementById("accomplishments").value
        .split("\n")
        .filter(a => a.trim() !== "");

    const tools = document.getElementById("tools").value
        .split(",")
        .map(t => t.trim())
        .filter(t => t !== "");

    const files = Array.from(document.getElementById("images").files);

    // Convert l2Data values to proper types immediately
    const l2Data = {
        personalHours: parseFloat(document.getElementById("personalHours").value) || 0,
        sleepHours: parseFloat(document.getElementById("sleepHours").value) || 0,
        recoveryHours: parseFloat(document.getElementById("recoveryHours").value) || 0,
        commuteTotal: parseFloat(document.getElementById("commuteTotal").value) || 0,
        commuteProductive: parseFloat(document.getElementById("commuteProductive").value) || 0,
        identityScore: parseInt(document.getElementById("identityScore").value) || null
    };

    const recordCheck = new DailyRecord(date, hours, reflection, [], [], [], l2Data);
    if (!checkDataHealth(recordCheck)) return;

    if (files.length > 0) {
        Promise.allSettled(files.map((file) => saveImageToStore(file)))
            .then((results) => {
                const imageIds = results
                    .filter((r) => r.status === "fulfilled")
                    .map((r) => r.value);
                const rejected = results
                    .map((r, index) => ({ r, index }))
                    .filter((x) => x.r.status === "rejected")
                    .map((x) => ({
                        index: x.index,
                        fileName: files[x.index] ? files[x.index].name : "(unknown)",
                        reason: getErrorSummary(x.r.reason)
                    }));

                if (rejected.length) {
                    console.warn("Some uploaded images failed to store in IndexedDB.", rejected);
                    alert("Some images failed to store (" + rejected.length + "). Saving only successfully uploaded images.");
                }
                saveRecord(date, hours, reflection, accomplishments, tools, imageIds, l2Data);
            })
            .catch((err) => {
                console.error("IndexedDB image save error:", err);
                if (confirm("Failed to save images to IndexedDB. Save DTR without images?")) {
                    saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
                } else {
                    alert("Submission cancelled.");
                }
            });
    } else {
        saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
    }
}

/**
 * Compress image to max dimension and JPEG quality.
 * Always returns a BASE64 data URL.
 */
function compressImage(input, quality = 0.6, maxWidth = 1280) {
    return new Promise((resolve, reject) => {
        if (!input) {
            reject(new Error("No image input provided"));
            return;
        }

        const img = new Image();

        // ðŸ” Required for blob/object URLs
        img.crossOrigin = "anonymous";

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                let { width, height } = img;
                const inputType = input && input.type ? input.type : typeof input;

                // Resize if too large
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                if (!width || !height) {
                    reject(new Error(`Invalid image dimensions (${width}x${height}) for input type ${inputType}`));
                    return;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas 2D context unavailable"));
                    return;
                }

                // Fill white background (for PNG transparency)
                ctx.fillStyle = "#FFF";
                ctx.fillRect(0, 0, width, height);

                // âœ… Safe drawImage
                try {
                    ctx.drawImage(img, 0, 0, width, height);
                } catch (e) {
                    console.warn("drawImage failed â€” returning original image", e);

                    if (typeof input === "string" && input.startsWith("data:image/")) {
                        resolve(input); // fallback to original base64
                        return;
                    }

                    reject(new Error("drawImage failed"));
                    return;
                }

                const compressed = canvas.toDataURL("image/jpeg", quality);

                // âœ… Validate output BEFORE logging
                if (!compressed || !compressed.startsWith("data:image/")) {
                    reject(new Error("Compression produced invalid data URL"));
                    return;
                }

                resolve(compressed);

            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => {
            const inputType = input && input.type ? input.type : typeof input;
            reject(new Error(`Image failed to load (input type: ${inputType})`));
        };

        // âœ… Handle input types safely
        if (input instanceof Blob) {
            const objectUrl = URL.createObjectURL(input);
            const originalOnload = img.onload;
            const originalOnerror = img.onerror;
            img.onload = () => {
                try {
                    originalOnload();
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.onerror = () => {
                try {
                    originalOnerror();
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.src = objectUrl;
        } else if (typeof input === "string") {
            img.src = input;
        } else {
            reject(new Error("Unsupported image input"));
        }
    });
}

async function saveRecord(date, hours, reflection, accomplishments, tools, imageIds, l2Data) {
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const normalizedDate = dateKey || date;
    const record = new DailyRecord(normalizedDate, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []);
    const previous = [...dailyRecords];
    dailyRecords = dailyRecords.filter((r) => (toGmt8DateKey(r.date) || r.date) !== normalizedDate);
    dailyRecords.push(record);
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!await persistDTR(dailyRecords)) {
        dailyRecords = previous;
        if (imageIds && imageIds.length > 0 && confirm("Save without images to free space?")) {
            deleteImagesFromStore(imageIds);
            await saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
        }
        return;
    }

    loadReflectionViewer();
    showSummary(record);
    updateWeeklyCounter(record.date);
    renderDailyGraph();
    renderWeeklyGraph();
    updateExportWeekOptions();
    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();

    clearDTRForm();
    alert("Daily DTR saved and form cleared!");
}

/**
 * Migrates legacy base64 images from record.images into IndexedDB and sets record.imageIds.
 * Returns migration stats for UI feedback.
 */
async function migrateImagesToIndexedDB() {
    if (typeof saveImageToStore !== "function") {
        return { recordsUpdated: 0, imagesMigrated: 0, failedImages: 0, changed: false };
    }

    let changed = false;
    let recordsUpdated = 0;
    let imagesMigrated = 0;
    let failedImages = 0;

    for (const record of dailyRecords) {
        if (!record.images || !record.images.length) continue;
        const legacyCount = record.images.length;
        const imageIds = [];
        for (const dataUrl of record.images) {
            if (!dataUrl || typeof dataUrl !== "string") continue;
            try {
                const id = await saveImageToStore(dataUrl);
                imageIds.push(id);
                imagesMigrated++;
            } catch (e) {
                console.warn("Migration: failed to store one image, skipping.", e);
            }
        }
        if (imageIds.length === legacyCount) {
            record.imageIds = imageIds;
            record.images = [];
            changed = true;
            recordsUpdated++;
        } else if (imageIds.length > 0) {
            // Roll back partial writes to avoid orphaned blobs in IndexedDB.
            if (typeof deleteImagesFromStore === "function") {
                try { await deleteImagesFromStore(imageIds); } catch (_) {}
            }
            imagesMigrated -= imageIds.length;
            failedImages += legacyCount;
        } else {
            failedImages += legacyCount;
        }
    }

    if (changed && await persistDTR(dailyRecords)) {
        console.log("DTR: Migrated legacy images to IndexedDB.");
    }

    return { recordsUpdated, imagesMigrated, failedImages, changed };
}

async function transferLegacyPhotos(buttonEl) {
    if (!dailyRecords || !dailyRecords.length) {
        alert("No records found.");
        return;
    }

    const legacyRecords = dailyRecords.filter((r) => r.images && r.images.length);
    const legacyCount = legacyRecords.reduce((sum, r) => sum + r.images.length, 0);

    if (!legacyCount) {
        alert("No legacy photos found. Everything is already on IndexedDB.");
        return;
    }

    if (!confirm(`Transfer ${legacyCount} localStorage image(s) to IndexedDB now?`)) return;

    const btn = buttonEl && buttonEl.tagName === "BUTTON" ? buttonEl : null;
    const originalText = btn ? btn.innerText : "";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Transferring...";
    }

    try {
        const result = await migrateImagesToIndexedDB();
        if (result.imagesMigrated === 0) {
            alert("No photos were transferred. Please check browser storage permissions and try again.");
        } else if (result.failedImages > 0) {
            alert(
                `Transferred ${result.imagesMigrated} photo(s). ` +
                `${result.failedImages} photo(s) could not be transferred and were kept as legacy data.`
            );
        } else {
            alert(`Transfer complete: ${result.imagesMigrated} photo(s) moved to IndexedDB.`);
        }
        if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
        loadReflectionViewer();
    } catch (err) {
        alert("Legacy photo transfer failed: " + (err && err.message ? err.message : err));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5 MB typical localStorage limit

function formatBytesAdaptive(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function getStorageInfo() {
    const usedBytes = typeof dailyRecords !== "undefined"
        ? new Blob([JSON.stringify(dailyRecords)]).size
        : new Blob([localStorage.getItem("dtr") || "[]"]).size;
    const usedMB = (usedBytes / 1024 / 1024).toFixed(2);
    const limitMB = (STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(2);
    const percent = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);
    return { usedBytes, usedMB, limitMB, percent };
}

function getStorageUsage() {
    const { usedMB } = getStorageInfo();
    console.log(`Current Usage: ${usedMB} MB / 5.00 MB`);
    return usedMB;
}

function updateStorageVisualizer() {
    const el = document.getElementById("storageVisualizer");
    if (!el) return;

    const { usedBytes, usedMB, limitMB, percent } = getStorageInfo();

    const usedText = document.getElementById("storageUsedText");
    const limitText = document.getElementById("storageLimitText");
    const bar = document.getElementById("storageBar");
    const status = document.getElementById("storageStatus");
    const idbUsedText = document.getElementById("storageIdbUsedText");
    const idbQuotaText = document.getElementById("storageIdbQuotaText");
    const idbBar = document.getElementById("storageIdbBar");
    const barTip = document.getElementById("storageBarTip");
    const idbBarTip = document.getElementById("storageIdbBarTip");

    if (usedText) usedText.textContent = `${usedMB} MB`;
    if (limitText) limitText.textContent = `${limitMB} MB`;
    const recordsInfo = `${formatBytesAdaptive(usedBytes)} used of ${formatBytesAdaptive(STORAGE_LIMIT_BYTES)} (${Math.round(percent)}%)`;
    if (usedText) usedText.title = `Records usage: ${recordsInfo}`;
    if (limitText) limitText.title = `Records capacity: ${formatBytesAdaptive(STORAGE_LIMIT_BYTES)}`;
    if (bar) bar.title = `Records: ${recordsInfo}`;
    if (barTip) barTip.textContent = recordsInfo;
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.setAttribute("aria-valuenow", Math.round(percent));
    }
    if (el) {
        el.setAttribute("data-percent", percent >= 95 ? "critical" : percent >= 80 ? "high" : "normal");
    }

    if (status) {
        if (percent >= 80) {
            status.textContent = "âš ï¸ Running low on storage. Consider optimizing or removing images.";
            status.style.color = "var(--color-warning)";
        } else if (percent >= 95) {
            status.textContent = "âš ï¸ Storage almost full! Run Optimize DB or remove images.";
            status.style.color = "var(--accent)";
        } else {
            status.textContent = percent < 50 ? "Storage healthy" : "Storage usage moderate";
            status.style.color = "var(--color-good)";
        }
    }

    if (typeof getImageStoreUsageBytes === "function" && typeof getImageStoreEstimate === "function") {
        const idbSection = document.getElementById("storageIdbSection");
        const idbStatus = document.getElementById("storageIdbStatus");
        Promise.all([getImageStoreUsageBytes(), getImageStoreEstimate()]).then(([idbBytes, estimate]) => {
            const idbMB = (idbBytes / 1024 / 1024).toFixed(2);
            const quota = estimate.quota || 0;
            const quotaAdaptive = quota > 0 ? formatBytesAdaptive(quota) : "--";
            if (idbUsedText) idbUsedText.textContent = `${idbMB} MB`;
            if (idbQuotaText) idbQuotaText.textContent = quota > 0 ? quotaAdaptive : "--";
            const idbPercent = quota > 0 ? Math.min(100, (idbBytes / quota) * 100) : 0;
            if (idbBar && quota > 0) {
                idbBar.style.width = `${idbPercent}%`;
                idbBar.setAttribute("aria-valuenow", Math.round(idbPercent));
            }
            const idbInfo = quota > 0
                ? `${formatBytesAdaptive(idbBytes)} used of ${quotaAdaptive} (${Math.round(idbPercent)}%)`
                : `${formatBytesAdaptive(idbBytes)} used (quota unavailable)`;
            if (idbUsedText) idbUsedText.title = `IndexedDB usage: ${idbInfo}`;
            if (idbQuotaText) idbQuotaText.title = quota > 0
                ? `IndexedDB capacity: ${quotaAdaptive}`
                : "IndexedDB capacity unavailable";
            if (idbBar) idbBar.title = `IndexedDB: ${idbInfo}`;
            if (idbBarTip) idbBarTip.textContent = idbInfo;
            if (idbSection) {
                idbSection.setAttribute("data-percent", idbPercent >= 95 ? "critical" : idbPercent >= 80 ? "high" : "normal");
            }
            if (idbStatus) {
                if (idbPercent >= 80) {
                    idbStatus.textContent = "âš ï¸ Running low on image storage. Consider optimizing or removing images.";
                    idbStatus.style.color = "var(--color-warning)";
                } else if (idbPercent >= 95) {
                    idbStatus.textContent = "âš ï¸ Image storage almost full! Run Optimize DB or remove images.";
                    idbStatus.style.color = "var(--accent)";
                } else {
                    idbStatus.textContent = idbPercent < 50 ? "Image storage healthy" : "Image storage usage moderate";
                    idbStatus.style.color = "var(--color-good)";
                }
            }
        }).catch(() => {
            if (idbUsedText) idbUsedText.textContent = "â€”";
            if (idbQuotaText) idbQuotaText.textContent = "â€”";
            if (idbStatus) idbStatus.textContent = "Unable to read image storage.";
            if (idbBarTip) idbBarTip.textContent = "IndexedDB usage unavailable";
        });
    }
}

async function optimizeStorage() {
    if (!dailyRecords.length) return alert("No records found to optimize.");
    
    const originalCount = dailyRecords.length;
    let imagesProcessed = 0;
    
    if (!confirm("This will retroactively compress all images in your history to free up space. This is safe and won't delete your reflections. Proceed?")) return;

    const btn = document.activeElement;
    const originalText = btn ? btn.innerText : "";
    if (btn && btn.tagName === "BUTTON") btn.innerText = "Optimizing... â³";

    try {
        const optimizedRecords = await Promise.all(dailyRecords.map(async (record) => {
            if (record.imageIds && record.imageIds.length) {
                const compressedIds = [];
                for (const id of record.imageIds) {
                    try {
                        const entry = typeof getImageEntryFromStore === "function"
                            ? await getImageEntryFromStore(id)
                            : null;
                        const dataUrl = await getImageFromStore(id);
                        if (!dataUrl) { compressedIds.push(id); continue; }
                        if (dataUrl.length > 150000) {
                            if (entry && typeof backupOriginalImageIfMissing === "function") {
                                await backupOriginalImageIfMissing(id, entry);
                            }
                            const compressed = await compressImage(dataUrl);
                            if (typeof putImageEntryToStore === "function") {
                                await putImageEntryToStore({
                                    id,
                                    dataUrl: compressed,
                                    sizeBytes: compressed.length,
                                    optimizedAt: Date.now(),
                                    isCompressed: true
                                });
                            }
                            imagesProcessed++;
                        }
                        compressedIds.push(id);
                    } catch (e) {
                        console.warn("Failed to compress image " + id + ", keeping original.", e);
                        compressedIds.push(id);
                    }
                }
                return { ...record, imageIds: compressedIds, images: [] };
            }
            if (record.images && record.images.length) {
                const imageIds = [];
                for (const base64 of record.images) {
                    try {
                        const compressed = base64.length > 150000 ? await compressImage(base64) : base64;
                        if (base64.length > 150000) imagesProcessed++;
                        const id = await saveImageToStore(compressed);
                        imageIds.push(id);
                    } catch (e) {
                        console.warn("Failed to migrate/compress an image, skipping.", e);
                    }
                }
                return { ...record, imageIds, images: [] };
            }
            return record;
        }));

        if (!await persistDTR(optimizedRecords)) {
            alert("Optimization ran but storage is still full. Try deleting some records or removing images.");
            return;
        }
        dailyRecords = optimizedRecords;
        if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();

        alert(`Optimization complete!\n- Records processed: ${originalCount}\n- Images found and lightened: ${imagesProcessed}\n- Your storage is now much cleaner.`);
        
        loadReflectionViewer();
        if (dailyRecords.length) showSummary(dailyRecords[dailyRecords.length - 1]);
    } catch (err) {
        alert("Optimization failed: " + err.message);
    } finally {
        if (btn && btn.tagName === "BUTTON") btn.innerText = originalText;
    }
}

async function restoreOptimizedImages(buttonEl) {
    if (!dailyRecords.length) return alert("No records found.");

    const imageIds = [...new Set((dailyRecords || []).flatMap((r) => r.imageIds || []))];
    if (!imageIds.length) {
        alert("No IndexedDB images found to restore.");
        return;
    }

    if (!confirm("Restore original versions for all optimized images from backup and keep them in IndexedDB?")) return;

    const btn = buttonEl && buttonEl.tagName === "BUTTON" ? buttonEl : null;
    const originalText = btn ? btn.innerText : "";
    if (btn) btn.innerText = "Restoring... ⏳";

    let restoredCount = 0;
    try {
        for (const id of imageIds) {
            try {
                const restored = typeof restoreOriginalImageForId === "function"
                    ? await restoreOriginalImageForId(id)
                    : false;
                if (restored) restoredCount++;
            } catch (e) {
                console.warn("Failed to restore original image for id:", id, e);
            }
        }

        if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
        loadReflectionViewer();
        if (dailyRecords.length) showSummary(dailyRecords[dailyRecords.length - 1]);

        if (restoredCount > 0) {
            alert(`Restore complete. ${restoredCount} image(s) restored to original quality from IndexedDB backup.`);
        } else {
            alert("No original backups were found to restore.");
        }
    } catch (err) {
        alert("Restore failed: " + (err && err.message ? err.message : err));
    } finally {
        if (btn) btn.innerText = originalText;
    }
}


