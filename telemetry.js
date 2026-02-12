const MASTER_GOAL = 500;
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

    // --- Stats & Comparisons ---
    const totalHours = logs.reduce((sum, r) => sum + r.hours, 0);
    const avgHours = totalHours / (logs.length || 1);
    const completionPerc = (totalHours / MASTER_GOAL) * 100;

    document.getElementById("avgHoursText").innerText = `${avgHours.toFixed(1)} hrs`;
    document.getElementById("completionPercText").innerText = `${completionPerc.toFixed(1)}%`;
    document.getElementById("completionTargetText").innerText = `${totalHours.toFixed(1)} / ${MASTER_GOAL} hrs`;

    // Comparison Logic
    if (selectedWeek !== "all") {
        const prevWeek = parseInt(selectedWeek) - 1;
        const prevLogs = allLogs.filter(r => getWeekNumber(new Date(r.date)) == prevWeek);
        
        if (prevLogs.length) {
            const prevTotal = prevLogs.reduce((sum, r) => sum + r.hours, 0);
            const prevAvg = prevTotal / prevLogs.length;

            updateCompare("avgCompare", avgHours, prevAvg, "hrs");
            updateCompare("completionCompare", totalHours, prevTotal, "hrs");
        } else {
            document.getElementById("avgCompare").innerText = "";
            document.getElementById("completionCompare").innerText = "";
        }
    } else {
        document.getElementById("avgCompare").innerText = "";
        document.getElementById("completionCompare").innerText = "";
    }

    const themeFont = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = COLORS.text;
    Chart.defaults.font.family = themeFont;

    // --- Charts ---
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

    const weeklyVelocity = {};
    // If we're looking at all logs, show weekly trend. If one week, show day-by-day.
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
        // Show daily comparison in the velocity chart when filtered
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

function updateCompare(id, current, previous, unit) {
    const el = document.getElementById(id);
    const diff = current - previous;
    const sign = diff >= 0 ? "+" : "";
    const color = diff >= 0 ? "#00FF00" : "#FF1E00";
    
    el.innerText = `${sign}${diff.toFixed(1)} ${unit} vs prev`;
    el.style.color = color;
}

function getWeekNumber(date) {
    const start = new Date(2026, 0, 26);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}
