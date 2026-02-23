/**
 * TELEMETRY MAIN CONTROLLER
 */

document.addEventListener("DOMContentLoaded", async () => {
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.style.display = "flex";

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

// --- CORE UTILITIES ---

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

function initThemeSwitcher() {
    const savedTheme = localStorage.getItem('user-theme') || 'f1';
    if (document.documentElement.getAttribute('data-theme') !== savedTheme) {
        setTelemetryTheme(savedTheme);
    } else {
        setTimeout(() => {
            COLORS = getThemeValues();
            if (allLogs.length > 0) renderTelemetry(allLogs);
        }, 100);
    }
}

function setTelemetryTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('user-theme', themeName);
    setTimeout(() => {
        COLORS = getThemeValues();
        if (allLogs.length > 0) renderTelemetry(allLogs);
    }, 50);
}

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
        const cleaned = logs.map(l => ({
            ...l,
            hours: parseFloat(l.hours) || 0,
            personalHours: parseFloat(l.personalHours) || 0,
            identityScore: parseInt(l.identityScore) || 0
        }));
        realLogs = JSON.parse(JSON.stringify(cleaned));
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

function updateTargetPace(val) {
    const pace = parseFloat(val);
    const display = document.getElementById("paceSliderVal");
    if (display) display.innerText = pace.toFixed(1);
    
    if (charts.trajectory) {
        // 1. Recalculate Projection Data in Real-time
        const start = new Date(OJT_START);
        const end = new Date(TARGET_DEADLINE);
        const sortedLogs = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
        const logMap = {};
        sortedLogs.forEach(l => logMap[l.date] = l.hours);
        const lastLogDate = sortedLogs.length ? new Date(sortedLogs[sortedLogs.length - 1].date) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const projectionStartDate = lastLogDate
            ? (lastLogDate > today ? lastLogDate : today)
            : today;

        let currentSum = 0;
        let projSum = 0;
        const newProjection = [];

        for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayHours = logMap[dateStr];
            if (dayHours !== undefined) {
                currentSum += dayHours;
            }

            if (d <= projectionStartDate) {
                newProjection.push(null);
                if (!lastLogDate || d <= lastLogDate) {
                    projSum = currentSum;
                }
            } else {
                if (d.getDay() !== 0) projSum += pace;
                newProjection.push(Math.round(projSum));
            }
        }
        
        // 2. Update Chart Dataset (Index 1 is Forecasted Projection)
        charts.trajectory.data.datasets[1].data = newProjection;
        charts.trajectory.update('none'); // 'none' for instant updates while sliding

        // 3. Update Forecast UI Stats (Simulation Mode)
        const f = calculateForecast(allLogs, pace);
        safeUpdate("completionDateText", `Projected: ${f.projectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`);
        
        const defEl = document.getElementById("timeDeficitText");
        if (defEl) {
            if (f.remainingHours > 0 && f.requiredRate > pace) {
                defEl.innerHTML = `Simulation: <strong>Below Target Pace</strong>`;
                defEl.style.color = COLORS.accent; 
            } else if (f.isAhead) {
                defEl.innerHTML = `Simulation: <strong>On Track</strong>`;
                defEl.style.color = COLORS.good; 
            }
        }

        const statusMsg = document.getElementById("paceStatusMsg");
        if (statusMsg) {
            statusMsg.innerText = f.isAhead 
                ? `“At ${pace.toFixed(1)}h/day, you finish by ${f.projectedDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}.”`
                : `“${pace.toFixed(1)}h/day is insufficient. Target ${Math.ceil(f.requiredRate)}h+.”`;
            statusMsg.style.color = f.isAhead ? COLORS.good : COLORS.accent;
        }
    }
}

// --- MAIN RENDER LOOP ---

function renderTelemetry(logs, selectedWeek = "all") {
    const today = new Date();
    Object.values(charts).forEach(c => { if(c && typeof c.destroy === 'function') c.destroy(); });
    charts = {};

    if (!logs) logs = [];

    const f = calculateForecast(allLogs);
    const deficit = f.remainingHours > 0 ? (f.daysRemaining * 8 - f.remainingHours) : 0; // Simplified deficit check

    safeUpdate("remainingHoursText", `${Math.round(f.remainingHours)} hrs remaining`);
    const defEl = document.getElementById("timeDeficitText");
    if (defEl) {
        if (f.remainingHours > 0 && f.requiredRate > 8) {
            defEl.innerHTML = `Deficit: <strong>Behind Schedule</strong>`;
            defEl.style.color = COLORS.accent; 
        } else if (f.isAhead) {
            defEl.innerHTML = `Status: <strong>Ahead / On Track</strong>`;
            defEl.style.color = COLORS.good; 
        } else {
            defEl.innerHTML = `Status: <strong>Steady Progress</strong>`;
            defEl.style.color = COLORS.text;
        }
    }

    safeUpdate("completionDateText", `Projected: ${f.projectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`);
    safeUpdate("remHoursPace", `${Math.round(f.remainingHours)}h`);
    safeUpdate("remDaysPace", `${f.workDaysRemaining} days`);
    safeUpdate("reqPaceValue", `${Math.ceil(f.requiredRate)}h/day`);
    safeUpdate("last7DayPace", `${Math.round(allLogs.slice(-7).reduce((s,r)=>s+r.hours,0)/Math.max(1, Math.min(7, allLogs.length)))}h/day`);

    const statusMsg = document.getElementById("paceStatusMsg");
    if (statusMsg) {
        if (f.remainingHours <= 0) {
            statusMsg.innerText = "“Goal Reached! OJT Complete.”";
            statusMsg.style.color = COLORS.excellent;
        } else {
            statusMsg.innerText = f.isAhead 
                ? `“On track to finish by ${f.projectedDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}.”`
                : `“Required pace higher than current. Increase hours.”`;
            statusMsg.style.color = f.isAhead ? COLORS.good : COLORS.accent;
        }
    }

    const filteredActual = logs.reduce((sum, r) => sum + r.hours, 0);
    const totalPlanned = logs.length * 8;
    const timeEfficiency = totalPlanned > 0 ? (filteredActual / totalPlanned) * 100 : 0;
    const totalBlocks = logs.reduce((sum, r) => sum + (r.accomplishments ? r.accomplishments.length : 0), 0);
    const energyEfficiency = filteredActual > 0 ? (totalBlocks / filteredActual) * 100 : 0;

    safeUpdate("timeEffValue", `${timeEfficiency.toFixed(1)}%`);
    safeUpdate("energyEffValue", `${energyEfficiency.toFixed(1)}%`);

    // --- FOCUS SCORE CALCULATION ---
    const avgIdentity = logs.length > 0 ? logs.reduce((sum, r) => sum + (r.identityScore || 0), 0) / logs.length : 0;
    const blocksPerHour = filteredActual > 0 ? totalBlocks / filteredActual : 0;
    const focusScore = (blocksPerHour * (avgIdentity / 5)) * 10;
    safeUpdate("focusScore", focusScore.toFixed(1));

    handleHealthIndicators(logs);

    const totalCommute = logs.reduce((sum, r) => sum + (r.commuteTotal || 0), 0);
    const prodCommute = logs.reduce((sum, r) => sum + (r.commuteProductive || 0), 0);
    const commuteEff = totalCommute > 0 ? (prodCommute / totalCommute) * 100 : 0;
    safeUpdate("commuteEff", `${commuteEff.toFixed(1)}%`);
    
    const weekLogs = logs.filter(r => (r.personalHours || 0) > 0);
    let consistencyFactor = weekLogs.length >= 4 ? 1.0 : (weekLogs.length >= 2 ? 0.7 : 0.4);
    const totalDeepHours = logs.reduce((sum, r) => sum + (r.personalHours || 0), 0);
    safeUpdate("deepWorkScore", (totalDeepHours * consistencyFactor).toFixed(1));

    const totalSleep = logs.reduce((sum, r) => sum + (r.sleepHours || 0), 0);
    safeUpdate("avgSleep", `${(logs.length > 0 ? totalSleep / logs.length : 0).toFixed(1)}h`);

    calculateMomentum(today);

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = COLORS.text;
        Chart.defaults.borderColor = COLORS.grid;
        Chart.defaults.font.family = COLORS.fontBody;

        const slider = document.getElementById("paceSlider");
        const currentPace = slider ? slider.value : null;
        if (slider) {
            const display = document.getElementById("paceSliderVal");
            if (display) display.innerText = parseFloat(slider.value).toFixed(1);
        }

        renderTrajectoryChart(allLogs, currentPace);
        renderIdentityChart(allLogs);
        renderEnergyZoneChart(logs);
        renderContextualCharts(logs, selectedWeek);
        renderRadarChart(logs);
        renderHourDistChart(logs);
    }
}

// --- CALCULATIONS ---

function handleHealthIndicators(logs) {
    let fatigueRisk = 0;
    const sorted = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    let consecutiveHigh = 0;
    for (const r of sorted) {
        if (r.hours > 8) consecutiveHigh++;
        else consecutiveHigh = 0;
        if (consecutiveHigh >= 3) fatigueRisk++; 
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
        } else if (fatigueRisk < 3) {
            if (fatInd) fatInd.innerText = "🟡";
            fatLabel.innerText = "Accumulating Fatigue";
            fatLabel.style.color = COLORS.warning;
            if (fatNote) fatNote.innerText = "High load detected";
        } else {
            if (fatInd) fatInd.innerText = "🔴";
            fatLabel.innerText = "Burnout Risk";
            fatLabel.style.color = COLORS.accent;
            if (fatNote) fatNote.innerText = "CRITICAL: Rest Required";
        }
    }

    const avgTotalHours = logs.length > 0 ? logs.reduce((s,r) => s + r.hours + (r.personalHours||0), 0) / logs.length : 0;
    const cogLabel = document.getElementById("cogLabel");
    const cogInd = document.getElementById("cogIndicator");
    const cogNote = document.getElementById("cogNote");

    if (cogLabel) {
        if (avgTotalHours > 12) {
            cogInd.innerText = "🪫";
            cogLabel.innerText = "System Overload";
            cogLabel.style.color = COLORS.accent;
            cogNote.innerText = `Avg Load: ${avgTotalHours.toFixed(1)}h/day`;
        } else if (avgTotalHours > 9) {
            cogInd.innerText = "⚡";
            cogLabel.innerText = "High Engagement";
            cogLabel.style.color = COLORS.warning;
            cogNote.innerText = "Pushing boundaries";
        } else {
            cogInd.innerText = "🔋";
            cogLabel.innerText = "Optimal";
            cogLabel.style.color = COLORS.good;
            cogNote.innerText = "Steady mental state";
        }
    }
}

function calculateMomentum(today) {
    const oneDay = 24 * 60 * 60 * 1000;
    const now = new Date(today);
    now.setHours(23, 59, 59, 999); 
    
    const sevenDaysAgo = new Date(now.getTime() - (7 * oneDay));
    const fourteenDaysAgo = new Date(now.getTime() - (14 * oneDay));

    const sumHours = (start, end) => {
        return allLogs.reduce((sum, r) => {
            const d = new Date(r.date);
            return (d > start && d <= end) ? sum + r.hours : sum;
        }, 0);
    };

    const currentVelocity = sumHours(sevenDaysAgo, now);
    const previousVelocity = sumHours(fourteenDaysAgo, sevenDaysAgo);

    let momentum = 0;
    if (previousVelocity > 0) {
        momentum = ((currentVelocity - previousVelocity) / previousVelocity) * 100;
    } else if (currentVelocity > 0) {
        momentum = 100;
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
