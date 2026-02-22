/**
 * DTR EXPORTS MODULE
 * Handles PDF generation and export-related UI logic
 */

function updateExportWeekOptions() {
    const select = document.getElementById("exportWeekSelect");
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="all">All Weeks</option>';
    const weeks = [...new Set(dailyRecords.map(r => getWeekNumber(new Date(r.date))))].sort((a, b) => b - a);

    weeks.forEach(w => {
        const range = getWeekDateRange(w);
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = `Week ${w}`;
        opt.title = `${range.start} – ${range.end}`;
        select.appendChild(opt);
    });

    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }
    updateExportWeekRangeLabel();
}

function updateExportWeekRangeLabel() {
    const select = document.getElementById("exportWeekSelect");
    const label = document.getElementById("exportWeekRangeLabel");
    if (!select || !label) return;
    const val = select.value;
    if (val === "all") {
        label.textContent = "";
        return;
    }
    const range = getWeekDateRange(parseInt(val, 10));
    const short = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    label.textContent = `${short(range.startDate)} – ${short(range.endDate)}`;
}

function getWeeklyDTR(filterWeek = "all") {
    const weeks = {};
    dailyRecords.forEach(r => {
        const week = getWeekNumber(new Date(r.date));
        if (filterWeek !== "all" && week != filterWeek) return;

        if (!weeks[week]) {
            weeks[week] = {
                week, totalHours: 0, personalHours: 0, sleepHours: 0, recoveryHours: 0,
                accomplishments: [], tools: new Set()
            };
        }
        weeks[week].totalHours += r.hours;
        weeks[week].personalHours += parseFloat(r.personalHours) || 0;
        weeks[week].sleepHours += parseFloat(r.sleepHours) || 0;
        weeks[week].recoveryHours += parseFloat(r.recoveryHours) || 0;
        if (Array.isArray(r.accomplishments)) {
            r.accomplishments.forEach(a => weeks[week].accomplishments.push({ date: r.date, text: a }));
        }
        if (Array.isArray(r.tools)) {
            r.tools.forEach(t => weeks[week].tools.add(t));
        }
    });
    return Object.values(weeks).map(w => ({ ...w, tools: [...w.tools] }));
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    doc.setFontSize(16);
    doc.setTextColor(255, 30, 0); 
    doc.text("Daily DTR Report", 105, y, { align: "center" });
    y += 10;
    doc.setTextColor(0, 0, 0);

    dailyRecords.forEach(r => {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Date: ${r.date} | Hours: ${r.hours} | Delta: ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`, 10, y); 
        y += 6;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text("Reflection:", 10, y); y += 5;
        const lines = doc.splitTextToSize(r.reflection || "-", 180);
        lines.forEach(line => { doc.text(line, 12, y); y += 5; });

        if (Array.isArray(r.accomplishments) && r.accomplishments.length) {
            doc.text("Accomplishments:", 10, y); y += 5;
            r.accomplishments.forEach(a => { doc.text("• " + a, 14, y); y += 5; });
        }
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const tel = `L2: P.Hours: ${r.personalHours} | Sleep: ${r.sleepHours} | Rec: ${r.recoveryHours} | Align: ${r.identityScore}`;
        doc.text(tel, 10, y); y += 10;
        doc.setTextColor(0,0,0);
        if (y > 260) { doc.addPage(); y = 15; }
    });
    doc.save(getTodayFileName("Daily_DTR_Report", "pdf"));
}

function exportWeeklyPDF() {
    if (!dailyRecords.length) return alert("No records to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    const filterWeek = document.getElementById("exportWeekSelect").value;
    doc.setFontSize(16); doc.setTextColor(255, 30, 0);
    doc.text("Weekly DTR Report", 105, y, { align: "center" }); y += 20;

    const weeks = getWeeklyDTR(filterWeek);
    weeks.forEach(w => {
        doc.setFontSize(12); doc.setFont(undefined, 'bold');
        doc.text(`Week ${w.week} Summary`, 10, y); y += 6;
        doc.setFont(undefined, 'normal'); doc.setFontSize(11);
        doc.text(`Total OJT Hours: ${w.totalHours.toFixed(1)}`, 10, y); y += 6;
        w.accomplishments.forEach(a => {
            doc.splitTextToSize(`• [${a.date}] ${a.text}`, 180).forEach(line => { doc.text(line, 14, y); y += 5; });
        });
        y += 10;
        if (y > 260) { doc.addPage(); y = 15; }
    });
    doc.save(getTodayFileName("WeeklyReport", "pdf"));
}
