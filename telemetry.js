const MASTER_GOAL = 500;
const OJT_START_DATE = new Date(2026, 0, 26); // Jan 26
const TARGET_DEADLINE = new Date(2026, 3, 25); // April 25

const COLORS = {
  accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff1e00',
  excellent: '#FF00FF',
  good: '#00FF00',
  warning: '#FFF000',
  text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff'
};

let allLogs = [];
let charts = {};

document.addEventListener("DOMContentLoaded", async () => {
    const loader = document.getElementById("loadingOverlay");
    loader.style.display = "flex";

    try {
        allLogs = await fetchTelemetryData();
        populateWeekSelector(allLogs);
        renderTelemetry(allLogs);
    } catch (err) {
        console.error("Telemetry Sync Failed:", err);
    } finally {
        setTimeout(() => {
            loader.style.display = "none";
        }, 800);
    }
});

function fetchTelemetryData() {
    return new Promise((resolve) => {
        const raw = localStorage.getItem("dtr");
        const logs = JSON.parse(raw) || [];
        setTimeout(() => resolve(logs), 800);
    });
}

function populateWeekSelector(logs) {
    const select = document.getElementById("weekSelect");
    const weeks = [...new Set(logs.map(r => getWeekNumber(new Date(r.date))))].sort((a,b) => b-a);
    
    weeks.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w;
        opt.innerText = `Week ${w}`;
        select.appendChild(opt);
    });
}

function updateView() {
    const val = document.getElementById("weekSelect").value;
    let filtered = allLogs;
    
    if (val !== "all") {
        filtered = allLogs.filter(r => getWeekNumber(new Date(r.date)) == val);
    }
    
    renderTelemetry(filtered, val);
}

function renderTelemetry(logs, selectedWeek = "all") {
    if (Object.keys(charts).length > 0) {
        Object.values(charts).forEach(c => c.destroy());
    }

    const totalActualHours = allLogs.reduce((sum, r) => sum + r.hours, 0);
    const avgPace = totalActualHours / (allLogs.length || 1);
    const remainingHours = Math.max(0, MASTER_GOAL - totalActualHours);
    
    // --- 1. OJT Forecast & Pace Calculator ---
    const today = new Date();
    today.setHours(0,0,0,0);
    const msPerDay = 24 * 60 * 60 * 1000;
    
    // Remaining Calendar Days until April 25
    // Use Math.max(1, ...) to avoid division by zero
    const daysRemaining = Math.max(1, Math.ceil((TARGET_DEADLINE - today) / msPerDay));
    const requiredRate = remainingHours / daysRemaining;

    // Last 7-Day Average (Calendar based)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    // Filter all logs that occurred in the last 7 calendar days
    const last7DayLogs = allLogs.filter(r => r.date >= sevenDaysAgoStr);
    const last7DayTotal = last7DayLogs.reduce((sum, r) => sum + r.hours, 0);
    const last7DayAvg = last7DayTotal / 7; 

    // Projected Date based on current pace (fall back to all-time average if 7-day is 0)
    const effectivePace = last7DayAvg || avgPace || 1; 
    const daysToFinish = remainingHours / effectivePace;
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + Math.ceil(daysToFinish));

    // Update UI
    document.getElementById("remainingHoursText").innerText = `${remainingHours.toFixed(1)} hrs remaining`;
    document.getElementById("completionDateText").innerText = `Projected: ${projectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    
    document.getElementById("remHoursPace").innerText = `${remainingHours.toFixed(1)}h`;
    document.getElementById("remDaysPace").innerText = `${daysRemaining} days`;
    document.getElementById("reqPaceValue").innerText = `${requiredRate.toFixed(1)}h/day`;
    document.getElementById("last7DayPace").innerText = `${last7DayAvg.toFixed(1)}h/day`;

    const statusMsg = document.getElementById("paceStatusMsg");
    const paceDiff = last7DayAvg - requiredRate;
    
    if (remainingHours <= 0) {
        statusMsg.innerText = "“Goal Reached! OJT Complete.”";
        statusMsg.style.color = COLORS.excellent;
    } else {
        statusMsg.innerText = `“Maintain ${requiredRate.toFixed(1)}h/day to finish on time.”`;
        if (paceDiff >= 0) {
            statusMsg.style.color = COLORS.good;
        } else {
            statusMsg.style.color = COLORS.accent;
        }
    }

    // --- 4. Efficiency Metrics (Filtered to current view) ---
    const filteredActual = logs.reduce((sum, r) => sum + r.hours, 0);
    const totalPlanned = logs.length * 8;
    const timeEfficiency = totalPlanned > 0 ? (filteredActual / totalPlanned) * 100 : 0;
    
    const totalBlocks = logs.reduce((sum, r) => sum + (r.accomplishments ? r.accomplishments.length : 0), 0);
    const energyEfficiency = filteredActual > 0 ? (totalBlocks / filteredActual) * 100 : 0;

    document.getElementById("timeEffValue").innerText = `${timeEfficiency.toFixed(1)}%`;
    document.getElementById("energyEffValue").innerText = `${energyEfficiency.toFixed(1)}%`;

    // --- 5. Fatigue Score & Status ---
    let fatigueRisk = 0;
    const sortedAll = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    // Check for 3 consecutive days > 8h
    let consecutiveHigh = 0;
    for (const r of sortedAll) {
        if (r.hours > 8) consecutiveHigh++;
        else consecutiveHigh = 0;
        
        if (consecutiveHigh >= 3) {
            fatigueRisk++;
            break; 
        }
    }

    // Check for Weekly Decline > 15%
    const weeklyTotals = {};
    allLogs.forEach(r => {
        const w = getWeekNumber(new Date(r.date));
        weeklyTotals[w] = (weeklyTotals[w] || 0) + r.hours;
    });
    const weeks = Object.keys(weeklyTotals).sort((a, b) => a - b);
    if (weeks.length >= 2) {
        const latestWeek = weeklyTotals[weeks[weeks.length - 1]];
        const prevWeek = weeklyTotals[weeks[weeks.length - 2]];
        const decline = ((prevWeek - latestWeek) / prevWeek) * 100;
        if (decline > 15) fatigueRisk++;
    }

    const fatIndicator = document.getElementById("fatigueIndicator");
    const fatLabel = document.getElementById("fatigueLabel");
    const fatNote = document.getElementById("fatigueNote");

    if (fatigueRisk === 0) {
        fatIndicator.innerText = "🟢";
        fatLabel.innerText = "Stable";
        fatLabel.style.color = COLORS.good;
        fatNote.innerText = "Performance is sustainable";
    } else if (fatigueRisk === 1) {
        fatIndicator.innerText = "🟡";
        fatLabel.innerText = "Accumulating Fatigue";
        fatLabel.style.color = COLORS.warning;
        fatNote.innerText = "Consecutive high load or slight dip detected";
    } else {
        fatIndicator.innerText = "🔴";
        fatLabel.innerText = "Burnout Pattern Emerging";
        fatLabel.style.color = COLORS.accent;
        fatNote.innerText = "High consecutive load + sharp productivity decline";
    }

    // --- 6. Cognitive Load Meter (L2 Upgrade) ---
    // Load = OJT Hours + Personal Project Hours
    let cogRisk = 0;
    let consecutiveCogHigh = 0;
    
    // Sort all logs for trend checking
    const sortedCog = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    for (const r of sortedCog) {
        const load = r.hours + (r.personalHours || 0);
        if (load > 11) consecutiveCogHigh += 2; // Heavier penalty for 11h+
        else if (load > 10) consecutiveCogHigh++;
        else consecutiveCogHigh = 0;
        
        if (consecutiveCogHigh >= 6) cogRisk = 2; // Critical
        else if (consecutiveCogHigh >= 3) cogRisk = Math.max(cogRisk, 1); // Mid
    }

    const cogIndicator = document.getElementById("cogIndicator");
    const cogLabel = document.getElementById("cogLabel");
    const cogNote = document.getElementById("cogNote");

    if (cogRisk === 0) {
        cogIndicator.innerText = "🔋";
        cogLabel.innerText = "Normal";
        cogLabel.style.color = COLORS.good;
        cogNote.innerText = "Cognitive capacity is healthy";
    } else if (cogRisk === 1) {
        cogIndicator.innerText = "⚠️";
        cogLabel.innerText = "High Load";
        cogLabel.style.color = COLORS.warning;
        cogNote.innerText = "Consecutive 10h+ days detected";
    } else {
        cogIndicator.innerText = "🚨";
        cogLabel.innerText = "Cognitive Redline";
        cogLabel.style.color = COLORS.accent;
        cogNote.innerText = "Repeated 11h+ sessions. Stop & Reset.";
    }

    // --- 7. L2 Performance Scores ---
    // Commute Efficiency
    const totalCommute = logs.reduce((sum, r) => sum + (r.commuteTotal || 0), 0);
    const prodCommute = logs.reduce((sum, r) => sum + (r.commuteProductive || 0), 0);
    const commuteEff = totalCommute > 0 ? (prodCommute / totalCommute) * 100 : 0;
    document.getElementById("commuteEff").innerText = `${commuteEff.toFixed(1)}%`;
    
    // Evening Deep Work Score
    const weekLogs = logs.filter(r => (r.personalHours || 0) > 0);
    const nightsPerWeek = weekLogs.length; 
    let consistencyFactor = 0.4;
    if (nightsPerWeek >= 4) consistencyFactor = 1.0;
    else if (nightsPerWeek >= 2) consistencyFactor = 0.7;
    
    const totalDeepHours = logs.reduce((sum, r) => sum + (r.personalHours || 0), 0);
    const deepWorkScore = totalDeepHours * consistencyFactor;
    document.getElementById("deepWorkScore").innerText = deepWorkScore.toFixed(1);

    // Avg Sleep
    const totalSleep = logs.reduce((sum, r) => sum + (r.sleepHours || 0), 0);
    const avgSleep = logs.length > 0 ? totalSleep / logs.length : 0;
    document.getElementById("avgSleep").innerText = `${avgSleep.toFixed(1)}h`;

    // --- 8. Momentum & Streaks (L3 Upgrade) ---
    // Calculate Momentum Index
    const currentWeekNum = getWeekNumber(today);
    const lastWeekNum = currentWeekNum - 1;
    
    // Use allLogs for these global metrics
    const weeklyTotalsForMomentum = {};
    allLogs.forEach(r => {
        const w = getWeekNumber(new Date(r.date));
        weeklyTotalsForMomentum[w] = (weeklyTotalsForMomentum[w] || 0) + r.hours;
    });

    const thisWeekHours = weeklyTotalsForMomentum[currentWeekNum] || 0;
    const lastWeekHours = weeklyTotalsForMomentum[lastWeekNum] || 0;
    
    let momentum = 0;
    if (lastWeekHours > 0) {
        momentum = ((thisWeekHours - lastWeekHours) / lastWeekHours) * 100;
    }

    const momentumValueEl = document.getElementById("momentumValue");
    momentumValueEl.innerText = `${momentum > 0 ? "+" : ""}${momentum.toFixed(1)}%`;
    momentumValueEl.style.color = momentum >= 0 ? COLORS.good : COLORS.accent;

    const momentumStatusEl = document.getElementById("momentumStatus");
    if (momentum > 5) {
        momentumStatusEl.innerText = "ACCELERATING";
        momentumStatusEl.style.color = COLORS.good;
    } else if (momentum < -5) {
        momentumStatusEl.innerText = "Slowing Down";
        momentumStatusEl.style.color = COLORS.accent;
    } else {
        momentumStatusEl.innerText = "STABILITY MODE";
        momentumStatusEl.style.color = COLORS.neutral;
    }

    // Streak Calculation (Consistency Tracker)
    // Counting consecutive days with hours >= 8
    let currentStreak = 0;
    const sortedForStreak = [...allLogs].sort((a,b) => new Date(b.date) - new Date(a.date)); // Descending
    
    // Check from today downwards
    let checkDate = new Date(today);
    for (const r of sortedForStreak) {
        const logDate = new Date(r.date);
        logDate.setHours(0,0,0,0);
        
        // Skip current day if not logged yet? 
        // For simplicity, just count consecutive in the sorted list IF the gaps are small
        if (r.hours >= 8) {
            currentStreak++;
        } else {
            break;
        }
    }
    document.getElementById("streakValue").innerText = `${currentStreak} Days`;

    // --- 9. Energy Zone Distribution (L3 Upgrade) ---
    renderEnergyZoneChart(logs);

    // --- Chart Defaults ---
    const themeFont = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = COLORS.text;
    Chart.defaults.font.family = themeFont;

    // --- 2. Trajectory Chart (Cumulative vs Ideal) ---
    renderTrajectoryChart(allLogs);
    
    // --- 2.5 Identity Chart (L2 Upgrade) ---
    renderIdentityChart(allLogs);

    // --- 3. Existing Charts (Contextual to Filter) ---
    renderContextualCharts(logs, selectedWeek);
}

function renderTrajectoryChart(logs) {
    const ctx = document.getElementById('trajectoryChart').getContext('2d');
    
    // Sort logs by date just in case
    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    const labels = [];
    const actualCumulative = [];
    const idealCumulative = [];
    
    let currentSum = 0;
    const start = new Date(OJT_START_DATE);
    const end = new Date();
    if (logs.length > 0) {
        const lastLogDate = new Date(sortedLogs[sortedLogs.length-1].date);
        if (lastLogDate > end) end.setFullYear(lastLogDate.getFullYear(), lastLogDate.getMonth(), lastLogDate.getDate());
    }

    // Map logs for easy access
    const logMap = {};
    sortedLogs.forEach(l => logMap[l.date] = l.hours);

    let dayCounter = 0;
    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr);
        
        currentSum += (logMap[dateStr] || 0);
        actualCumulative.push(currentSum);
        
        // Ideal: 8 hrs per calendar day? Usually its per work day.
        // Let's assume 8 hrs per day worked, but ideal trajectory is usually "Total Goal / Total Days"
        // Or 8 hrs/day from start.
        dayCounter++;
        idealCumulative.push(dayCounter * 8);
    }

    charts.trajectory = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Actual Cumulative',
                    data: actualCumulative,
                    borderColor: COLORS.accent,
                    backgroundColor: 'rgba(255, 30, 0, 0.2)',
                    fill: true,
                    tension: 0.1
                },
                {
                    label: 'Ideal Trajectory (8h/day)',
                    data: idealCumulative,
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0
                },
                {
                    label: '500h Goal',
                    data: labels.map(() => 500),
                    borderColor: COLORS.excellent,
                    borderWidth: 1,
                    borderDash: [2, 2],
                    fill: false,
                    pointRadius: 0,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    max: Math.max(520, ...actualCumulative, ...idealCumulative),
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: { display: true, text: 'Cumulative Hours' }
                },
                x: { 
                    ticks: { 
                        maxRotation: 45, 
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 20
                    } 
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function renderIdentityChart(logs) {
    const ctx = document.getElementById('identityChart').getContext('2d');
    
    // Group by week and get average identity score
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
    const data = labels.map(w => weeklyIdentity[w].sum / weeklyIdentity[w].count);

    charts.identity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(w => `Week ${w}`),
            datasets: [{
                label: 'Alignment Score (1-5)',
                data: data,
                borderColor: COLORS.excellent,
                backgroundColor: 'rgba(255, 0, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 5, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderContextualCharts(logs, selectedWeek) {
    // --- Delta History ---
    const deltaCtx = document.getElementById('deltaChart').getContext('2d');
    charts.delta = new Chart(deltaCtx, {
        type: 'line',
        data: {
            labels: logs.map(r => r.date),
            datasets: [{
                label: 'Session Delta (hrs)',
                data: logs.map(r => r.hours - 8),
                borderColor: COLORS.accent,
                backgroundColor: 'rgba(255, 30, 0, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: COLORS.accent
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Hours vs Target (8h)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // --- Hour Distribution ---
    const hourCounts = {};
    logs.forEach(r => {
        const h = Math.round(r.hours * 2) / 2;
        hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const sortedHours = Object.keys(hourCounts).sort((a, b) => a - b);
    const hourCtx = document.getElementById('hourDistChart').getContext('2d');
    charts.hour = new Chart(hourCtx, {
        type: 'bar',
        data: {
            labels: sortedHours.map(h => `${h}h`),
            datasets: [{
                label: 'Frequency',
                data: sortedHours.map(h => hourCounts[h]),
                backgroundColor: 'rgba(255, 30, 0, 0.6)',
                borderColor: COLORS.accent,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Days' }, ticks: { stepSize: 1 } },
                x: { grid: { display: false }, title: { display: true, text: 'Hours per Day' } }
            }
        }
    });

    // --- Weekly Velocity ---
    const weeklyVelocity = {};
    const weeklyCtx = document.getElementById('weeklyTrendChart').getContext('2d');
    if (selectedWeek === "all") {
        logs.forEach(r => {
            const w = getWeekNumber(new Date(r.date));
            weeklyVelocity[w] = (weeklyVelocity[w] || 0) + r.hours;
        });
        charts.velocity = new Chart(weeklyCtx, {
            type: 'line',
            data: {
                labels: Object.keys(weeklyVelocity).map(w => `Week ${w}`),
                datasets: [{
                    label: 'Total Weekly Hours',
                    data: Object.values(weeklyVelocity),
                    borderColor: '#00FF00',
                    backgroundColor: 'rgba(0, 255, 0, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Total Hours' } },
                    x: { grid: { display: false } }
                }
            }
        });
    } else {
        charts.velocity = new Chart(weeklyCtx, {
            type: 'bar',
            data: {
                labels: logs.map(r => r.date),
                datasets: [{
                    label: 'Daily Hours',
                    data: logs.map(r => r.hours),
                    backgroundColor: logs.map(r => r.hours >= 8 ? '#00FF00' : '#FF1E00'),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderEnergyZoneChart(logs) {
    const ctx = document.getElementById('energyZoneChart').getContext('2d');
    
    const zones = {
        "Elite": 0,    // 8h+ OJT + 1h Personal
        "Overdrive": 0, // 9h+ Total
        "Solid": 0,    // 8h OJT
        "Survival": 0, // 6-7h
        "Recovery": 0  // <6h
    };

    logs.forEach(r => {
        const ojt = r.hours;
        const personal = r.personalHours || 0;
        const total = ojt + personal;

        if (ojt >= 8 && personal >= 1) zones["Elite"]++;
        else if (total > 9) zones["Overdrive"]++;
        else if (ojt >= 8) zones["Solid"]++;
        else if (ojt >= 6) zones["Survival"]++;
        else zones["Recovery"]++;
    });

    const data = Object.values(zones);
    const labels = Object.keys(zones);

    charts.energy = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#FF00FF', // Elite
                    '#ff1e00', // Overdrive
                    '#00FF00', // Solid
                    '#FFF000', // Survival
                    '#333333'  // Recovery
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            },
            scales: {
                r: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    angleLines: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { backdropColor: 'transparent', color: COLORS.text }
                }
            }
        }
    });
}

function getWeekNumber(date) {
    const start = new Date(2026, 0, 26);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}
