/**
 * DTR CORE MODULE
 * Configuration, Models, and Fundamental Utilities
 */

const MASTER_TARGET_HOURS = 500;
const DAILY_TARGET_HOURS = 8;
const GREAT_DELTA_THRESHOLD = 2;
const OJT_START = new Date(2026, 0, 26);
const TARGET_DEADLINE = new Date(2026, 3, 25); // April 25

const DTR_COLORS = {
    neutral: "var(--color-neutral)",
    warning: "var(--color-warning)",
    good: "var(--color-good)",
    excellent: "var(--color-excellent)"
};

let dailyRecords = []; // Global state for the DTR app
let editingIndex = null;
let currentSortMode = "date-asc";

class DailyRecord {
    constructor(date, hours, reflection, accomplishments, tools, images = [], l2Data = {}) {
        this.date = date;
        this.hours = hours;
        this.delta = hours - DAILY_TARGET_HOURS;
        this.reflection = reflection;
        this.accomplishments = accomplishments;
        this.tools = tools;
        this.images = images;
        
        this.personalHours = parseFloat(l2Data.personalHours) || 0;
        this.sleepHours = parseFloat(l2Data.sleepHours) || 0;
        this.recoveryHours = parseFloat(l2Data.recoveryHours) || 0;
        this.commuteTotal = parseFloat(l2Data.commuteTotal) || 0;
        this.commuteProductive = parseFloat(l2Data.commuteProductive) || 0;
        this.identityScore = parseInt(l2Data.identityScore) || null;
    }
}

// --- UTILITIES ---

function getWeekNumber(date, reference = OJT_START) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    const diff = d.getTime() - ref.getTime();
    if (diff < 0) return 1;
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

function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('user-theme', themeName);
    console.log("Theme synced: " + themeName);
}

function calculateForecast(logs = dailyRecords, overridePace = null) {
    const totalActualHours = logs.reduce((sum, r) => sum + (r.hours || 0), 0);
    const remainingHours = Math.max(0, MASTER_TARGET_HOURS - totalActualHours);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Calculate required rate based on working days (Mon-Sat) until deadline
    let workDaysUntilDeadline = 0;
    let d = new Date(today);
    while (d < TARGET_DEADLINE) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) workDaysUntilDeadline++;
    }
    const requiredRate = workDaysUntilDeadline > 0 ? (remainingHours / workDaysUntilDeadline) : 0;

    // Determine pace: use override or last 7 days avg
    let pace;
    if (overridePace !== null) {
        pace = parseFloat(overridePace);
    } else {
        const recentLogs = logs.slice(-7);
        const recentAvg = recentLogs.length > 0 
            ? recentLogs.reduce((s, r) => s + (r.hours || 0), 0) / recentLogs.length 
            : 8;
        pace = Math.max(0.1, recentAvg);
    }
    
    // Project completion date based on pace, skipping Sundays
    let projHoursAccum = 0;
    let projDate = new Date(today);
    if (remainingHours > 0) {
        while (projHoursAccum < remainingHours) {
            projDate.setDate(projDate.getDate() + 1);
            if (projDate.getDay() !== 0) {
                projHoursAccum += pace;
            }
            // Safety break 1 year
            if (projDate.getFullYear() > today.getFullYear() + 1) break;
        }
    }

    const isAhead = (remainingHours <= 0) || (projDate <= TARGET_DEADLINE);

    return {
        remainingHours,
        daysRemaining: Math.max(0, Math.ceil((TARGET_DEADLINE - today) / (24*60*60*1000))),
        workDaysRemaining: workDaysUntilDeadline,
        requiredRate,
        recentAvg: pace,
        projectedDate: projDate,
        totalActualHours,
        isAhead
    };
}
