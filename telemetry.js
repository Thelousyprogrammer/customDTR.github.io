/**
 * TELEMETRY CORE v2.5 - REFACTORED
 * Includes Safety Checks, Theme Sync, and Performance Optimization
 */

const MASTER_GOAL = 500;
const OJT_START_DATE = new Date(2026, 0, 26); // Jan 26
const TARGET_DEADLINE = new Date(2026, 3, 25); // April 25

// --- DYNAMIC THEME SYNC ---
let COLORS = {};

// Initial getter for safe defaults
function getThemeValues() {
    const style = getComputedStyle(document.documentElement);
    return {
        accent: style.getPropertyValue('--accent').trim() || '#ff1e00',
        excellent: style.getPropertyValue('--level-3').trim() || '#FF00FF',
        good: style.getPropertyValue('--level-2').trim() || '#00FF00',
        warning: style.getPropertyValue('--level-1').trim() || '#FFF000',
        text: style.getPropertyValue('--text').trim() || '#ffffff',
        grid: style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)',
        fill: style.getPropertyValue('--chart-fill').trim() || 'rgba(255,255,255,0.02)',
        fontBody: style.getPropertyValue('--font-body').trim() || 'monospace',
        fontHeading: style.getPropertyValue('--font-heading').trim() || 'sans-serif'
    };
}

let allLogs = [];
let charts = {};

document.addEventListener("DOMContentLoaded", async () => {
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.style.display = "flex";

    // Initial Theme Sync
    COLORS = getThemeValues();
    initThemeSwitcher();

    try {
        allLogs = await fetchTelemetryData();
        populateWeekSelector(allLogs);
        renderTelemetry(allLogs);
    } catch (err) {
        console.error("Telemetry Sync Failed:", err);
    } finally {
        if (loader) setTimeout(() => { loader.style.display = "none"; }, 800);
    }
});

/**
 * --- THEME MANAGEMENT SYSTEM ---
 * Allows the UI to toggle between F1, Cadillac, and APX modes
 */
function initThemeSwitcher() {
    const savedTheme = localStorage.getItem('user-theme') || 'f1';
    // Ensure the attribute matches storage if not already set by inline script
    if (document.documentElement.getAttribute('data-theme') !== savedTheme) {
        setTelemetryTheme(savedTheme);
    } else {
        // Even if attribute is set, we need to ensure COLORS are updated after paint
        setTimeout(() => {
            COLORS = getThemeValues();
            if (allLogs.length > 0) renderTelemetry(allLogs);
        }, 100);
    }
}

function setTelemetryTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('user-theme', themeName);
    
    // Crucial: We must wait for CSS variables to update before re-rendering
    setTimeout(() => {
        COLORS = getThemeValues();
        if (allLogs.length > 0) renderTelemetry(allLogs);
    }, 50);
}

// --- HELPER: PROTECTED UI UPDATES ---
const safeUpdate = (id, value, color = null) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (value !== null) el.innerText = value;
    if (color !== null) el.style.color = color;
};

function fetchTelemetryData() {
    return new Promise((resolve) => {
        const raw = localStorage.getItem("dtr");
        const logs = JSON.parse(raw) || [];
        // Sanitize data: Ensure numbers
        const cleaned = logs.map(l => ({
            ...l,
            hours: parseFloat(l.hours) || 0,
            personalHours: parseFloat(l.personalHours) || 0,
            identityScore: parseInt(l.identityScore) || 0
        }));
        setTimeout(() => resolve(cleaned), 300);
    });
}

function populateWeekSelector(logs) {
    const select = document.getElementById("weekSelect");
    if (!select) return;
    
    select.innerHTML = '<option value="all">Full OJT Period</option>';
    if (!logs || logs.length === 0) return;

    const weeks = [...new Set(logs.map(r => getWeekNumber(new Date(r.date))))].sort((a,b) => b-a);
    
    weeks.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w;
        opt.innerText = `Week ${w}`;
        select.appendChild(opt);
    });
}

function updateView() {
    const select = document.getElementById("weekSelect");
    if (!select) return;
    
    const val = select.value;
    let filtered = allLogs;
    
    if (val !== "all") {
        filtered = allLogs.filter(r => getWeekNumber(new Date(r.date)) == val);
    }
    
    renderTelemetry(filtered, val);
}

function renderTelemetry(logs, selectedWeek = "all") {
    // Prevent Chart Overlay Errors
    Object.values(charts).forEach(c => { if(c && typeof c.destroy === 'function') c.destroy(); });
    charts = {};

    if (!logs) logs = [];

    const totalActualHours = allLogs.reduce((sum, r) => sum + r.hours, 0);
    const avgPace = totalActualHours / (allLogs.length || 1);
    const remainingHours = Math.max(0, MASTER_GOAL - totalActualHours);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const msPerDay = 24 * 60 * 60 * 1000;
    
    const daysRemaining = Math.max(1, Math.ceil((TARGET_DEADLINE - today) / msPerDay));
    const requiredRate = remainingHours / daysRemaining;

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const last7DayLogs = allLogs.filter(r => r.date >= sevenDaysAgoStr);
    const last7DayTotal = last7DayLogs.reduce((sum, r) => sum + r.hours, 0);
    const last7DayAvg = last7DayTotal / 7; 

    const effectivePace = last7DayAvg || avgPace || 1; 
    const daysToFinish = remainingHours / effectivePace;
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + Math.ceil(daysToFinish));

    // --- TIME DEFICIT CALCULATION (Start to Today) ---
    // Calculate cumulative ideal hours up to TODAY (inclusive of today's 8h target)
    let idealSumLoop = 0;
    const dLoop = new Date(OJT_START_DATE);
    // Loop until dLoop is > today
    // Note: 'today' is set to midnight 00:00:00
    // dLoop starts at midnight OJT_START
    while (dLoop <= today) {
        if (dLoop.getDay() !== 0) { // Mon-Sat (1-6)
            idealSumLoop += 8;
        }
        dLoop.setDate(dLoop.getDate() + 1);
    }
    
    const deficit = idealSumLoop - totalActualHours;

    // --- UI UPDATES ---
    safeUpdate("remainingHoursText", `${remainingHours.toFixed(1)} hrs remaining`);
    
    const defEl = document.getElementById("timeDeficitText");
    if (defEl) {
        if (deficit > 0) {
            defEl.innerHTML = `Deficit: <strong>${deficit.toFixed(1)} hrs behind</strong>`;
            defEl.style.color = COLORS.accent; 
        } else if (deficit < -0.1) {
            defEl.innerHTML = `Surplus: <strong>${Math.abs(deficit).toFixed(1)} hrs ahead</strong>`;
            defEl.style.color = COLORS.good; 
        } else {
            defEl.innerHTML = `Status: <strong>Perfectly On Track</strong>`;
            defEl.style.color = COLORS.text;
        }
    }

    safeUpdate("completionDateText", `Projected: ${projectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`);
    safeUpdate("remHoursPace", `${remainingHours.toFixed(1)}h`);
    safeUpdate("remDaysPace", `${daysRemaining} days`);
    safeUpdate("reqPaceValue", `${requiredRate.toFixed(1)}h/day`);
    safeUpdate("last7DayPace", `${last7DayAvg.toFixed(1)}h/day`);

    const statusMsg = document.getElementById("paceStatusMsg");
    if (statusMsg) {
        const paceDiff = last7DayAvg - requiredRate;
        if (remainingHours <= 0) {
            statusMsg.innerText = "“Goal Reached! OJT Complete.”";
            statusMsg.style.color = COLORS.excellent;
        } else {
            statusMsg.innerText = `“Maintain ${requiredRate.toFixed(1)}h/day to finish on time.”`;
            statusMsg.style.color = paceDiff >= 0 ? COLORS.good : COLORS.accent;
        }
    }

    const filteredActual = logs.reduce((sum, r) => sum + r.hours, 0);
    const totalPlanned = logs.length * 8;
    const timeEfficiency = totalPlanned > 0 ? (filteredActual / totalPlanned) * 100 : 0;
    const totalBlocks = logs.reduce((sum, r) => sum + (r.accomplishments ? r.accomplishments.length : 0), 0);
    const energyEfficiency = filteredActual > 0 ? (totalBlocks / filteredActual) * 100 : 0;

    safeUpdate("timeEffValue", `${timeEfficiency.toFixed(1)}%`);
    safeUpdate("energyEffValue", `${energyEfficiency.toFixed(1)}%`);

    // --- FATIGUE & COGNITIVE LOGIC ---
    handleHealthIndicators();

    // --- PERFORMANCE SCORES ---
    const totalCommute = logs.reduce((sum, r) => sum + (r.commuteTotal || 0), 0);
    const prodCommute = logs.reduce((sum, r) => sum + (r.commuteProductive || 0), 0);
    const commuteEff = totalCommute > 0 ? (prodCommute / totalCommute) * 100 : 0;
    safeUpdate("commuteEff", `${commuteEff.toFixed(1)}%`);
    
    // Deep work calculation for filtered logs
    const weekLogs = logs.filter(r => (r.personalHours || 0) > 0);
    let consistencyFactor = weekLogs.length >= 4 ? 1.0 : (weekLogs.length >= 2 ? 0.7 : 0.4);
    const totalDeepHours = logs.reduce((sum, r) => sum + (r.personalHours || 0), 0);
    safeUpdate("deepWorkScore", (totalDeepHours * consistencyFactor).toFixed(1));

    const totalSleep = logs.reduce((sum, r) => sum + (r.sleepHours || 0), 0);
    safeUpdate("avgSleep", `${(logs.length > 0 ? totalSleep / logs.length : 0).toFixed(1)}h`);

    // --- MOMENTUM & STREAKS ---
    calculateMomentum(today);

    // --- CHART DEFAULTS & RENDERING ---
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = COLORS.text;
        Chart.defaults.borderColor = COLORS.grid;
        Chart.defaults.font.family = COLORS.fontBody;

        renderTrajectoryChart(allLogs);
        renderIdentityChart(allLogs);
        renderEnergyZoneChart(logs);
        renderContextualCharts(logs, selectedWeek);
        renderHourDistChart(logs);
    }
}

function handleHealthIndicators() {
    let fatigueRisk = 0;
    const sorted = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    let consecutiveHigh = 0;
    for (const r of sorted) {
        if (r.hours > 8) consecutiveHigh++;
        else consecutiveHigh = 0;
        if (consecutiveHigh >= 3) { fatigueRisk++; break; }
    }

    const fatLabel = document.getElementById("fatigueLabel");
    if (fatLabel) {
        const fatInd = document.getElementById("fatigueIndicator");
        const fatNote = document.getElementById("fatigueNote");
        if (fatigueRisk === 0) {
            if (fatInd) fatInd.innerText = "🟢";
            fatLabel.innerText = "Stable";
            fatLabel.style.color = COLORS.good;
            if (fatNote) fatNote.innerText = "Performance is sustainable";
        } else if (fatigueRisk === 1) {
            if (fatInd) fatInd.innerText = "🟡";
            fatLabel.innerText = "Accumulating Fatigue";
            fatLabel.style.color = COLORS.warning;
            if (fatNote) fatNote.innerText = "Consecutive high load detected";
        } else {
            if (fatInd) fatInd.innerText = "🔴";
            fatLabel.innerText = "Burnout Risk";
            fatLabel.style.color = COLORS.accent;
            if (fatNote) fatNote.innerText = "High load + productivity decline";
        }
    }
}

function calculateMomentum(today) {
    // 7-DAY ROLLING MOMENTUM
    // Prevents "early week dip" by comparing [Last 7 Days] vs [Previous 7 Days]
    const oneDay = 24 * 60 * 60 * 1000;
    const now = new Date(today);
    // Normalize to prevent time drift
    now.setHours(23, 59, 59, 999); 
    
    const sevenDaysAgo = new Date(now.getTime() - (7 * oneDay));
    const fourteenDaysAgo = new Date(now.getTime() - (14 * oneDay));

    const sumHours = (start, end) => {
        return allLogs.reduce((sum, r) => {
            const d = new Date(r.date);
            // Check if date is within range (inclusive start, exclusive end)
            // But simplify: just check timestamps
            return (d > start && d <= end) ? sum + r.hours : sum;
        }, 0);
    };

    const currentVelocity = sumHours(sevenDaysAgo, now);
    const previousVelocity = sumHours(fourteenDaysAgo, sevenDaysAgo);

    let momentum = 0;
    if (previousVelocity > 0) {
        momentum = ((currentVelocity - previousVelocity) / previousVelocity) * 100;
    } else if (currentVelocity > 0) {
        momentum = 100; // undefined growth
    }

    safeUpdate("momentumValue", `${momentum > 0 ? "+" : ""}${momentum.toFixed(1)}%`, momentum >= 0 ? COLORS.good : COLORS.accent);
    
    const mStatus = document.getElementById("momentumStatus");
    if (mStatus) {
        mStatus.innerText = momentum > 5 ? "ACCELERATING" : (momentum < -5 ? "SLOWING" : "STABLE");
        mStatus.style.color = momentum > 5 ? COLORS.good : (momentum < -5 ? COLORS.accent : COLORS.text);
    }

    let streak = 0;
    const sortedDesc = [...allLogs].sort((a,b) => new Date(b.date) - new Date(a.date));
    for (const r of sortedDesc) {
        if (r.hours >= 8) streak++;
        else break;
    }
    safeUpdate("streakValue", `${streak} Days`);
}

// --- CHART RENDERING (Safety-First) ---

function renderTrajectoryChart(logs) {
    const canvas = document.getElementById('trajectoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    const labels = [];
    const actualCumulative = [];
    const idealCumulative = [];
    
    let currentSum = 0;
    let idealSum = 0;
    
    const start = new Date(OJT_START_DATE);
    const end = new Date(TARGET_DEADLINE);
    
    // Create map for O(1) lookup
    const logMap = {};
    sortedLogs.forEach(l => logMap[l.date] = l.hours);

    // Build timeline
    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr);
        
        currentSum += (logMap[dateStr] || 0);
        actualCumulative.push(currentSum);
        
        // IDEAL LINE CHECK:
        // Increment 8h/day except Sundays (0)
        // This calculates a 6-day work week trajectory (Mon-Sat).
        const day = d.getDay();
        if (day !== 0) {
            idealSum += 8;
        }
        idealCumulative.push(idealSum);
    }

    charts.trajectory = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { 
                    label: 'Actual', 
                    data: actualCumulative, 
                    borderColor: COLORS.accent, 
                    backgroundColor: COLORS.fill, 
                    fill: 'origin', 
                    tension: 0.1,
                    pointRadius: 2
                },
                { 
                    label: 'Ideal (Mon-Sat 8h)', 
                    data: idealCumulative, 
                    borderColor: 'rgba(255,255,255,0.3)', 
                    borderDash: [5, 5], 
                    pointRadius: 0 
                },
                { 
                    label: '500h Goal', 
                    data: labels.map(() => 500), 
                    borderColor: COLORS.excellent, 
                    borderWidth: 1, 
                    borderDash: [2, 2], 
                    pointRadius: 0 
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: { 
                y: { grid: { color: COLORS.grid } }, 
                x: { ticks: { autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } 
            }
        }
    });
}

function renderEnergyZoneChart(logs) {
    const canvas = document.getElementById('energyZoneChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const zoneOrder = ["Recovery", "Survival", "Solid", "Overdrive", "Elite"];
    const zones = { Elite: 0, Overdrive: 0, Solid: 0, Survival: 0, Recovery: 0 };

    logs.forEach(r => {
        const total = r.hours + (r.personalHours || 0);
        if (r.hours >= 8 && (r.personalHours || 0) >= 1) zones["Elite"]++;
        else if (total > 9) zones["Overdrive"]++;
        else if (r.hours >= 8) zones["Solid"]++;
        else if (r.hours >= 6) zones["Survival"]++;
        else zones["Recovery"]++;
    });

    charts.energy = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zoneOrder,
            datasets: [{
                label: 'Sessions',
                data: zoneOrder.map(z => zones[z]),
                backgroundColor: [COLORS.text, COLORS.warning, COLORS.good, COLORS.accent, COLORS.excellent],
                borderRadius: 4
            }]
        },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, grid: { color: COLORS.grid } } }
        }
    });
}

function renderIdentityChart(logs) {
    const canvas = document.getElementById('identityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Calculate weekly average identity score
    const weeklyIdentity = {};
    logs.forEach(r => {
        if (r.identityScore > 0) {
            const w = getWeekNumber(new Date(r.date));
            if (!weeklyIdentity[w]) weeklyIdentity[w] = { sum: 0, count: 0 };
            weeklyIdentity[w].sum += r.identityScore;
            weeklyIdentity[w].count++;
        }
    });

    const labels = Object.keys(weeklyIdentity).sort((a,b) => a - b);
    charts.identity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(w => `Week ${w}`),
            datasets: [{
                label: 'Alignment Score',
                data: labels.map(w => weeklyIdentity[w].sum / weeklyIdentity[w].count),
                borderColor: COLORS.excellent,
                backgroundColor: 'rgba(255, 0, 255, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { y: { min: 0, max: 5, grid: { color: COLORS.grid } } } 
        }
    });
}

function renderContextualCharts(logs, selectedWeek) {
    const deltaCanvas = document.getElementById('deltaChart');
    if (deltaCanvas) {
        charts.delta = new Chart(deltaCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: logs.map(r => r.date),
                datasets: [{
                    label: 'Delta (8h Ref)',
                    data: logs.map(r => r.hours - 8),
                    borderColor: COLORS.accent,
                    fill: {
                        target: 'origin',
                        above: COLORS.good,   // Greenish for above
                        below: COLORS.accent    // Reddish for below
                    },
                    backgroundColor: COLORS.fill,
                    tension: 0.4,
                    pointRadius: 2
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: COLORS.grid } },
                    x: { display: false }
                }
            }
        });
    }

    const weeklyCanvas = document.getElementById('weeklyTrendChart');
    if (weeklyCanvas) {
        // Aggregate by week
        const weeklyVelocity = {};
        logs.forEach(r => {
            const w = getWeekNumber(new Date(r.date));
            weeklyVelocity[w] = (weeklyVelocity[w] || 0) + r.hours;
        });

        const isAll = selectedWeek === "all";

        charts.velocity = new Chart(weeklyCanvas.getContext('2d'), {
            type: isAll ? 'line' : 'bar',
            data: {
                labels: isAll ? Object.keys(weeklyVelocity).map(w => `Week ${w}`) : logs.map(r => r.date),
                datasets: [{
                    label: 'Hours',
                    data: isAll ? Object.values(weeklyVelocity) : logs.map(r => r.hours),
                    backgroundColor: logs.map(r => r.hours >= 8 ? COLORS.good : COLORS.accent),
                    borderColor: COLORS.good,
                    borderWidth: 2,
                    tension: 0.3
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: COLORS.grid } }
                }
            }
        });
    }
}

function renderHourDistChart(logs) {
    const canvas = document.getElementById('hourDistChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Binning: <4h, 4-6h, 6-8h, 8-9h, 9h+
    const bins = ["<4h", "4-6h", "6-8h", "8-9h", "9h+"];
    const counts = [0, 0, 0, 0, 0];

    logs.forEach(l => {
        const h = l.hours;
        if (h < 4) counts[0]++;
        else if (h < 6) counts[1]++;
        else if (h < 8) counts[2]++;
        else if (h < 9) counts[3]++;
        else counts[4]++;
    });

    charts.hourDist = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: bins,
            datasets: [{
                data: counts,
                backgroundColor: [
                    COLORS.text,    // <4 
                    COLORS.warning, // 4-6
                    '#FFA500',      // 6-8 (Orange)
                    COLORS.good,    // 8-9
                    COLORS.excellent // 9+
                ],
                borderWidth: 1,
                borderColor: COLORS.grid
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: COLORS.text, boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}

function getWeekNumber(date) {
    const start = new Date(OJT_START_DATE);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}