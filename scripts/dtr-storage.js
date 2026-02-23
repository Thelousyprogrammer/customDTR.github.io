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

    dailyRecords.pop();
    if (!safeSetDTR(dailyRecords)) return;

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

    dailyRecords = [];
    localStorage.removeItem("dtr");

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

    const l2Data = {
        personalHours: document.getElementById("personalHours").value,
        sleepHours: document.getElementById("sleepHours").value,
        recoveryHours: document.getElementById("recoveryHours").value,
        commuteTotal: document.getElementById("commuteTotal").value,
        commuteProductive: document.getElementById("commuteProductive").value,
        identityScore: document.getElementById("identityScore").value
    };

    const recordCheck = new DailyRecord(date, hours, reflection, [], [], [], l2Data);
    if (!checkDataHealth(recordCheck)) return;

    if (files.length > 0) {
        Promise.all(files.map(compressImage))
            .then(compressed => saveRecord(date, hours, reflection, accomplishments, tools, compressed, l2Data))
            .catch(err => alert("Image processing failed: " + err.message));
    } else {
        saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
    }
}

/**
 * Compresses an image File to max 600px at 55% quality to reduce storage usage.
 */
function compressImage(file, maxPx = 600, quality = 0.55) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxPx || height > maxPx) {
                    const ratio = Math.min(maxPx / width, maxPx / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                
                // Set white background for JPEGs (avoids black transparency)
                ctx.fillStyle = "#FFF";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Use WebP if possible, fallback to JPEG
                const mimeType = "image/jpeg"; // Stick to JPEG for widest compatibility
                const dataUrl = canvas.toDataURL(mimeType, quality);
                
                // Cleanup
                canvas.width = canvas.height = 0; 
                resolve(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data) {
    const record = new DailyRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
    const previous = [...dailyRecords];
    dailyRecords = dailyRecords.filter(r => r.date !== date);
    dailyRecords.push(record);
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!safeSetDTR(dailyRecords)) {
        dailyRecords = previous;
        if (images.length > 0 && confirm("Save without images to free space?")) {
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

    clearDTRForm();
    alert("Daily DTR saved and form cleared!");
}

function getStorageUsage() {
    const total = JSON.stringify(dailyRecords).length;
    const sizeInMB = (total / 1024 / 1024).toFixed(2);
    console.log(`Current Usage: ${sizeInMB} MB / 5.00 MB`);
    return sizeInMB;
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
            if (record.images && record.images.length) {
                const compressedImages = await Promise.all(record.images.map(async (base64) => {
                    // Only compress if the data URL is large (> 150KB)
                    if (base64.length > 150000) { 
                        try {
                            const response = await fetch(base64);
                            const blob = await response.blob();
                            imagesProcessed++;
                            return await compressImage(blob);
                        } catch (e) {
                            console.warn("Failed to compress an image, keeping original.", e);
                            return base64;
                        }
                    }
                    return base64;
                }));
                return { ...record, images: compressedImages };
            }
            return record;
        }));

        if (!safeSetDTR(optimizedRecords)) {
            alert("Optimization ran but storage is still full. Try deleting some records or removing images.");
            return;
        }
        dailyRecords = optimizedRecords;

        alert(`Optimization complete!\n- Records processed: ${originalCount}\n- Images found and lightened: ${imagesProcessed}\n- Your storage is now much cleaner.`);
        
        loadReflectionViewer();
        if (dailyRecords.length) showSummary(dailyRecords[dailyRecords.length - 1]);
    } catch (err) {
        alert("Optimization failed: " + err.message);
    } finally {
        if (btn && btn.tagName === "BUTTON") btn.innerText = originalText;
    }
}
