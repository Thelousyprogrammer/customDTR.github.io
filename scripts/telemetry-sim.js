/**
 * PERFORMANCE SIMULATOR MODULE
 * Handles synthetic data injection and what-if scenarios
 */

function toggleSimulation() {
    isSimulating = !isSimulating;
    const btn = document.getElementById("simToggleBtn");
    const controls = document.getElementById("simControls");
    const resetBtn = document.getElementById("simResetBtn");
    const card = document.querySelector(".sim-card");

    if (isSimulating) {
        btn.innerText = "Exit Sim Mode";
        btn.classList.replace("btn-dim", "btn-accent");
        controls.style.display = "block";
        resetBtn.style.display = "inline-block";
        if (card) card.classList.add("active");
        realLogs = JSON.parse(JSON.stringify(allLogs)); // Snapshot current state
    } else {
        btn.innerText = "Enter Sim Mode";
        btn.classList.replace("btn-accent", "btn-dim");
        controls.style.display = "none";
        resetBtn.style.display = "none";
        if (card) card.classList.remove("active");
        resetTelemetry();
    }
}

function runSimulation() {
    if (!isSimulating) return;

    const simHours = parseFloat(document.getElementById("simHours").value) || 8;
    const simDaysToAdd = parseInt(document.getElementById("simDays").value) || 5;
    
    // Start from the last date in allLogs or TODAY
    let lastDate;
    if (allLogs.length > 0) {
        const sorted = [...allLogs].sort((a,b) => new Date(a.date) - new Date(b.date));
        lastDate = new Date(sorted[sorted.length - 1].date);
    } else {
        lastDate = new Date();
    }

    const newEntries = [];
    for (let i = 1; i <= simDaysToAdd; i++) {
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + i);
        
        const dateStr = nextDate.toISOString().split('T')[0];
        
        newEntries.push({
            date: dateStr,
            hours: simHours,
            personalHours: simHours > 8 ? (simHours - 8) * 0.5 : 0, 
            sleepHours: Math.max(4, 9 - (simHours * 0.3)), 
            identityScore: simHours > 10 ? 2 : (simHours >= 8 ? 4 : 5), 
            accomplishments: ["Simulated Entry"],
            commuteTotal: 1.5,
            commuteProductive: 1.0
        });
    }

    allLogs = [...allLogs, ...newEntries];
    
    // Re-render EVERYTHING
    renderTelemetry(allLogs);
    
    // Add visual feedback
    const note = document.querySelector(".sim-note");
    if (note) {
        note.innerText = `Simulated: Added ${simDaysToAdd} days @ ${simHours}h/day. Cumulative: ${allLogs.reduce((s,l)=>s+l.hours,0).toFixed(1)}h`;
        note.style.color = COLORS.excellent;
    }
}

function resetTelemetry() {
    allLogs = JSON.parse(JSON.stringify(realLogs));
    renderTelemetry(allLogs);
    
    const note = document.querySelector(".sim-note");
    if (note) {
        note.innerText = "Note: Simulated data is temporary and won't affect your real DTR records unless synced.";
        note.style.color = "";
    }
}
