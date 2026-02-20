
const MASTER_GOAL = 500;
const OJT_START_DATE = new Date(2026, 0, 26); // Jan 26
const TARGET_DEADLINE = new Date(2026, 3, 25); // April 25

function getWeekNumber(date) {
    const start = new Date(OJT_START_DATE);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

// Mock Data: 
// Week 1: 5 days, 8h each (40h)
// Week 2: 5 days, 4h each (20h)
// Today is in middle of Week 3
const allLogs = [];
for (let i = 0; i < 5; i++) {
    const d = new Date(OJT_START_DATE);
    d.setDate(d.getDate() + i); // Mon-Fri Week 1
    allLogs.push({ date: d.toISOString().split('T')[0], hours: 8, personalHours: 2 });
}
for (let i = 0; i < 5; i++) {
    const d = new Date(OJT_START_DATE);
    d.setDate(d.getDate() + 7 + i); // Mon-Fri Week 2
    allLogs.push({ date: d.toISOString().split('T')[0], hours: 4, personalHours: 1 });
}

// Simulate "Today" as Wednesday of Week 2 for momentum check? 
// No, let's set "Today" to a fixed date to test standard calculations.
// Let's say today is Feb 10 (Week 3)
const today = new Date(2026, 1, 10); 
today.setHours(0,0,0,0);

// --- CALCS ---

const totalActualHours = allLogs.reduce((sum, r) => sum + r.hours, 0);
const remainingHours = Math.max(0, MASTER_GOAL - totalActualHours);
const msPerDay = 24 * 60 * 60 * 1000;
const daysRemaining = Math.max(1, Math.ceil((TARGET_DEADLINE - today) / msPerDay));
const requiredRate = remainingHours / daysRemaining;

// Momentum
const curWeek = getWeekNumber(today);
const weeklyTotals = {};
allLogs.forEach(r => {
    const w = getWeekNumber(new Date(r.date));
    weeklyTotals[w] = (weeklyTotals[w] || 0) + r.hours;
});
const momentum = weeklyTotals[curWeek - 1] > 0 
    ? ((weeklyTotals[curWeek] || 0) - weeklyTotals[curWeek - 1]) / weeklyTotals[curWeek - 1] * 100 
    : 0;

console.log("Total Actual:", totalActualHours); // Should be 60
console.log("Remaining:", remainingHours); // 440
console.log("Days Remaining:", daysRemaining);
console.log("Required Rate:", requiredRate);
console.log("Current Week:", curWeek); // Feb 10, Jan 26 start. 15 days diff. Week 3.
console.log("Weekly Totals:", weeklyTotals);
console.log("Momentum (Week 3 vs 2):", momentum); // Week 3 has 0 hours in mock data. Week 2 has 20. Momentum -100%?

// Check Trajectory Ideal Line logic
// 8h/day everyday vs weekdays
let dayCounter = 0;
let idealTotal = 0;
const start = new Date(OJT_START_DATE);
const end = new Date(TARGET_DEADLINE);
let weekdays = 0;

for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dayCounter++;
    idealTotal += 8;
    if (d.getDay() !== 0 && d.getDay() !== 6) weekdays++;
}
console.log("Trajectory - Calendar Days:", dayCounter);
console.log("Trajectory - Ideal Total (Everyday):", idealTotal);
console.log("Trajectory - Work Days:", weekdays);
console.log("Trajectory - Ideal Total (Workdays):", weekdays * 8);

