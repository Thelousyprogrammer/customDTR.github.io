/**
 * DTR MAIN ENTRY POINT
 * Initializes the application and global event listeners
 */

window.addEventListener("DOMContentLoaded", async () => {
    // 1. Initial Data Sync
    if (typeof loadDTRRecords === "function") {
        dailyRecords = await loadDTRRecords();
    } else {
        dailyRecords = JSON.parse(localStorage.getItem("dtr")) || [];
    }

    // 2. Initial Theme Sync
    const savedTheme = localStorage.getItem('user-theme') || 'f1';
    setTheme(savedTheme);

    // 3. UI Initialization
    loadReflectionViewer();
    renderDailyGraph();
    renderWeeklyGraph();

    if (dailyRecords.length) {
        showSummary(dailyRecords[dailyRecords.length - 1]);
        updateWeeklyCounter(dailyRecords[dailyRecords.length - 1].date);
    } else {
        showSummary({});
        updateWeeklyCounter();
    }

    // 4. Export UI Setup
    updateExportWeekOptions();
    if (typeof updateExportWeekRangeLabel === 'function') {
        updateExportWeekRangeLabel();
    }

    // 5. Storage Visualizer
    if (typeof updateStorageVisualizer === 'function') {
        updateStorageVisualizer();
    }

    // 6. Live Sync: Real-time Graph Updates
    const syncGraphsRealTime = (dateId, hoursId) => {
        const dateVal = document.getElementById(dateId).value;
        const hoursVal = parseFloat(document.getElementById(hoursId).value);
        
        if (!dateVal || isNaN(hoursVal)) {
            renderDailyGraph();
            renderWeeklyGraph();
            return;
        }

        // Create a temporary record set for simulation
        const tempRecord = { date: dateVal, hours: hoursVal };
        const mergedRecords = dailyRecords.filter(r => r.date !== dateVal);
        mergedRecords.push(tempRecord);
        mergedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

        renderDailyGraph(mergedRecords);
        renderWeeklyGraph(mergedRecords);
    };

    // Listeners for Main Form
    ['date', 'hours'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => syncGraphsRealTime('date', 'hours'));
    });

    // Listeners for Edit Modal
    ['editDate', 'editHours'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => syncGraphsRealTime('editDate', 'editHours'));
    });
});

// --- GLOBAL LISTENERS ---

// Image Preview Listener
const imagesInput = document.getElementById("images");
if (imagesInput) {
    imagesInput.addEventListener("change", function () {
        const preview = document.getElementById("imagePreview");
        if (!preview) return;
        preview.innerHTML = "";
        const files = Array.from(this.files);

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement("img");
                img.src = e.target.result;
                img.style.width = "80px";
                img.style.height = "80px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "5px";
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });
}
