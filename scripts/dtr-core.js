/**
 * DTR CORE MODULE
 * Configuration, Models, and Fundamental Utilities
 */

const MASTER_TARGET_HOURS = 500;
const DAILY_TARGET_HOURS = 8;
const GREAT_DELTA_THRESHOLD = 2;
const OJT_START = new Date(2026, 0, 26);
const TARGET_DEADLINE = new Date(2026, 3, 25); // April 25
const TZ_OFFSET_MINUTES = 8 * 60; // GMT+8 fixed computation basis

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
    constructor(date, hours, reflection, accomplishments, tools, images = [], l2Data = {}, imageIds = []) {
        this.date = date;
        this.hours = hours;
        this.delta = hours - DAILY_TARGET_HOURS;
        this.reflection = reflection;
        this.accomplishments = accomplishments;
        this.tools = tools;
        this.images = images;
        this.imageIds = imageIds;

        this.personalHours = parseFloat(l2Data.personalHours) || 0;
        this.sleepHours = parseFloat(l2Data.sleepHours) || 0;
        this.recoveryHours = parseFloat(l2Data.recoveryHours) || 0;
        this.commuteTotal = parseFloat(l2Data.commuteTotal) || 0;
        this.commuteProductive = parseFloat(l2Data.commuteProductive) || 0;
        this.identityScore = parseInt(l2Data.identityScore) || null;
    }
}

// --- UTILITIES ---

const DAY_MS = 24 * 60 * 60 * 1000;
const warnedInvalidDateInputs = new Set();

function pad2(n) {
    return String(n).padStart(2, "0");
}

function warnInvalidDateInput(input) {
    const key = String(input);
    if (warnedInvalidDateInputs.has(key)) return;
    warnedInvalidDateInputs.add(key);
    console.warn("Skipping invalid date input:", input);
}

function toGmt8DateKey(input) {
    if (input == null) return null;
    if (typeof input === "string") {
        const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    if (Number.isNaN(d.getTime())) {
        warnInvalidDateInput(input);
        return null;
    }
    const shifted = new Date(d.getTime() + TZ_OFFSET_MINUTES * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function parseDateKeyGmt8(dateKey) {
    if (typeof dateKey !== "string") return null;
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        warnInvalidDateInput(dateKey);
        return null;
    }
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - (TZ_OFFSET_MINUTES * 60 * 1000);
    const parsed = new Date(utcMs);
    if (Number.isNaN(parsed.getTime())) {
        warnInvalidDateInput(dateKey);
        return null;
    }
    return parsed;
}

function nowGmt8StartOfDay() {
    return parseDateKeyGmt8(toGmt8DateKey(new Date()));
}

function addDaysGmt8(date, n) {
    const baseKey = toGmt8DateKey(date);
    const baseDate = parseDateKeyGmt8(baseKey);
    if (!baseDate) return null;
    return new Date(baseDate.getTime() + (n * DAY_MS));
}

function diffDaysGmt8(a, b) {
    if (!a || !b) return 0;
    return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

function getGmt8Weekday(date) {
    if (!date) return 0;
    const shifted = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60 * 1000);
    return shifted.getUTCDay(); // 0=Sun ... 6=Sat in GMT+8
}

function isWorkdayGmt8(date) {
    if (!date) return false;
    return getGmt8Weekday(date) !== 0; // Exclude Sundays only (Mon-Sat workdays)
}

function countWorkdaysGmt8(start, endInclusive) {
    if (!start || !endInclusive) return 0;
    let count = 0;
    for (let d = new Date(start.getTime()); d <= endInclusive; d = addDaysGmt8(d, 1)) {
        if (isWorkdayGmt8(d)) count++;
    }
    return count;
}

function formatGmt8DateLabel(input, options = { month: "short", day: "numeric" }) {
    const key = toGmt8DateKey(input);
    if (!key) return "";
    const date = parseDateKeyGmt8(key);
    if (!date) return "";
    return date.toLocaleDateString("en-US", { ...options, timeZone: "Asia/Manila" });
}

function getWeekNumber(date, reference = OJT_START) {
    const d = parseDateKeyGmt8(toGmt8DateKey(date));
    const ref = parseDateKeyGmt8(toGmt8DateKey(reference));
    if (!d || !ref) return 1;
    const diff = d.getTime() - ref.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * DAY_MS)) + 1;
}

function getTotalHours() {
    return dailyRecords.reduce((sum, r) => sum + r.hours, 0);
}

function getOverallDelta() {
    return getTotalHours() - MASTER_TARGET_HOURS;
}

function getWeekHours(weekNumber) {
    return dailyRecords
        .filter(r => getWeekNumber(r.date) === weekNumber)
        .reduce((sum, r) => sum + r.hours, 0);
}

function getWeekDateRange(weekNumber) {
    const ref = parseDateKeyGmt8(toGmt8DateKey(OJT_START));
    const start = addDaysGmt8(ref, (weekNumber - 1) * 7);
    const end = addDaysGmt8(start, 6);
    const fmt = d => formatGmt8DateLabel(d, { month: "short", day: "numeric", year: "numeric" });
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

function normalizeForecastLogs(logs = dailyRecords) {
    const normalized = [];
    (logs || []).forEach((r) => {
        const dateKey = toGmt8DateKey(r && r.date);
        if (!dateKey) return;
        normalized.push({ ...r, dateKey, hours: parseFloat(r.hours) || 0 });
    });
    normalized.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return normalized;
}

function calculateForecastUnified({
    logs = dailyRecords,
    paceOverride = null,
    startDate = OJT_START,
    deadlineDate = TARGET_DEADLINE,
    todayOverride = null
} = {}) {
    const normalizedLogs = normalizeForecastLogs(logs);
    const totalActualHours = normalizedLogs.reduce((sum, r) => sum + (r.hours || 0), 0);
    const remainingHours = Math.max(0, MASTER_TARGET_HOURS - totalActualHours);

    const start = parseDateKeyGmt8(toGmt8DateKey(startDate));
    const deadline = parseDateKeyGmt8(toGmt8DateKey(deadlineDate));
    const today = todayOverride ? parseDateKeyGmt8(toGmt8DateKey(todayOverride)) : nowGmt8StartOfDay();

    let idealHoursToDate = 0;
    if (start && today) {
        for (let d = new Date(start.getTime()); d <= today; d = addDaysGmt8(d, 1)) {
            if (isWorkdayGmt8(d)) idealHoursToDate += DAILY_TARGET_HOURS;
        }
    }
    idealHoursToDate = Math.min(MASTER_TARGET_HOURS, idealHoursToDate);
    const currentStatusDelta = totalActualHours - idealHoursToDate;

    let workDaysRemaining = 0;
    if (today && deadline) {
        for (let d = addDaysGmt8(today, 1); d && d <= deadline; d = addDaysGmt8(d, 1)) {
            if (isWorkdayGmt8(d)) workDaysRemaining++;
        }
    }
    const calendarDaysRemaining = today && deadline ? Math.max(0, diffDaysGmt8(today, deadline)) : 0;
    const requiredRate = workDaysRemaining > 0 ? (remainingHours / workDaysRemaining) : 0;

    let paceUsed = 8;
    if (paceOverride !== null && !Number.isNaN(parseFloat(paceOverride))) {
        paceUsed = Math.max(0.1, parseFloat(paceOverride));
    } else {
        const recentLogs = normalizedLogs.slice(-7);
        const recentAvg = recentLogs.length > 0
            ? recentLogs.reduce((s, r) => s + (r.hours || 0), 0) / recentLogs.length
            : 8;
        paceUsed = Math.max(0.1, recentAvg);
    }

    let projectedDate = today ? new Date(today.getTime()) : parseDateKeyGmt8(toGmt8DateKey(new Date()));
    let projHoursAccum = totalActualHours;
    let safety = 0;
    while (remainingHours > 0 && projHoursAccum < MASTER_TARGET_HOURS && safety < 5000) {
        safety++;
        projectedDate = addDaysGmt8(projectedDate, 1);
        if (isWorkdayGmt8(projectedDate)) projHoursAccum += paceUsed;
    }

    const projectedDateKey = toGmt8DateKey(projectedDate);
    const projectedDateLabel = formatGmt8DateLabel(projectedDate, { month: "short", day: "numeric", year: "numeric" });
    const isAhead = totalActualHours >= idealHoursToDate;

    return {
        totalActualHours,
        remainingHours,
        workDaysRemaining,
        calendarDaysRemaining,
        requiredRate,
        paceUsed,
        idealHoursToDate,
        currentStatusDelta,
        isAhead,
        projectedDateKey,
        projectedDateLabel,
        projectedDate,
        recentAvg: paceUsed,
        daysRemaining: calendarDaysRemaining,
        workDaysUntilDeadline: workDaysRemaining
    };
}

function buildTrajectorySeries({ logs = dailyRecords, paceOverride = null, startDate = OJT_START, deadlineDate = TARGET_DEADLINE } = {}) {
    const normalizedLogs = normalizeForecastLogs(logs);
    const forecast = calculateForecastUnified({ logs: normalizedLogs, paceOverride, startDate, deadlineDate });
    const start = parseDateKeyGmt8(toGmt8DateKey(startDate));
    const deadline = parseDateKeyGmt8(toGmt8DateKey(deadlineDate));
    const today = nowGmt8StartOfDay();
    const lastLogKey = normalizedLogs.length ? normalizedLogs[normalizedLogs.length - 1].dateKey : null;
    const lastLogDate = lastLogKey ? parseDateKeyGmt8(lastLogKey) : null;
    const projectionStartDate = lastLogDate && lastLogDate > today ? lastLogDate : today;

    const logMap = {};
    normalizedLogs.forEach((l) => { logMap[l.dateKey] = l.hours; });

    const labels = [];
    const labelDateKeys = [];
    const actualCumulative = [];
    const projectedCumulative = [];
    const idealCumulative = [];

    let currentSum = 0;
    let projSum = 0;
    let idealSum = 0;

    for (let d = new Date(start.getTime()); d <= deadline; d = addDaysGmt8(d, 1)) {
        const dateKey = toGmt8DateKey(d);
        labelDateKeys.push(dateKey);
        labels.push(formatGmt8DateLabel(d, { month: "short", day: "numeric" }));

        const dayHours = logMap[dateKey];
        if (dayHours !== undefined) currentSum += dayHours;

        if (d <= projectionStartDate) {
            actualCumulative.push(currentSum);
            if (!lastLogDate || d <= lastLogDate) projSum = currentSum;
            projectedCumulative.push(null);
        } else {
            actualCumulative.push(null);
            if (isWorkdayGmt8(d)) projSum += forecast.paceUsed;
            projectedCumulative.push(Math.round(projSum));
        }

        if (isWorkdayGmt8(d)) idealSum += DAILY_TARGET_HOURS;
        idealCumulative.push(Math.min(MASTER_TARGET_HOURS, idealSum));
    }

    return {
        labels,
        labelDateKeys,
        actualCumulative,
        projectedCumulative,
        idealCumulative,
        forecast
    };
}

function calculateForecast(logs = dailyRecords, overridePace = null) {
    return calculateForecastUnified({ logs, paceOverride: overridePace });
}
