/**
 * DTR MAIN ENTRY POINT
 * Initializes the application and global event listeners
 */

window.addEventListener("DOMContentLoaded", () => {
    // 1. Initial Data Sync
    dailyRecords = JSON.parse(localStorage.getItem("dtr")) || [];

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