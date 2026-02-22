/**
 * DTR UI MODULE
 * Handles form clearing, summaries, modal logic, and reflection list rendering
 */

function clearDTRForm() {
    document.getElementById("date").value = "";
    document.getElementById("hours").value = "";
    document.getElementById("reflection").value = "";
    document.getElementById("accomplishments").value = "";
    document.getElementById("tools").value = "";

    const imgInput = document.getElementById("images");
    if (imgInput) imgInput.value = "";

    const preview = document.getElementById("imagePreview");
    if (preview) preview.innerHTML = "";

    const counterEl = document.getElementById("weeklyCounter");
    if (counterEl) counterEl.innerHTML = "";

    document.getElementById("personalHours").value = "";
    document.getElementById("sleepHours").value = "";
    document.getElementById("recoveryHours").value = "";
    document.getElementById("commuteTotal").value = "";
    document.getElementById("commuteProductive").value = "";
    document.getElementById("identityScore").value = "0";
}

function updateWeeklyCounter(dateInput) {
    if (!dateInput) return;
    const weekNum = getWeekNumber(new Date(dateInput));
    const weekHours = dailyRecords
        .filter(r => getWeekNumber(new Date(r.date)) === weekNum)
        .reduce((sum, r) => sum + r.hours, 0);

    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let color = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) color = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) color = DTR_COLORS.good;

    const counterEl = document.getElementById("weeklyCounter");
    if (counterEl) {
        counterEl.innerHTML = `Week ${weekNum} Hours: <span style="color:${color}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span>`;
    }
}

function showSummary(record) {
    const s = document.getElementById("summary");
    if (!s) return;
    s.style.display = "block";

    if (!record || !record.date) {
        s.innerHTML = `<h2>Session Delta Summary</h2><p>No record selected.</p>`;
        return;
    }

    const previousDelta = dailyRecords.length > 1 ? dailyRecords[dailyRecords.length - 2].delta : 0;
    
    let deltaColor = DTR_COLORS.neutral;
    if (record.delta <= 0) deltaColor = DTR_COLORS.warning;
    else if (record.delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

    let trendLabel = "No previous record", trendColor = DTR_COLORS.neutral;
    if (dailyRecords.length > 1) {
        if (record.delta > previousDelta) { trendLabel = "Improved"; trendColor = DTR_COLORS.good; }
        else if (record.delta < previousDelta) { trendLabel = "Declined"; trendColor = DTR_COLORS.warning; }
        else { trendLabel = "Same as before"; trendColor = DTR_COLORS.neutral; }
    }

    let imagesHTML = "";
    if (record.images && record.images.length) {
        imagesHTML = `
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content: flex-end;">
              ${record.images.map(src => `<img src="${src}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border); transition: transform 0.2s;" onmouseover="this.style.transform='scale(2.5)'; this.style.zIndex='100';" onmouseout="this.style.transform='scale(1)'; this.style.zIndex='1';">`).join("")}
            </div>
        `;
    }

    const totalHours = getTotalHours();
    let overallColor = (totalHours >= MASTER_TARGET_HOURS) ? DTR_COLORS.excellent : DTR_COLORS.good;
    
    const weekNum = record.date ? getWeekNumber(new Date(record.date)) : null;
    const weekHours = weekNum ? getWeekHours(weekNum) : 0;
    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let weekColor = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
    else weekColor = DTR_COLORS.excellent;

    const identityLabels = { 0:"Not Set", 1:"1 - Misaligned", 2:"2 - Improving", 3:"3 - On Track", 4:"4 - High Growth", 5:"5 - Fully Aligned"};
    const commuteEff = record.commuteTotal > 0 ? ((record.commuteProductive / record.commuteTotal) * 100).toFixed(1) + "%" : "N/A";

    s.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 20px;">
            <div style="flex: 1;">
                <h2>Session Delta Summary</h2>
                <p><strong>Date:</strong> ${record.date}</p>
                <p><strong>Hours Worked:</strong> ${record.hours}</p>
                <p><strong>Delta:</strong> <span style="color:${deltaColor}; font-weight:bold;">${record.delta >= 0 ? "+" : ""}${record.delta.toFixed(2)} hours</span></p>
                <p><strong>Trend:</strong> <span style="color:${trendColor}; font-weight:bold;">${trendLabel}</span></p>
                <p><strong>Overall:</strong> <span style="color:${overallColor}; font-weight:bold;">${totalHours} / ${MASTER_TARGET_HOURS}h</span></p>
                <p><strong>Weekly:</strong> <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span></p>
            </div>
            <div style="max-width:300px;">
                ${imagesHTML}
            </div>
        </div>
        <p><strong>Reflection:</strong> ${record.reflection}</p>
        <p><strong>Tools:</strong> ${Array.isArray(record.tools) ? record.tools.join(", ") : record.tools}</p>
        <div style="margin-top:20px; padding-top:15px; border-top: 1px dotted var(--border); display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em;">
            <div><strong>Personal:</strong> ${record.personalHours}h</div>
            <div><strong>Sleep:</strong> ${record.sleepHours}h</div>
            <div><strong>Recovery:</strong> ${record.recoveryHours}h</div>
            <div><strong>Identity:</strong> ${identityLabels[record.identityScore] || "Not Set"}</div>
            <div style="grid-column: span 2;"><strong>Commute Eff:</strong> ${commuteEff}</div>
        </div>
        
        <div style="margin-top:15px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border-left:4px solid ${calculateForecast().isAhead ? DTR_COLORS.good : DTR_COLORS.warning};">
            <h4 style="margin:0 0 8px 0; font-size:0.9em; text-transform:uppercase; color:var(--accent);">OJT Forecast</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.85em;">
                <div>Rem. Hours: <strong>${Math.round(calculateForecast().remainingHours)}h</strong></div>
                <div>Need: <strong>${Math.ceil(calculateForecast().requiredRate)}h/day</strong></div>
                <div style="grid-column: span 2;">Projected: <strong>${calculateForecast().projectedDate.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</strong></div>
            </div>
        </div>
    `;
}

function changeSortMode(mode) {
    currentSortMode = mode;
    loadReflectionViewer();
}

function loadReflectionViewer() {
    const viewer = document.getElementById("reflectionViewer");
    if (!viewer) return;
    viewer.innerHTML = "";

    if (dailyRecords.length === 0) {
        viewer.innerHTML = `<p class="empty">No reflections saved yet.</p>`;
        return;
    }

    const latestDate = dailyRecords[dailyRecords.length - 1].date;
    const currentWeek = getWeekNumber(new Date(latestDate));
    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    const currentWeekHours = getWeekHours(currentWeek);

    let weekColor = DTR_COLORS.neutral;
    if (currentWeekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
    else if (currentWeekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;

    const counterDiv = document.createElement("div");
    counterDiv.style.marginBottom = "10px";
    counterDiv.innerHTML = `<strong>Week ${currentWeek} Hours:</strong> <span style="color:${weekColor}; font-weight:bold;">${currentWeekHours} / ${maxWeeklyHours}</span>`;
    viewer.appendChild(counterDiv);

    let displayItems = dailyRecords.map((r, index) => {
        let trendLabel = "No previous record", trendColor = DTR_COLORS.neutral;
        if (index > 0) {
            const prevDelta = dailyRecords[index - 1].delta;
            if (r.delta > prevDelta) { trendLabel = "Improved"; trendColor = DTR_COLORS.good; }
            else if (r.delta < prevDelta) { trendLabel = "Declined"; trendColor = DTR_COLORS.warning; }
            else { trendLabel = "Same as before"; trendColor = DTR_COLORS.neutral; }
        }
        return { r, originalIndex: index, trendLabel, trendColor };
    });

    if (currentSortMode === "date-desc") displayItems.sort((a,b) => new Date(b.r.date) - new Date(a.r.date));
    else if (currentSortMode === "delta-desc") displayItems.sort((a,b) => b.r.delta - a.r.delta);
    else if (currentSortMode === "delta-asc") displayItems.sort((a,b) => a.r.delta - b.r.delta);

    displayItems.forEach(item => {
        const r = item.r;
        const weekNum = getWeekNumber(new Date(r.date));
        const weekHours = getWeekHours(weekNum);
        let deltaColor = DTR_COLORS.neutral;
        if (r.delta <= 0) deltaColor = DTR_COLORS.warning;
        else if (r.delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

        let reflectionImagesHTML = "";
        if (r.images && r.images.length) {
            reflectionImagesHTML = `
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
                    ${r.images.map(src => `<img src="${src}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid var(--border); cursor:zoom-in;" onclick="this.style.width='auto'; this.style.height='300px'; this.style.position='fixed'; this.style.top='50%'; this.style.left='50%'; this.style.transform='translate(-50%, -50%)'; this.style.zIndex='9999'; this.style.boxShadow='0 0 20px rgba(0,0,0,0.8)'; this.onclick=function(){this.style.width='50px'; this.style.height='50px'; this.style.position='static'; this.style.transform='none'; this.style.zIndex='1'; this.style.boxShadow='none'; this.onclick=null;};">`).join("")}
                </div>
            `;
        }

        const div = document.createElement("div");
        div.className = "reflection-item";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${item.originalIndex + 1}. ${r.date} (Week ${weekNum})</strong>
                <button class="edit-btn" data-index="${item.originalIndex}">✎ Edit</button>
            </div>
            <p>${r.reflection}</p>
            <small>
                Hours: <span style="font-weight:bold;">${r.hours}</span> |
                Delta: <span style="color:${deltaColor}; font-weight:bold;">${r.delta.toFixed(2)}</span> |
                Trend: <span style="color:${item.trendColor}; font-weight:bold;">${item.trendLabel}</span> |
                Week: <span style="font-weight:bold;">${weekHours} hrs</span>
            </small>
            ${reflectionImagesHTML}
            <hr>
        `;
        viewer.appendChild(div);
    });
}

// --- MODAL HANDLING ---

function closeEditModal() {
    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "none";
    editingIndex = null;
}

function saveEditModal() {
    if (editingIndex === null) return;

    const date = document.getElementById("editDate").value;
    const hours = parseFloat(document.getElementById("editHours").value);
    const reflection = document.getElementById("editReflection").value;
    const accomplishments = document.getElementById("editAccomplishments").value.split("\n").map(a => a.trim()).filter(Boolean);
    const tools = document.getElementById("editTools").value.split(",").map(t => t.trim()).filter(Boolean);

    const l2Data = {
        personalHours: document.getElementById("editPersonalHours").value,
        sleepHours: document.getElementById("editSleepHours").value,
        recoveryHours: document.getElementById("editRecoveryHours").value,
        commuteTotal: document.getElementById("editCommuteTotal").value,
        commuteProductive: document.getElementById("editCommuteProductive").value,
        identityScore: document.getElementById("editIdentityScore").value
    };

    const files = Array.from(document.getElementById("editImages").files);
    
    if (files.length > 0) {
        let loaded = 0;
        const newImages = [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = e => {
                newImages.push(e.target.result);
                loaded++;
                if (loaded === files.length) {
                    finalizeSave(date, hours, reflection, accomplishments, tools, newImages, l2Data);
                }
            };
            reader.readAsDataURL(file);
        });
    } else {
        const old = dailyRecords[editingIndex];
        finalizeSave(date, hours, reflection, accomplishments, tools, old.images || [], l2Data);
    }
}

function finalizeSave(date, hours, reflection, accomplishments, tools, images, l2Data) {
    dailyRecords[editingIndex] = new DailyRecord(date, hours, reflection, accomplishments, tools, images, l2Data);
    dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem("dtr", JSON.stringify(dailyRecords));

    closeEditModal();
    loadReflectionViewer();
    const newIndex = dailyRecords.findIndex(r => r.date === date);
    showSummary(dailyRecords[newIndex]);
    renderDailyGraph();
    renderWeeklyGraph();
    alert("Record updated successfully!");
}

document.addEventListener("click", e => {
    if (!e.target.classList.contains("edit-btn")) return;
    editingIndex = Number(e.target.dataset.index);
    const r = dailyRecords[editingIndex];

    document.getElementById("editDate").value = r.date;
    document.getElementById("editHours").value = r.hours;
    document.getElementById("editReflection").value = r.reflection;
    document.getElementById("editAccomplishments").value = Array.isArray(r.accomplishments) ? r.accomplishments.join("\n") : (r.accomplishments || "");
    document.getElementById("editTools").value = Array.isArray(r.tools) ? r.tools.join(", ") : (r.tools || "");

    document.getElementById("editPersonalHours").value = r.personalHours || 0;
    document.getElementById("editSleepHours").value = r.sleepHours || 0;
    document.getElementById("editRecoveryHours").value = r.recoveryHours || 0;
    document.getElementById("editIdentityScore").value = r.identityScore || 0;
    document.getElementById("editCommuteTotal").value = r.commuteTotal || 0;
    document.getElementById("editCommuteProductive").value = r.commuteProductive || 0;

    // Reset image replacement input
    const imgInput = document.getElementById("editImages");
    if (imgInput) imgInput.value = "";
    const imgPreview = document.getElementById("editImagePreview");
    if (imgPreview) {
        imgPreview.innerHTML = "";
        if (r.images && r.images.length) {
            const p = document.createElement("p");
            p.style.width = "100%";
            p.style.fontSize = "10px";
            p.style.margin = "0 0 5px 0";
            p.innerText = "Current Images:";
            imgPreview.appendChild(p);
            r.images.forEach(src => {
                const img = document.createElement("img");
                img.src = src;
                img.style.width = "40px";
                img.style.height = "40px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "4px";
                img.style.opacity = "0.5";
                imgPreview.appendChild(img);
            });
        }
    }

    document.getElementById("editModal").style.display = "flex";
});

// Listener for edit image preview
const editImgInput = document.getElementById("editImages");
if (editImgInput) {
    editImgInput.addEventListener("change", function () {
        const preview = document.getElementById("editImagePreview");
        if (!preview) return;
        preview.innerHTML = "";
        const files = Array.from(this.files);

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement("img");
                img.src = e.target.result;
                img.style.width = "60px";
                img.style.height = "60px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "5px";
                img.style.border = "2px solid var(--accent)";
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });
}
