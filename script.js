// === CONFIG ===
const MASTER_TARGET_HOURS = 500;   // Total OJT goal
const DAILY_TARGET_HOURS = 8;      // Reference time per day
const GREAT_DELTA_THRESHOLD = 2;  // 2 hours or more is "great"
const OJT_START = new Date(2026, 0, 26); // Month is 0-based → 0 = January
const COLORS = {
  neutral: "var(--color-neutral)",
  warning: "var(--color-warning)",
  good: "var(--color-good)",
  excellent: "var(--color-excellent)"
};
let dailyRecords = []; // Loaded from localStorage

// === DAILY RECORD MODEL ===
class DailyRecord {
  constructor(date, hours, reflection, accomplishments, tools, images = [], l2Data = {}) {
    this.date = date;
    this.hours = hours;
    this.delta = hours - DAILY_TARGET_HOURS;
    this.reflection = reflection;
    this.accomplishments = accomplishments;
    this.tools = tools;
    this.images = images;
    
    // Level 2 Metrics
    this.personalHours = parseFloat(l2Data.personalHours) || 0;
    this.sleepHours = parseFloat(l2Data.sleepHours) || 0;
    this.recoveryHours = parseFloat(l2Data.recoveryHours) || 0;
    this.commuteTotal = parseFloat(l2Data.commuteTotal) || 0;
    this.commuteProductive = parseFloat(l2Data.commuteProductive) || 0;
    this.identityScore = parseInt(l2Data.identityScore) || 0;
  }
}

// === STORAGE AND EDIT INDEX===
let editingIndex = null;
let currentSortMode = "date-asc";

// === HELPER FUNCTIONS ===
function getWeekNumber(date, reference = OJT_START) {
  // Normalize both dates to local midnight
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  const diff = d.getTime() - ref.getTime();

  if (diff < 0) return 1;  // before OJT start
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function getTotalHours() {
  return dailyRecords.reduce((sum, r) => sum + r.hours, 0);
}

function getOverallDelta() {
  return getTotalHours() - MASTER_TARGET_HOURS;
}

function getWeekHours(weekNumber) {
  return dailyRecords
    .filter(r => getWeekNumber(new Date(r.date)) === weekNumber)
    .reduce((sum, r) => sum + r.hours, 0);
}

/** Get start and end dates for a week number (relative to OJT_START). */
function getWeekDateRange(weekNumber) {
  const ref = new Date(OJT_START.getFullYear(), OJT_START.getMonth(), OJT_START.getDate());
  const start = new Date(ref);
  start.setDate(ref.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = d => `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
  return { start: fmt(start), end: fmt(end), startDate: start, endDate: end };
}

function getTodayFileName(prefix, ext) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}-${mm}-${dd}.${ext}`;
}

// === THEME SYSTEM ===
function setTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("theme", name);
}
setTheme(localStorage.getItem("theme") || "f1");

// === DELETE LAST RECORD ===
function deleteLastRecord() {
  if (!dailyRecords.length) return alert("No records to delete.");
  if (!confirm("Delete the most recent DTR entry?")) return;

  dailyRecords.pop();
  localStorage.setItem("dtr", JSON.stringify(dailyRecords));

  loadReflectionViewer();
  if (dailyRecords.length) {
    showSummary(dailyRecords[dailyRecords.length - 1]);
    updateWeeklyCounter(dailyRecords[dailyRecords.length - 1].date);
  } else {
    showSummary({});
    updateWeeklyCounter();
  }
  alert("Last DTR entry deleted.");
}

// === CLEAR ALL RECORDS ===
function clearAllRecords() {
  if (!confirm("This will delete ALL DTR records. Continue?")) return;

  dailyRecords = [];
  localStorage.removeItem("dtr");

  loadReflectionViewer();
  showSummary({});
  updateWeeklyCounter();
  alert("All DTR records cleared.");
}

// === SUBMIT DTR ===
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

  // Collect L2 Data
  const l2Data = {
    personalHours: document.getElementById("personalHours").value,
    sleepHours: document.getElementById("sleepHours").value,
    recoveryHours: document.getElementById("recoveryHours").value,
    commuteTotal: document.getElementById("commuteTotal").value,
    commuteProductive: document.getElementById("commuteProductive").value,
    identityScore: document.getElementById("identityScore").value
  };

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

// Separate function to save
function saveRecord(date, hours, reflection, accomplishments, tools, images, l2Data) {
  const record = new DailyRecord(date, hours, reflection, accomplishments, tools, images, l2Data);

  // Remove any existing record for this date
  dailyRecords = dailyRecords.filter(r => r.date !== date);

  // Add the new record
  dailyRecords.push(record);

  // Sort by date ascending
  dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Save to localStorage
  localStorage.setItem("dtr", JSON.stringify(dailyRecords));

  // Update UI
  loadReflectionViewer();
  showSummary(record);
  updateWeeklyCounter(record.date);
  renderDailyGraph();
  renderWeeklyGraph();
  updateExportWeekOptions();

  clearDTRForm();
  alert("Daily DTR saved and form cleared!");
}

// === CLEAR INPUT FORM ===
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

  // Reset L2 fields
  document.getElementById("personalHours").value = "";
  document.getElementById("sleepHours").value = "";
  document.getElementById("recoveryHours").value = "";
  document.getElementById("commuteTotal").value = "";
  document.getElementById("commuteProductive").value = "";
  document.getElementById("identityScore").value = "0";
}

// === UPDATE WEEKLY COUNTER ===
function updateWeeklyCounter(dateInput) {
  if (!dateInput) return;

  const weekNum = getWeekNumber(new Date(dateInput));
  const weekHours = dailyRecords
    .filter(r => getWeekNumber(new Date(r.date)) === weekNum)
    .reduce((sum, r) => sum + r.hours, 0);

  const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
  let color = COLORS.neutral; // default

  if (weekHours < maxWeeklyHours * 0.5) color = COLORS.warning;
  else if (weekHours < maxWeeklyHours) color = COLORS.good;
  else color = COLORS.neutral;

  const counterEl = document.getElementById("weeklyCounter");
  if (counterEl) {
    counterEl.innerHTML = `Week ${weekNum} Hours: <span style="color:${color}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span>`;
  }
}

// === SHOW SUMMARY ===
function showSummary(record) {
  const s = document.getElementById("summary");
  s.style.display = "block";

  // Images display in summary
  let imagesHTML = "";

  if (!record || !record.date) {
    s.innerHTML = `<h2>Session Delta Summary</h2><p>No record selected.</p>`;
    return;
  }

  const previousDelta = dailyRecords.length > 1
    ? dailyRecords[dailyRecords.length - 2].delta
    : 0;

  // Delta color
  let deltaColor = COLORS.neutral; // normal
  if (record.delta <= 0) deltaColor = COLORS.warning; // lowest
  else if (record.delta > GREAT_DELTA_THRESHOLD) deltaColor = COLORS.good; // personal highest

  // Delta trend
  let trendLabel = "No previous record", trendColor = COLORS.neutral;
  if (dailyRecords.length > 1) {
    if (record.delta > previousDelta) { trendLabel = "Improved"; trendColor = COLORS.good; }
    else if (record.delta < previousDelta) { trendLabel = "Declined"; trendColor = COLORS.warning; }
    else { trendLabel = "Same as before"; trendColor = COLORS.neutral; }
  }
if (record.images && record.images.length) {
  imagesHTML = `
    <p><strong>Images:</strong></p>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      ${record.images.map(src => `
        <img src="${src}" style="width:90px;height:90px;
        object-fit:cover;border-radius:6px;border:1px solid #444;">
      `).join("")}
    </div>
  `;
}

  // Overall progress
  const totalHours = getTotalHours();
  let overallStatus = totalHours > MASTER_TARGET_HOURS
    ? "OVER 500 HOURS LIMIT!" 
    : `${totalHours} / ${MASTER_TARGET_HOURS} hours completed`;
  let overallColor = (totalHours >= MASTER_TARGET_HOURS) ? COLORS.excellent : COLORS.good; // highest vs personal

  // Weekly hours
  const weekNum = record.date ? getWeekNumber(new Date(record.date)) : null;
  const weekHours = weekNum ? getWeekHours(weekNum) : 0;
  const maxWeeklyHours = DAILY_TARGET_HOURS * 7;

  let weekColor = COLORS.neutral; // normal
  if (weekHours < maxWeeklyHours * 0.5) weekColor = COLORS.warning; // lowest
  else if (weekHours < maxWeeklyHours) weekColor = COLORS.good; // personal highest
  else weekColor = COLORS.excellent; // highest overall

  // Identity score mapping
  const identityMap = {
    0: "Not Set",
    1: "1 - Misaligned",
    2: "2 - Improving",
    3: "3 - On Track",
    4: "4 - High Growth",
    5: "5 - Fully Aligned"
  };

  // Level 2 Telemetry HTML
  const identityText = identityMap[record.identityScore] || "Not Set";
  const commuteEff = record.commuteTotal > 0 
    ? ((record.commuteProductive / record.commuteTotal) * 100).toFixed(1) + "%" 
    : "0%";

  const telemetryHTML = `
    <div style="margin-top:20px; padding-top:15px; border-top: 1px dotted var(--border); display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em;">
      <div><strong>Personal Hours:</strong> ${record.personalHours || 0}h</div>
      <div><strong>Sleep Duration:</strong> ${record.sleepHours || 0}h</div>
      <div><strong>Recovery Time:</strong> ${record.recoveryHours || 0}h</div>
      <div><strong>Identity Alignment:</strong> ${identityText}</div>
      <div style="grid-column: span 2;"><strong>Commute Efficiency:</strong> ${record.commuteProductive || 0} / ${record.commuteTotal || 0} min (${commuteEff})</div>
    </div>
  `;

  s.innerHTML = `
    <h2>Session Delta Summary</h2>

    <p><strong>Date:</strong> ${record.date || "-"}</p>
    <p><strong>Hours Worked:</strong> ${record.hours || "-"}</p>

    <p><strong>Delta:</strong>
      <span style="color:${deltaColor}; font-weight:bold;">
        ${record.delta >= 0 ? "+" : ""}${record.delta?.toFixed(2) || "-"} hours
      </span>
    </p>

    <p><strong>Trend vs Previous:</strong>
      <span style="color:${trendColor}; font-weight:bold;">${trendLabel}</span>
    </p>

    <p><strong>Overall Progress:</strong>
      <span style="color:${overallColor}; font-weight:bold;">${overallStatus}</span>
    </p>

    <p><strong>Weekly Hours:</strong>
      <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span>
    </p>

    <p><strong>Reflection:</strong></p>
    <p>${record.reflection || "-"}</p>

    <p><strong>Accomplishments:</strong></p>
    <ul>${Array.isArray(record.accomplishments) ? record.accomplishments.map(a => `<li>${a}</li>`).join("") : (record.accomplishments ? `<li>${record.accomplishments}</li>` : "-")}</ul>

    <p><strong>Tools Used:</strong> ${Array.isArray(record.tools) ? record.tools.join(", ") : (record.tools || "-")}</p>

    ${telemetryHTML}
    ${imagesHTML}
  `;
}

// === CHANGE SORT MODE ===
function changeSortMode(mode) {
  currentSortMode = mode;
  loadReflectionViewer();
}

// === UPDATE REFLECTION VIEWER WITH WEEKLY HOURS COUNTER ===
function loadReflectionViewer() {
  const viewer = document.getElementById("reflectionViewer");
  viewer.innerHTML = "";

  if (dailyRecords.length === 0) {
    viewer.innerHTML = `<p class="empty">No reflections saved yet.</p>`;
    return;
  }

  // Current week
  const latestDate = dailyRecords[dailyRecords.length - 1].date;
  const currentWeek = getWeekNumber(new Date(latestDate));
  const maxWeeklyHours = DAILY_TARGET_HOURS * 7;

  const currentWeekHours = dailyRecords
    .filter(r => getWeekNumber(new Date(r.date)) === currentWeek)
    .reduce((sum, r) => sum + r.hours, 0);

  // Weekly hours color
  let weekColor = COLORS.neutral;
  if (currentWeekHours < maxWeeklyHours * 0.5) weekColor = COLORS.warning;
  else if (currentWeekHours < maxWeeklyHours) weekColor = COLORS.good;
  else weekColor = COLORS.neutral;

  const counterDiv = document.createElement("div");
  counterDiv.id = "weeklyCounterViewer";
  counterDiv.style.marginBottom = "10px";
  counterDiv.innerHTML = `
    <strong>Week ${currentWeek} Hours:</strong>
    <span style="color:${weekColor}; font-weight:bold;">
      ${currentWeekHours} / ${maxWeeklyHours}
    </span>
  `;
  viewer.appendChild(counterDiv);

  // Prepare items for display (including trend calculation based on chronological order)
  let displayItems = dailyRecords.map((r, index) => {
    let trendLabel = "No previous record";
    let trendColor = COLORS.neutral;

    if (index > 0) {
      const prevDelta = dailyRecords[index - 1].delta;
      if (r.delta > prevDelta) {
        trendLabel = "Improved";
        trendColor = COLORS.good;
      } else if (r.delta < prevDelta) {
        trendLabel = "Declined";
        trendColor = COLORS.warning;
      } else {
        trendLabel = "Same as before";
        trendColor = COLORS.neutral;
      }
    }

    return {
      r,
      originalIndex: index,
      trendLabel,
      trendColor
    };
  });

  // Sort display items
  if (currentSortMode === "date-desc") {
    displayItems.sort((a, b) => new Date(b.r.date) - new Date(a.r.date));
  } else if (currentSortMode === "delta-desc") {
    displayItems.sort((a, b) => b.r.delta - a.r.delta);
  } else if (currentSortMode === "delta-asc") {
    displayItems.sort((a, b) => a.r.delta - b.r.delta);
  }
  // Default is "date-asc" which is the original order

  // Render items
  displayItems.forEach((item) => {
    const r = item.r;
    const weekNum = getWeekNumber(new Date(r.date)); // relative to OJT_START
    const weekHours = getWeekHours(weekNum);        // use updated week logic

    // Week hours color
    let deltaColor = COLORS.neutral;
    if (r.delta <= 0) deltaColor = COLORS.warning;
    else if (r.delta > GREAT_DELTA_THRESHOLD) deltaColor = COLORS.good;

    const accomplishmentsHTML = Array.isArray(r.accomplishments) && r.accomplishments.length
    ? `<div style="margin-top:8px;">
         <strong>Accomplishments:</strong>
         <ul style="margin:4px 0 8px 18px; padding:0;">
           ${r.accomplishments.map(a => `<li>${a}</li>`).join("")}
         </ul>
       </div>`
    : (r.accomplishments && typeof r.accomplishments === 'string' ? `<p><strong>Accomplishments:</strong> ${r.accomplishments}</p>` : "");

    const imagesHTML = r.images && r.images.length
      ? `<div class="dtr-images" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
          ${r.images.map(src => `<img src="${src}" style="width:70px; height:70px; object-fit:cover; border-radius:5px; border:1px solid #555;">`).join("")}
         </div>`
      : "";

    const toolsHTML = Array.isArray(r.tools) && r.tools.length
      ? `<p><strong>Tools Used:</strong> ${r.tools.join(", ")}</p>`
      : (r.tools ? `<p><strong>Tools Used:</strong> ${r.tools}</p>` : "");

    const div = document.createElement("div");
    div.className = "reflection-item";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${item.originalIndex + 1}. ${r.date} (Week ${weekNum})</strong>

        <button 
          class="edit-btn" 
          data-index="${item.originalIndex}">
          ✎ Edit
        </button>
      </div>

      <p>${r.reflection}</p>

      ${accomplishmentsHTML}

      <small>
        Hours:
        <span style="color:${weekColor}; font-weight:bold;">${r.hours}</span> |
        Delta:
        <span style="color:${deltaColor}; font-weight:bold;">${r.delta.toFixed(2)}</span> |
        Trend:
        <span style="color:${item.trendColor}; font-weight:bold;">${item.trendLabel}</span> |
        Week Total:
        <span style="color:${weekColor}; font-weight:bold;">${weekHours} hrs</span>
      </small>

      ${toolsHTML}
      ${imagesHTML}
      <hr>
    `;
    viewer.appendChild(div);
  });
}

// === GITHUB CONTRIBUTION GRAPH (Daily) ===
function renderDailyGraph() {
  const container = document.getElementById("githubGraph");
  if (!container) return;
  container.innerHTML = "";

  // 1. Generate date range (from OJT_START to Today/Future)
  //    GitHub usually shows the last 365 days, but we'll show from OJT_START to now+buffer
  const today = new Date();
  const startDate = new Date(OJT_START);
  
  // Align start date to the previous Sunday so the graph starts cleanly
  // Day: 0 (Sun) to 6 (Sat)
  const dayOfWeek = startDate.getDay(); 
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const totalDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)) + 7; // +1 week buf

  // 2. Map existing records for quick lookup
  const recordMap = {};
  dailyRecords.forEach(r => {
    recordMap[r.date] = r;
  });

  // 3. Build the cells
  for (let i = 0; i < totalDays; i++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + i);

    const year = curDate.getFullYear();
    const month = String(curDate.getMonth() + 1).padStart(2, "0");
    const day = String(curDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const record = recordMap[dateStr];
    let level = 0;
    
    // Determine level (F1 Theme: Yellow, Green, Magenta)
    // Level 0: 0 hours
    // Level 1: >= 4 hours (Warning/Base)
    // Level 2: >= 6 hours (Good)
    // Level 3: >= 9 hours (Excellent)
    if (record) {
      if (record.hours >= 9) level = 3;
      else if (record.hours >= 6) level = 2;
      else if (record.hours > 0) level = 1; // Any work > 0 gets at least level 1
    }

    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.style.backgroundColor = `var(--level-${level})`;
    cell.title = `${dateStr}: ${record ? record.hours : 0} hours`;
    
    // Optional: add click event to scroll to that record
    if (record) {
      cell.onclick = () => {
         // Find logical index in displayed list if needed, or just alert detail
         alert(`Date: ${dateStr}\nHours: ${record.hours}\nReflection: ${record.reflection}`);
      };
    }

    container.appendChild(cell);
  }
}

// === WEEKLY SUMMARY GRAPH (One block per week) ===
function renderWeeklyGraph() {
  const container = document.getElementById("weeklyGraph");
  if (!container) return;
  container.innerHTML = "";

  // Simply map weeks 1 to current
  const latestDate = dailyRecords.length ? new Date(dailyRecords[dailyRecords.length - 1].date) : new Date();
  const maxWeek = getWeekNumber(latestDate);

  // Group data
  const weeklyData = {};
  dailyRecords.forEach(r => {
    const w = getWeekNumber(new Date(r.date));
    if (!weeklyData[w]) weeklyData[w] = 0;
    weeklyData[w] += r.hours;
  });

  for (let w = 1; w <= maxWeek; w++) {
    const hours = weeklyData[w] || 0;
    const target = DAILY_TARGET_HOURS * 5; // e.g. 40 hours

    let level = 0;
    // Weekly Targets scaled roughly (Assuming 5 days)
    // Level 3: 9*5 = 45+
    // Level 2: 6*5 = 30+
    // Level 1: > 0
    if (hours >= 45) level = 3;      // Excellent week
    else if (hours >= 30) level = 2; // Good week
    else if (hours > 0) level = 1;   // Active week

    const cell = document.createElement("div");
    cell.className = "day-cell"; // Reuse cell style
    cell.style.width = "20px";
    cell.style.height = "20px";
    cell.style.backgroundColor = `var(--level-${level})`;
    cell.title = `Week ${w}: ${hours} Total Hours`;

    container.appendChild(cell);
  }
}

// === EDIT RECORD MODAL HANDLING ===
document.addEventListener("click", e => {
  if (!e.target.classList.contains("edit-btn")) return;

  editingIndex = Number(e.target.dataset.index);
  const r = dailyRecords[editingIndex];

  document.getElementById("editDate").value = r.date;
  document.getElementById("editHours").value = r.hours;
  document.getElementById("editReflection").value = r.reflection;
  document.getElementById("editAccomplishments").value = Array.isArray(r.accomplishments) ? r.accomplishments.join("\n") : (r.accomplishments || "");
  document.getElementById("editTools").value = Array.isArray(r.tools) ? r.tools.join(", ") : (r.tools || "");

  // Update L2 fields
  document.getElementById("editPersonalHours").value = r.personalHours || 0;
  document.getElementById("editSleepHours").value = r.sleepHours || 0;
  document.getElementById("editRecoveryHours").value = r.recoveryHours || 0;
  document.getElementById("editIdentityScore").value = r.identityScore || 0;
  document.getElementById("editCommuteTotal").value = r.commuteTotal || 0;
  document.getElementById("editCommuteProductive").value = r.commuteProductive || 0;

  document.getElementById("editModal").style.display = "flex";
});

// === SAVE EDITED RECORD ===
function saveEditModal() {
  if (editingIndex === null) return;

  const date = document.getElementById("editDate").value;
  const hours = parseFloat(document.getElementById("editHours").value);
  const reflection = document.getElementById("editReflection").value;
  const accomplishments = document.getElementById("editAccomplishments").value
    .split("\n")
    .map(a => a.trim())
    .filter(Boolean);
  const tools = document.getElementById("editTools").value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const l2Data = {
    personalHours: document.getElementById("editPersonalHours").value,
    sleepHours: document.getElementById("editSleepHours").value,
    recoveryHours: document.getElementById("editRecoveryHours").value,
    commuteTotal: document.getElementById("editCommuteTotal").value,
    commuteProductive: document.getElementById("editCommuteProductive").value,
    identityScore: document.getElementById("editIdentityScore").value
  };

  const old = dailyRecords[editingIndex];

  // Update the record
  dailyRecords[editingIndex] = new DailyRecord(
    date,
    hours,
    reflection,
    accomplishments,
    tools,
    old.images || [],
    l2Data
  );

  // Re-sort in case date changed
  dailyRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

  localStorage.setItem("dtr", JSON.stringify(dailyRecords));

  closeEditModal();
  loadReflectionViewer();
  
  // Find the new index of the edited record to show correct summary
  const newIndex = dailyRecords.findIndex(r => r.date === date);
  showSummary(dailyRecords[newIndex]);
  
  renderDailyGraph();
  renderWeeklyGraph();
  alert("Record updated successfully!");
}

// === MODAL CONTROLS ===
function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  editingIndex = null;
}

// === DOM Loaded Initialization ===
window.addEventListener("DOMContentLoaded", () => {
  dailyRecords = JSON.parse(localStorage.getItem("dtr")) || [];

  // Render reflections normally
  loadReflectionViewer();

  // Render performance visualizers
  renderDailyGraph();
  renderWeeklyGraph();

  if (dailyRecords.length) {
    showSummary(dailyRecords[dailyRecords.length - 1]);
    updateWeeklyCounter(dailyRecords[dailyRecords.length - 1].date);
  } else {
    showSummary({});
    updateWeeklyCounter();
  }

  updateExportWeekOptions();
  updateExportWeekRangeLabel();
});

// === UPDATE EXPORT WEEK OPTIONS ===
function updateExportWeekOptions() {
  const select = document.getElementById("exportWeekSelect");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="all">All Weeks</option>';

  const weeks = [...new Set(dailyRecords.map(r => getWeekNumber(new Date(r.date))))].sort((a, b) => b - a);

  weeks.forEach(w => {
    const range = getWeekDateRange(w);
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Week ${w}`;
    opt.title = `${range.start} – ${range.end}`;
    select.appendChild(opt);
  });

  if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
    select.value = currentValue;
  }
  updateExportWeekRangeLabel();
}

/** Update the visible label for the selected export week range. */
function updateExportWeekRangeLabel() {
  const select = document.getElementById("exportWeekSelect");
  const label = document.getElementById("exportWeekRangeLabel");
  if (!select || !label) return;
  const val = select.value;
  if (val === "all") {
    label.textContent = "";
    return;
  }
  const range = getWeekDateRange(parseInt(val, 10));
  const short = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  label.textContent = `${short(range.startDate)} – ${short(range.endDate)}`;
}

// EXPORT FUNCTIONS AND IMAGE PREVIEW

// === EXPORT PDF FUNCTIONS ===
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  let y = 15;

  doc.setFontSize(16);
  doc.setTextColor(255, 30, 0); // F1 Red
  doc.text("Daily DTR Report", 105, y, { align: "center" });
  y += 10;
  doc.setTextColor(0, 0, 0);

  dailyRecords.forEach(r => {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`Date: ${r.date} | Hours Worked: ${r.hours} | Delta: ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`, 10, y); 
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);

    doc.text("Reflection:", 10, y); y += 5;
    const lines = doc.splitTextToSize(r.reflection || "-", 180);
    lines.forEach(line => { doc.text(line, 12, y); y += 5; });

    if (Array.isArray(r.accomplishments) && r.accomplishments.length) {
      doc.text("Accomplishments:", 10, y); y += 5;
      r.accomplishments.forEach(a => { 
        doc.text("• " + a, 14, y); y += 5;
      });
    }

    if (Array.isArray(r.tools) && r.tools.length) {
      doc.text("Tools Used: " + r.tools.join(", "), 10, y); y += 5;
    }

    // Telemetry Section
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const tel = `L2 Telemetry: P.Hours: ${r.personalHours || 0} | Sleep: ${r.sleepHours || 0} | Rec: ${r.recoveryHours || 0} | Align: ${r.identityScore || 0} | Commute: ${r.commuteProductive || 0}/${r.commuteTotal || 0} min`;
    doc.text(tel, 10, y); 
    y += 4;
    doc.setTextColor(0,0,0);

    y += 6;
    if (y > 260) { doc.addPage(); y = 15; }
  });

  doc.save(getTodayFileName("Daily_DTR_Report", "pdf"));
}

// === WEEKLY DTR COMPILER ===
function getWeeklyDTR(filterWeek = "all") {
  const weeks = {};

  dailyRecords.forEach(r => {
    const d = new Date(r.date);
    const week = getWeekNumber(d);

    if (filterWeek !== "all" && week != filterWeek) return;

    if (!weeks[week]) {
      weeks[week] = {
        week,
        dateRange: r.date,
        totalHours: 0,
        personalHours: 0,
        sleepHours: 0,
        recoveryHours: 0,
        accomplishments: [],
        tools: new Set()
      };
    }

    weeks[week].totalHours += r.hours;
    weeks[week].personalHours += parseFloat(r.personalHours) || 0;
    weeks[week].sleepHours += parseFloat(r.sleepHours) || 0;
    weeks[week].recoveryHours += parseFloat(r.recoveryHours) || 0;
    
    if (Array.isArray(r.accomplishments)) {
      r.accomplishments.forEach(a => weeks[week].accomplishments.push({ date: r.date, text: a }));
    }
    if (Array.isArray(r.tools)) {
      r.tools.forEach(t => weeks[week].tools.add(t));
    }
  });

  return Object.values(weeks).map(w => ({ ...w, tools: [...w.tools] }));
}

// === WEEKLY EXPORT PDF ===
function exportWeeklyPDF() {
  if (!dailyRecords.length) return alert("No records to export.");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  let y = 15;

  const filterWeek = document.getElementById("exportWeekSelect").value;

  doc.setFontSize(16);
  doc.setTextColor(255, 30, 0);
  doc.text("Weekly DTR Report", 105, y, { align: "center" });
  y += 10;
  doc.setTextColor(0, 0, 0);

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const d = new Date();
  doc.setFontSize(10);
  doc.text(`Generated: ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`, 105, y, { align: "center" });
  y += 12;

  const weeks = getWeeklyDTR(filterWeek);
  if (weeks.length === 0) return alert("No records found for the selected week.");

  weeks.forEach(w => {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Week ${w.week} Summary`, 10, y);
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);

    doc.text(`Total OJT Hours: ${w.totalHours.toFixed(1)}`, 10, y); y += 6;

    // Weekly Telemetry Totals
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Weekly Telemetry: Deep Work: ${w.personalHours.toFixed(1)}h | Sleep: ${w.sleepHours.toFixed(1)}h | Recovery: ${w.recoveryHours.toFixed(1)}h`, 10, y);
    y += 8;
    doc.setTextColor(0,0,0);

    doc.setFontSize(11);
    doc.text("Accomplishments & Contributions:", 10, y); y += 6;
    doc.setFontSize(10);

    w.accomplishments.forEach(a => {
      doc.splitTextToSize(`• [${a.date}] ${a.text}`, 180).forEach(line => { 
        doc.text(line, 14, y); 
        y += 5;
        if (y > 275) { doc.addPage(); y = 15; }
      });
    });

    if (w.tools.length) {
      y += 2;
      doc.text("Tools Utilized: " + w.tools.join(", "), 10, y); y += 6;
    }

    y += 10;
    if (y > 260) { doc.addPage(); y = 15; }
  });

  const fileName = filterWeek === "all" ? "Whole_OJT_Weekly_Report" : `Weekly_DTR_Report_Week_${filterWeek}`;
  doc.save(getTodayFileName(fileName, "pdf"));
}

// Preview selected images
document.getElementById("images").addEventListener("change", function () {
  const preview = document.getElementById("imagePreview");
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