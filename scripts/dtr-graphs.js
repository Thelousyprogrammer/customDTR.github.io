/**
 * DTR GRAPHS MODULE
 * Handles the rendering of GitHub-style contribution graphs
 */

function renderDailyGraph(records = dailyRecords) {
    const container = document.getElementById("githubGraph");
    const labelsContainer = document.getElementById("monthLabels");
    if (!container) return;

    container.innerHTML = "";
    if (labelsContainer) labelsContainer.innerHTML = "";

    if (!records || records.length === 0) {
        container.innerHTML = "<p class='empty-msg'>No records to visualize.</p>";
        return;
    }

    // Helper to get YYYY-MM-DD in local time (preventing ISO timezone shift bug)
    const toPSTISO = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // Calculate Dynamic Range based strictly on provided records
    const dates = records.map(r => new Date(r.date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates, new Date()));
    
    // Align Start to Sunday
    const start = new Date(minDate);
    start.setDate(start.getDate() - start.getDay());

    // Align End to Saturday of the max week
    const end = new Date(maxDate);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const logMap = {};
    records.forEach(r => logMap[r.date] = r);

    const usedMonthNames = new Set();
    let lastCol = -10; 
    let daysIdx = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const colIndex = Math.floor(daysIdx / 7) + 1;
        const dateStr = toPSTISO(d);
        const record = logMap[dateStr];
        const recordHours = record ? record.hours : 0;
        
        const cell = document.createElement("div");
        cell.className = "day-cell";
        if (record) cell.style.cursor = "pointer";
        
        let level = 0;
        if (recordHours >= 9) level = 3;
        else if (recordHours >= 5) level = 2;
        else if (recordHours > 3) level = 1;

        cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
        
        // TOOLTIP
        const formattedDate = d.toLocaleDateString('en-PH', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        cell.title = `${formattedDate}: ${recordHours}h ${record ? '(Click to view)' : ''}`;

        // CLICKABLE INFO
        cell.onclick = () => {
            if (record) {
                showSummary(record);
                document.getElementById("summary").scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        container.appendChild(cell);

        // Align label to the column where the 1st of the month falls
        if (d.getDate() === 1) {
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

function renderWeeklyGraph(records = dailyRecords) {
    const container = document.getElementById("weeklyGraph");
    if (!container) return;
    container.innerHTML = "";

    const weeklyData = {};
    records.forEach(r => {
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
            if (hours >= 40) level = 3;
            else if (hours >= 20) level = 2;
            else if (hours > 0) level = 1;
            
            cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
            cell.title = `Weekly Total: ${hours}h`;
            cellsWrapper.appendChild(cell);
        });

        monthBlock.appendChild(cellsWrapper);
        container.appendChild(monthBlock);
    });
}
