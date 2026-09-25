"use client";

import { useState } from "react";
import { archivePlayer, unarchivePlayer, updatePlayer } from "@/actions/players";
import { SubmitButton } from "@/components/submit-button";
import { POSITIONS } from "@/lib/db/schema";

type Player = {
  id: string;
  teamId: string;
  name: string;
  number: string | null;
  grade: string | null;
  experience: string | null;
  position: string | null;
  archivedAt: Date | null;
};

export function RosterTable({ players, canEdit }: { players: Player[]; canEdit: boolean }) {
  if (players.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No players yet - add one below.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">#</th>
          <th className="px-4 py-2">Position</th>
          <th className="px-4 py-2">Grade</th>
          <th className="px-4 py-2">Experience</th>
          {canEdit && <th className="px-4 py-2" />}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} canEdit={canEdit} />
        ))}
      </tbody>
    </table>
  );
}

function PlayerRow({ player, canEdit }: { player: Player; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="bg-slate-50">
        <td colSpan={6} className="p-3">
          <form
            action={async (fd) => {
              await updatePlayer(fd);
              setEditing(false);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="playerId" value={player.id} />
            <input type="hidden" name="teamId" value={player.teamId} />
            <Field label="Name" name="name" defaultValue={player.name} required />
            <Field label="#" name="number" defaultValue={player.number ?? ""} className="w-16" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Position</label>
              <select
                name="position"
                defaultValue={player.position ?? ""}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">-</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Grade" name="grade" defaultValue={player.grade ?? ""} className="w-20" />
            <Field label="Experience" name="experience" defaultValue={player.experience ?? ""} className="w-32" />
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={player.archivedAt ? "text-slate-400" : ""}>
      <td className="px-4 py-2 font-medium">{player.name}</td>
      <td className="px-4 py-2">{player.number ?? "-"}</td>
      <td className="px-4 py-2">{player.position ?? "-"}</td>
      <td className="px-4 py-2">{player.grade ?? "-"}</td>
      <td className="px-4 py-2">{player.experience ?? "-"}</td>
      {canEdit && (
        <td className="px-4 py-2 text-right">
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(true)} className="text-xs font-medium text-slate-600 hover:text-slate-900">
              Edit
            </button>
            <form action={player.archivedAt ? unarchivePlayer : archivePlayer}>
              <input type="hidden" name="teamId" value={player.teamId} />
              <input type="hidden" name="playerId" value={player.id} />
              <button type="submit" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                {player.archivedAt ? "Restore" : "Archive"}
              </button>
            </form>
          </div>
        </td>
      )}
    </tr>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );
}
