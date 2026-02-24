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
            alert("Storage full! Try:\n• Run \"Optimize Storage\" to compress images\n• Remove images from older records\n• Export & clear some data");
        } else {
            alert("Failed to save: " + (e.message || e));
        }
        return false;
    }
}

function deleteLastRecord() {
    if (!dailyRecords.length) return alert("No records to delete.");
    if (!confirm("Delete the most recent DTR entry?")) return;

    const last = dailyRecords[dailyRecords.length - 1];
    const idsToDelete = (last.imageIds || []).length ? last.imageIds : [];
    dailyRecords.pop();
    if (!safeSetDTR(dailyRecords)) return;
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

function clearAllRecords() {
    if (!confirm("This will delete ALL DTR records. Continue?")) return;

    const allImageIds = (dailyRecords || []).flatMap((r) => r.imageIds || []);
    dailyRecords = [];
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

    const accomplishments = document.getElementById("accomplishments").value
        .split("\n")
        .filter(a => a.trim() !== "");

    const tools = document.getElementById("tools").value
        .split(",")
        .map(t => t.trim())
        .filter(t => t !== "");

    const files = Array.from(document.getElementById("images").files);
    const images = [];

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
        Promise.allSettled(files.map(compressImage))
            .then((results) => {
                const compressed = results
                    .filter((r) => r.status === "fulfilled" && typeof r.value === "string" && r.value.startsWith("data:image/"))
                    .map((r) => r.value);
                const rejected = results
                    .map((r, index) => ({ r, index }))
                    .filter((x) => x.r.status === "rejected")
                    .map((x) => ({
                        index: x.index,
                        fileName: files[x.index] ? files[x.index].name : "(unknown)",
                        reason: getErrorSummary(x.r.reason)
                    }));
                const invalidFulfilled = results
                    .map((r, index) => ({ r, index }))
                    .filter((x) => x.r.status === "fulfilled" && !(typeof x.r.value === "string" && x.r.value.startsWith("data:image/")))
                    .map((x) => ({
                        index: x.index,
                        fileName: files[x.index] ? files[x.index].name : "(unknown)",
                        valueType: typeof x.r.value
                    }));
                if (!compressed || !compressed.length) {
                    if (rejected.length) console.error("Compression failures:", rejected);
                    if (invalidFulfilled.length) console.error("Compression returned invalid fulfilled results:", invalidFulfilled);
                    const failedCount = rejected.length + invalidFulfilled.length;
                    if (failedCount > 0) {
                        alert("Image compression failed for " + failedCount + " image(s). Saving DTR without images.");
                    }
                    saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
                    return; // Do not continue Promise chain
                }

                if (rejected.length || invalidFulfilled.length) {
                    const failedCount = rejected.length + invalidFulfilled.length;
                    console.warn("STEP 2-WARN: Partial image compression failure.", {
                        successCount: compressed.length,
                        failedCount,
                        rejected,
                        invalidFulfilled
                    });
                    alert("Some images failed to compress (" + failedCount + "). Saving only successfully compressed images.");
                }
                
                // Save the compressed images to IndexedDB
                return Promise.allSettled(compressed.map((dataUrl) => saveImageToStore(dataUrl)))
                    .then((saveResults) => {
                        const imageIds = saveResults
                            .filter(r => r.status === "fulfilled")
                            .map(r => r.value);
                        saveRecord(date, hours, reflection, accomplishments, tools, imageIds, l2Data);
                    })
                    .catch(err => {
                        console.error("IndexedDB save error:", err);
                        if (confirm("Failed to save images to storage. Save DTR without images?")) {
                            saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
                        }
                    });
            })
            .catch(err => {
                console.error("Critical image compression error:", err);
                if (confirm("Critical image processing error. Save DTR without images?")) {
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

        // 🔐 Required for blob/object URLs
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

                // ✅ Safe drawImage
                try {
                    ctx.drawImage(img, 0, 0, width, height);
                } catch (e) {
                    console.warn("drawImage failed — returning original image", e);

                    if (typeof input === "string" && input.startsWith("data:image/")) {
                        resolve(input); // fallback to original base64
                        return;
                    }

                    reject(new Error("drawImage failed"));
                    return;
                }

                const compressed = canvas.toDataURL("image/jpeg", quality);

                // ✅ Validate output BEFORE logging
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

        // ✅ Handle input types safely
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

function saveRecord(date, hours, reflection, accomplishments, tools, imageIds, l2Data) {
    const record = new DailyRecord(date, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []);
    const previous = [...dailyRecords];
    dailyRecords = dailyRecords.filter(r => r.date !== date);
    dailyRecords.push(record);
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!safeSetDTR(dailyRecords)) {
        dailyRecords = previous;
        if (imageIds && imageIds.length > 0 && confirm("Save without images to free space?")) {
            deleteImagesFromStore(imageIds);
            saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
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
 * Call once after loading dailyRecords from localStorage.
 */
async function migrateImagesToIndexedDB() {
    if (typeof saveImageToStore !== "function") return;
    let changed = false;
    for (const record of dailyRecords) {
        if (!record.images || !record.images.length) continue;
        const imageIds = [];
        for (const dataUrl of record.images) {
            if (!dataUrl || typeof dataUrl !== "string") continue;
            try {
                const id = await saveImageToStore(dataUrl);
                imageIds.push(id);
            } catch (e) {
                console.warn("Migration: failed to store one image, skipping.", e);
            }
        }
        if (imageIds.length) {
            record.imageIds = imageIds;
            record.images = [];
            changed = true;
        }
    }
    if (changed && safeSetDTR(dailyRecords)) {
        console.log("DTR: Migrated legacy images to IndexedDB.");
    }
}

const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5 MB typical localStorage limit

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

    const { usedMB, limitMB, percent } = getStorageInfo();

    const usedText = document.getElementById("storageUsedText");
    const limitText = document.getElementById("storageLimitText");
    const bar = document.getElementById("storageBar");
    const status = document.getElementById("storageStatus");
    const idbUsedText = document.getElementById("storageIdbUsedText");
    const idbQuotaText = document.getElementById("storageIdbQuotaText");
    const idbBar = document.getElementById("storageIdbBar");

    if (usedText) usedText.textContent = `${usedMB} MB`;
    if (limitText) limitText.textContent = `${limitMB} MB`;
    if (bar) {
        bar.style.width = `${percent}%`;
        bar.setAttribute("aria-valuenow", Math.round(percent));
    }
    if (el) {
        el.setAttribute("data-percent", percent >= 95 ? "critical" : percent >= 80 ? "high" : "normal");
    }

    if (status) {
        if (percent >= 80) {
            status.textContent = "⚠️ Running low on storage. Consider optimizing or removing images.";
            status.style.color = "var(--color-warning)";
        } else if (percent >= 95) {
            status.textContent = "⚠️ Storage almost full! Run Optimize DB or remove images.";
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
            const quotaMB = quota > 0 ? (quota / 1024 / 1024).toFixed(0) : "—";
            if (idbUsedText) idbUsedText.textContent = `${idbMB} MB`;
            if (idbQuotaText) idbQuotaText.textContent = `${quotaMB} MB`;
            const idbPercent = quota > 0 ? Math.min(100, (idbBytes / quota) * 100) : 0;
            if (idbBar && quota > 0) {
                idbBar.style.width = `${idbPercent}%`;
                idbBar.setAttribute("aria-valuenow", Math.round(idbPercent));
            }
            if (idbSection) {
                idbSection.setAttribute("data-percent", idbPercent >= 95 ? "critical" : idbPercent >= 80 ? "high" : "normal");
            }
            if (idbStatus) {
                if (idbPercent >= 80) {
                    idbStatus.textContent = "⚠️ Running low on image storage. Consider optimizing or removing images.";
                    idbStatus.style.color = "var(--color-warning)";
                } else if (idbPercent >= 95) {
                    idbStatus.textContent = "⚠️ Image storage almost full! Run Optimize DB or remove images.";
                    idbStatus.style.color = "var(--accent)";
                } else {
                    idbStatus.textContent = idbPercent < 50 ? "Image storage healthy" : "Image storage usage moderate";
                    idbStatus.style.color = "var(--color-good)";
                }
            }
        }).catch(() => {
            if (idbUsedText) idbUsedText.textContent = "—";
            if (idbQuotaText) idbQuotaText.textContent = "—";
            if (idbStatus) idbStatus.textContent = "Unable to read image storage.";
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
    if (btn && btn.tagName === "BUTTON") btn.innerText = "Optimizing... ⏳";

    try {
        const optimizedRecords = await Promise.all(dailyRecords.map(async (record) => {
            if (record.imageIds && record.imageIds.length) {
                const compressedIds = [];
                for (const id of record.imageIds) {
                    try {
                        const dataUrl = await getImageFromStore(id);
                        if (!dataUrl) { compressedIds.push(id); continue; }
                        if (dataUrl.length > 150000) {
                            const compressed = await compressImage(dataUrl);
                            await new Promise((res, rej) => {
                                openImageDB().then((db) => {
                                    const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
                                    tx.objectStore(DTR_IMAGE_STORE_NAME).put({ id, dataUrl: compressed });
                                    tx.oncomplete = () => res();
                                    tx.onerror = () => rej(tx.error);
                                }).catch(rej);
                            });
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

        if (!safeSetDTR(optimizedRecords)) {
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

