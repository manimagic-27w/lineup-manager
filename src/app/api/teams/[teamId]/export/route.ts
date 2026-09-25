import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { requireTeamAccess } from "@/lib/auth";
import { loadTeamExport, toCsv } from "@/lib/export-data";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { team, userId } = await requireTeamAccess(teamId);
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const data = await loadTeamExport(teamId);
  const safeName = team.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  await logActivity({ teamId, actorUserId: userId, action: "data_exported", details: format });

  if (format === "csv") {
    const csv = toCsv(
      data.roster.map((p) => ({
        name: p.name,
        number: p.number ?? "",
        position: p.position ?? "",
        grade: p.grade ?? "",
        experience: p.experience ?? "",
        archived: p.archivedAt ? "yes" : "no",
      }))
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-roster.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lineup Manager";
  workbook.created = new Date();

  const rosterSheet = workbook.addWorksheet("Roster");
  rosterSheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Number", key: "number", width: 10 },
    { header: "Position", key: "position", width: 12 },
    { header: "Grade", key: "grade", width: 10 },
    { header: "Experience", key: "experience", width: 16 },
    { header: "Archived", key: "archived", width: 10 },
  ];
  for (const p of data.roster) {
    rosterSheet.addRow({
      name: p.name,
      number: p.number ?? "",
      position: p.position ?? "",
      grade: p.grade ?? "",
      experience: p.experience ?? "",
      archived: p.archivedAt ? "Yes" : "No",
    });
  }

  const gamesSheet = workbook.addWorksheet("Games");
  gamesSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Opponent", key: "opponent", width: 24 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const g of data.games) {
    gamesSheet.addRow({ date: g.date, opponent: g.opponent ?? "", notes: g.notes });
  }

  const availSheet = workbook.addWorksheet("Availability");
  availSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Opponent", key: "opponent", width: 24 },
    { header: "Player", key: "player", width: 24 },
    { header: "Status", key: "status", width: 16 },
  ];
  for (const a of data.availability) {
    if (!a.game || !a.player) continue;
    availSheet.addRow({ date: a.game.date, opponent: a.game.opponent ?? "", player: a.player.name, status: a.status });
  }

  const lineupSheet = workbook.addWorksheet("Lineup");
  lineupSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Opponent", key: "opponent", width: 24 },
    { header: "Slot", key: "slot", width: 18 },
    { header: "Player", key: "player", width: 24 },
  ];
  for (const l of data.lineup) {
    if (!l.game || !l.player) continue;
    lineupSheet.addRow({ date: l.game.date, opponent: l.game.opponent ?? "", slot: l.slot, player: l.player.name });
  }

  const statsSheet = workbook.addWorksheet("Stats");
  statsSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Opponent", key: "opponent", width: 24 },
    { header: "Player", key: "player", width: 24 },
    { header: "Category", key: "category", width: 20 },
    { header: "Value", key: "value", width: 10 },
  ];
  for (const s of data.stats) {
    if (!s.game || !s.player || !s.category) continue;
    statsSheet.addRow({
      date: s.game.date,
      opponent: s.game.opponent ?? "",
      player: s.player.name,
      category: s.category.label,
      value: s.value,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-export.xlsx"`,
    },
  });
}
