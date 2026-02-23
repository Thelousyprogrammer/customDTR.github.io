/**
 * DTR STORAGE MODULE
 * Handles all CRUD operations and data validation
 */

function deleteLastRecord() {
    if (!dailyRecords.length) return alert("No records to delete.");
    if (!confirm("Delete the most recent DTR entry?")) return;

    dailyRecords.pop();
    localStorage.setItem("dtr", JSON.stringify(dailyRecords));

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
        let loaded = 0;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = e => {
                images.push(e.target.result);
                loaded++;
                if (loaded === files.length) {
                    saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
                }
            };
            reader.readAsDataURL(file);
        });
    } else {
        saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
    }
}

function saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data) {
    const record = new DailyRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
    dailyRecords = dailyRecords.filter(r => r.date !== date);
    dailyRecords.push(record);
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem("dtr", JSON.stringify(dailyRecords));

    loadReflectionViewer();
    showSummary(record);
    updateWeeklyCounter(record.date);
    renderDailyGraph();
    renderWeeklyGraph();
    updateExportWeekOptions();

    clearDTRForm();
    alert("Daily DTR saved and form cleared!");
}
