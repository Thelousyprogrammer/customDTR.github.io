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
            alert("Storage full! Try:\n- Run \"Optimize Storage\" to compress images\n- Remove images from older records\n- Export & clear some data");
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

        // Required for blob/object URLs
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

                // Safe drawImage
                try {
                    ctx.drawImage(img, 0, 0, width, height);
                } catch (e) {
                    console.warn("drawImage failed - returning original image", e);

                    if (typeof input === "string" && input.startsWith("data:image/")) {
                        resolve(input); // fallback to original base64
                        return;
                    }

                    reject(new Error("drawImage failed"));
                    return;
                }

                const compressed = canvas.toDataURL("image/jpeg", quality);

                // Validate output BEFORE logging
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

        // Handle input types safely
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
