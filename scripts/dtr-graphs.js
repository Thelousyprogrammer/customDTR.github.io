/**
 * DTR GRAPHS MODULE
 * Handles the rendering of GitHub-style contribution graphs
 */

function renderDailyGraph() {
    const container = document.getElementById("githubGraph");
    const labelsContainer = document.getElementById("monthLabels");
    if (!container) return;

    container.innerHTML = "";
    if (labelsContainer) labelsContainer.innerHTML = "";

    // FIXED RANGE: January 2026 up to May 2026
    const start = new Date(2026, 0, 1); // Jan 1, 2026
    const end = new Date(2026, 4, 31);   // May 31, 2026
    
    // Start on Sunday to align grid columns
    const firstDay = new Date(start);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());

    const logMap = {};
    dailyRecords.forEach(r => logMap[r.date] = r.hours);

    const usedMonthNames = new Set();
    let lastCol = -10; 
    let daysIdx = 0;

    for (let d = new Date(firstDay); d <= end; d.setDate(d.getDate() + 1)) {
        const colIndex = Math.floor(daysIdx / 7) + 1;
        const dateStr = d.toISOString().split('T')[0];
        const recordHours = logMap[dateStr] || 0;
        
        const cell = document.createElement("div");
        cell.className = "day-cell";
        
        let level = 0;
        if (recordHours >= 10) level = 3;
        else if (recordHours >= 8) level = 2;
        else if (recordHours > 0) level = 1;

        cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
        
        // TOOLTIP (REQUIRED)
        const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        cell.title = `${formattedDate}: ${recordHours}h`;

        container.appendChild(cell);

        // Align label to the column where the 1st of the month falls
        if (d.getDate() === 1 && d.getFullYear() === 2026) {
            const monthName = d.toLocaleString('default', { month: 'short' });
            
            if (!usedMonthNames.has(monthName) && (colIndex - lastCol) > 2) {
                usedMonthNames.add(monthName);
                lastCol = colIndex;
                if (labelsContainer) {
                    const monthSpan = document.createElement("span");
                    monthSpan.innerText = monthName;
                    monthSpan.style.gridColumnStart = colIndex;
                    labelsContainer.appendChild(monthSpan);
                }
            }
        }
        daysIdx++;
    }
}

function renderWeeklyGraph() {
    const container = document.getElementById("weeklyGraph");
    if (!container) return;
    container.innerHTML = "";

    const weeklyData = {};
    dailyRecords.forEach(r => {
        const d = new Date(r.date);
        const month = d.toLocaleString('default', { month: 'short' });
        const year = d.getFullYear();
        const key = `${month} ${year}`;
        const week = getWeekNumber(d);

        if (!weeklyData[key]) weeklyData[key] = {};
        weeklyData[key][week] = (weeklyData[key][week] || 0) + r.hours;
    });

    const months = Object.keys(weeklyData);
    months.forEach(mKey => {
        const monthBlock = document.createElement("div");
        monthBlock.className = "month-block";

        const nameLabel = document.createElement("div");
        nameLabel.className = "month-name";
        nameLabel.innerText = mKey;
        monthBlock.appendChild(nameLabel);

        const cellsWrapper = document.createElement("div");
        cellsWrapper.className = "week-cells";

        const weeks = weeklyData[mKey];
        Object.values(weeks).forEach(hours => {
            const cell = document.createElement("div");
            cell.className = "day-cell";
            
            let level = 0;
            if (hours >= 50) level = 3;
            else if (hours >= 40) level = 2;
            else if (hours > 0) level = 1;
            
            cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
            cell.title = `Weekly Total: ${hours}h`;
            cellsWrapper.appendChild(cell);
        });

        monthBlock.appendChild(cellsWrapper);
        container.appendChild(monthBlock);
    });
}
