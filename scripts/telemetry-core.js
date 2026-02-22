/**
 * TELEMETRY CORE MODULE
 * Shared constants and global state
 */

const MASTER_GOAL = 500;
const OJT_START_DATE = new Date(2026, 0, 26); // Jan 26
// TARGET_DEADLINE consolidated in dtr-core.js

// --- GLOBAL STATE ---
let COLORS = {};
let allLogs = [];
let realLogs = []; 
let isSimulating = false;
let charts = {};

// Helper used by both dashboard and simulation
function getWeekNumber(date) {
    const start = new Date(OJT_START_DATE);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = d.getTime() - start.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}
