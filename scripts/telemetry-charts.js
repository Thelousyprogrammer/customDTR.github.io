/**
 * TELEMETRY RENDER MODULE
 * Handles chart initialization and data visualization
 */

function renderTrajectoryChart(logs, customPace = null) {
    const canvas = document.getElementById('trajectoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Create GADIENTS
    const gradAccent = ctx.createLinearGradient(0, 0, 0, 400);
    gradAccent.addColorStop(0, COLORS.accent + '66'); // 40% opacity
    gradAccent.addColorStop(1, COLORS.fill);

    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    const labels = [];
    const actualCumulative = [];
    const idealCumulative = [];
    
    let currentSum = 0;
    let idealSum = 0;
    
    const start = new Date(OJT_START);
    const end = new Date(TARGET_DEADLINE);
    const totalWorkDays = countWorkDays(start, end);
    const goalPacePerWorkday = totalWorkDays > 0 ? Math.ceil(MASTER_TARGET_HOURS / totalWorkDays) : 0;
    
    const logMap = {};
    sortedLogs.forEach(l => logMap[l.date] = l.hours);

    const f = calculateForecast(logs);
    const lastLogDate = sortedLogs.length ? new Date(sortedLogs[sortedLogs.length - 1].date) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const projectionStartDate = lastLogDate
        ? (lastLogDate > today ? lastLogDate : today)
        : today;
    const projectedCumulative = [];
    let projSum = 0;

    const projectionPace = customPace !== null ? parseFloat(customPace) : (f.recentAvg || 8);

    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr);
        
        const dayHours = logMap[dateStr];
        if (dayHours !== undefined) {
            currentSum += dayHours;
        }
        
        // Continuous ACTUAL line up to the most recent record
        if (d <= projectionStartDate) {
            actualCumulative.push(currentSum);
            if (!lastLogDate || d <= lastLogDate) {
                projSum = currentSum;
            }
            projectedCumulative.push(null);
        } else {
            actualCumulative.push(null);
            const day = d.getDay();
            if (day !== 0) projSum += projectionPace; 
            projectedCumulative.push(Math.round(projSum));
        }
        
        const day = d.getDay();
        if (day !== 0) idealSum += goalPacePerWorkday;
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
                    backgroundColor: gradAccent, 
                    fill: true, 
                    tension: 0.1,
                    pointRadius: 2,
                    spanGaps: false
                },
                { 
                    label: 'Forecasted Projection', 
                    data: projectedCumulative, 
                    borderColor: COLORS.excellent, 
                    borderDash: [3, 3],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4,
                    spanGaps: true
                },
                { 
                    label: 'Goal Pace (to 500h)', 
                    data: idealCumulative, 
                    borderColor: 'rgba(255,255,255,0.2)', 
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
            plugins: {
                tooltip: {
                    callbacks: {
                        footer: (tooltipItems) => {
                            const actual = tooltipItems.find(i => i.datasetIndex === 0)?.parsed.y || 0;
                            const ideal = tooltipItems.find(i => i.datasetIndex === 2)?.parsed.y || 0;
                            const diff = ideal - actual;
                            if (actual === 0 && ideal === 0) return null;
                            return diff > 0 
                                ? `Deficit: ${diff.toFixed(1)}h behind` 
                                : (diff < 0 ? `Surplus: ${Math.abs(diff).toFixed(1)}h ahead` : 'On Track');
                        }
                    }
                }
            },
            scales: { 
                y: { grid: { color: COLORS.grid } }, 
                x: { ticks: { autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } } 
            }
        }
    });
}

function countWorkDays(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0) count++;
    }
    return count;
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
                backgroundColor: [COLORS.text + '99', COLORS.warning, COLORS.good, COLORS.accent, COLORS.excellent],
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
    
    const gradIdentity = ctx.createLinearGradient(0, 0, 0, 300);
    gradIdentity.addColorStop(0, COLORS.excellent + '55');
    gradIdentity.addColorStop(1, 'transparent');

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
                backgroundColor: gradIdentity,
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

function renderCandlestickChart(logs) {
    const canvas = document.getElementById('candlestickChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Group logs by week and calculate OHLC Delta
    const weeklyOHLC = {};
    const sorted = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(r => {
        const w = getWeekNumber(new Date(r.date));
        const delta = r.hours - 8;
        
        if (!weeklyOHLC[w]) {
            weeklyOHLC[w] = { week: `Week ${w}`, open: delta, close: delta, high: delta, low: delta };
        } else {
            // Update the existing week record
            weeklyOHLC[w].close = delta; 
            weeklyOHLC[w].high = Math.max(weeklyOHLC[w].high, delta);
            weeklyOHLC[w].low = Math.min(weeklyOHLC[w].low, delta);
        }
    });

    const weeks = Object.values(weeklyOHLC).map(w => {
        // Ensure the body is visible even if open == close (Doji)
        if (Math.abs(w.open - w.close) < 0.05) {
            w.close = w.open + 0.05; // Force a thin line
        }
        return w;
    });

    charts.candlestick = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks.map(w => w.week),
            datasets: [
                {
                    label: 'Wick',
                    data: weeks.map(w => [w.low, w.high]),
                    backgroundColor: weeks.map(w => w.close >= w.open ? COLORS.good + '88' : COLORS.accent + '88'), // Matches body color with transparency
                    borderColor: 'transparent',
                    barPercentage: 0.1, // Thicker wick for visibility
                    grouped: false,
                    order: 2
                },
                {
                    label: 'Body',
                    // Crucial: Chart.js bar data [v0, v1] should be [min, max] for reliable rendering
                    data: weeks.map(w => [Math.min(w.open, w.close), Math.max(w.open, w.close)]),
                    backgroundColor: weeks.map(w => w.close >= w.open ? COLORS.good : COLORS.accent),
                    borderColor: weeks.map(w => w.close >= w.open ? COLORS.good : COLORS.accent),
                    borderWidth: 1,
                    barPercentage: 0.7, 
                    grouped: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const d = weeks[context.dataIndex];
                            return [
                                `High:  ${d.high > 0 ? '+' : ''}${d.high.toFixed(1)}h`,
                                `Open:  ${d.open > 0 ? '+' : ''}${d.open.toFixed(1)}h`,
                                `Close: ${d.close > 0 ? '+' : ''}${d.close.toFixed(1)}h`,
                                `Low:   ${d.low > 0 ? '+' : ''}${d.low.toFixed(1)}h`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: COLORS.grid },
                    ticks: { callback: value => (value > 0 ? '+' : '') + value + 'h' }
                },
                x: { grid: { display: false } }
            }
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
                        above: COLORS.good + '44',
                        below: COLORS.accent + '44'
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

    renderCandlestickChart(allLogs);
}

function renderRadarChart(logs) {
    const canvas = document.getElementById('dayVelocityRadar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayAverages = [0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0];

    logs.forEach(l => {
        const d = new Date(l.date).getDay();
        if (d === 0) return; // Skip Sunday
        const idx = d - 1; // Mon=0
        dayAverages[idx] += l.hours;
        dayCounts[idx]++;
    });

    const data = dayAverages.map((sum, i) => dayCounts[i] > 0 ? sum / dayCounts[i] : 0);

    charts.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: days,
            datasets: [{
                label: 'Avg Hours',
                data: data,
                borderColor: COLORS.accent,
                backgroundColor: COLORS.accent + '33',
                borderWidth: 2,
                pointBackgroundColor: COLORS.accent,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: COLORS.grid },
                    grid: { color: COLORS.grid },
                    pointLabels: { color: COLORS.text, font: { size: 11 } },
                    ticks: { display: false, stepSize: 2 },
                    min: 0,
                    max: 12
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderHourDistChart(logs) {
    const canvas = document.getElementById('hourDistChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

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
                    COLORS.text + '99',
                    COLORS.warning,
                    '#FFA500',
                    COLORS.good,
                    COLORS.excellent
                ],
                borderWidth: 1,
                borderColor: COLORS.grid
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'right', labels: { color: COLORS.text, boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}

