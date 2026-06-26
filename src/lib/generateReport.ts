import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Issue } from "../types";

async function getAIAnalysis(issues: Issue[]): Promise<string> {
  const summary = {
    total: issues.length,
    resolved: issues.filter(i => i.status === "Resolved").length,
    escalated: issues.filter(i => i.status === "Escalated").length,
    critical: issues.filter(i => i.severity === "CRITICAL").length,
    topCategories: Object.entries(
      issues.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(", "),
    resolutionRate: issues.length ? Math.round((issues.filter(i => i.status === "Resolved").length / issues.length) * 100) : 0,
  };

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: "google/gemma-3n-e4b-it",
        messages: [
          {
            role: "user",
            content: `You are a civic intelligence analyst for an Indian municipal corporation. 
Analyze this civic issue data and write a professional executive summary in 4-5 sentences.

Data:
- Total issues reported: ${summary.total}
- Resolved: ${summary.resolved} (${summary.resolutionRate}% resolution rate)
- Escalated: ${summary.escalated}
- Critical issues: ${summary.critical}
- Top categories: ${summary.topCategories}

Write a concise professional analysis covering: overall civic health, key problem areas, resolution performance, and 1-2 actionable recommendations for the municipal corporation. Keep it factual and data-driven. No bullet points, just flowing paragraphs.`,
          },
        ],
        max_tokens: 300,
        temperature: 0.4,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ||
      `This report covers ${summary.total} civic issues with a ${summary.resolutionRate}% resolution rate. Top categories include ${summary.topCategories}.`;
  } catch {
    return `This report covers ${summary.total} civic issues reported across the city. The current resolution rate stands at ${summary.resolutionRate}%. A total of ${summary.critical} critical issues and ${summary.escalated} escalations have been recorded. The most common issue categories are ${summary.topCategories}. Immediate attention is recommended for unresolved critical issues to improve citizen satisfaction.`;
  }
}

export async function generateReport(issues: Issue[], title: string, subtitle: string) {
  const doc = new jsPDF();
  const now = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // ── HEADER ──
  doc.setFillColor(7, 29, 58);
  doc.rect(0, 0, 210, 45, "F");

  // Logo — white rounded box + logo image on top
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(11, 5, 36, 36, 5, 5, "F");
  try {
    const logoResp = await fetch("/logo.png");
    const logoBlob = await logoResp.blob();
    const logoB64 = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]);
      reader.readAsDataURL(logoBlob);
    });
    // Draw logo centered inside white box with padding
    doc.addImage(logoB64, "PNG", 13, 7, 32, 32);
  } catch {
    // Fallback text
    doc.setTextColor(7, 29, 58);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SW", 22, 27);
  }

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("SunwAI", 53, 19);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Har Samasya Ki Sunwai", 53, 28);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 53, 38);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 220);
  doc.text(`Generated: ${now}`, 196, 38, { align: "right" });

  // ── SUMMARY STATS ──
  const resolved  = issues.filter(i => i.status === "Resolved").length;
  const escalated = issues.filter(i => i.status === "Escalated").length;
  const critical  = issues.filter(i => i.severity === "CRITICAL").length;
  const rate      = issues.length ? Math.round((resolved / issues.length) * 100) : 0;

  // Stat boxes
  const statBoxes = [
    { label: "Total",    value: issues.length, color: [7, 29, 58]    as [number,number,number] },
    { label: "Resolved", value: resolved,       color: [5, 150, 105]  as [number,number,number] },
    { label: "Rate",     value: `${rate}%`,     color: [217, 119, 6]  as [number,number,number] },
    { label: "Critical", value: critical,       color: [190, 18, 60]  as [number,number,number] },
    { label: "Escalated",value: escalated,      color: [220, 38, 38]  as [number,number,number] },
  ];

  const boxW = 34;
  const boxH = 22;
  const startX = 14;
  const startY = 52;

  statBoxes.forEach((box, i) => {
    const x = startX + i * (boxW + 3);
    doc.setFillColor(...box.color);
    doc.roundedRect(x, startY, boxW, boxH, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(String(box.value), x + boxW / 2, startY + 11, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(box.label.toUpperCase(), x + boxW / 2, startY + 18, { align: "center" });
  });

  // ── AI ANALYSIS ──
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("AI Executive Analysis", 14, 86);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.5);
  doc.line(14, 88, 196, 88);

  // Show loading message while AI runs
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 116, 139);
  doc.text("Generating AI analysis...", 14, 94);

  // Get AI analysis
  const aiText = await getAIAnalysis(issues);

  // Replace loading text with actual analysis
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(13, 90, 184, 38, 3, 3, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(13, 90, 184, 38, 3, 3, "S");

  // AI badge
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(16, 93, 20, 6, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("AI ANALYSIS", 17, 97);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const splitText = doc.splitTextToSize(aiText, 175);
  doc.text(splitText.slice(0, 5), 16, 103);

  // ── CATEGORY BREAKDOWN ──
  const catMap: Record<string, number> = {};
  issues.forEach(i => { catMap[i.category] = (catMap[i.category] || 0) + 1; });
  const catData = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => [cat, count, `${Math.round((count / issues.length) * 100)}%`]);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Issues by Category", 14, 138);
  doc.setDrawColor(217, 119, 6);
  doc.line(14, 140, 196, 140);

  autoTable(doc, {
    startY: 143,
    head: [["Category", "Count", "% of Total"]],
    body: catData,
    theme: "striped",
    headStyles: { fillColor: [7, 29, 58], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
    margin: { left: 14, right: 14 },
  });

  // ── STATUS BREAKDOWN ──
  const afterCat = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Issues by Status", 14, afterCat);
  doc.setDrawColor(16, 185, 129);
  doc.line(14, afterCat + 2, 196, afterCat + 2);

  const statusData = (["Reported","Assigned","In Progress","Resolved","Escalated"] as const).map(s => {
    const count = issues.filter(i => i.status === s).length;
    return [s, count, `${issues.length ? Math.round((count / issues.length) * 100) : 0}%`];
  });

  autoTable(doc, {
    startY: afterCat + 5,
    head: [["Status", "Count", "% of Total"]],
    body: statusData,
    theme: "striped",
    headStyles: { fillColor: [7, 29, 58], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
    margin: { left: 14, right: 14 },
  });

  // ── FULL ISSUE LIST ── (new page)
  doc.addPage();

  doc.setFillColor(7, 29, 58);
  doc.rect(0, 0, 210, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Complete Issue List", 14, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${issues.length} total issues · ${now}`, 140, 13);

  const issueRows = issues.map(issue => [
    issue.title?.slice(0, 28) || "N/A",
    issue.category?.slice(0, 16) || "N/A",
    issue.severity || "N/A",
    issue.status || "N/A",
    issue.department?.slice(0, 14) || "N/A",
    issue.reporterName?.slice(0, 12) || "N/A",
    new Date(issue.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  ]);

  const severityColors: Record<string, [number, number, number]> = {
    CRITICAL: [255, 228, 230],
    HIGH:     [255, 237, 213],
    MEDIUM:   [254, 249, 195],
    LOW:      [209, 250, 229],
  };

  autoTable(doc, {
    startY: 25,
    head: [["Title", "Category", "Severity", "Status", "Department", "Reporter", "Date"]],
    body: issueRows,
    theme: "grid",
    headStyles: { fillColor: [7, 29, 58], textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 7, cellPadding: 3 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    didDrawCell: (data: any) => {
      if (data.column.index === 2 && data.section === "body") {
        const sev = data.cell.text[0];
        const color = severityColors[sev];
        if (color) {
          doc.setFillColor(...color);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(7);
          doc.text(sev, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: "center" });
        }
      }
    },
  });

  // ── FOOTER on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 285, 210, 12, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`SunwAI · ${subtitle} · Har Samasya Ki Sunwai`, 14, 292);
    doc.text(`Page ${i} of ${pageCount} · Generated ${now}`, 196, 292, { align: "right" });
  }

  doc.save(`SunwAI_${subtitle.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
}