"use client";

import { useMemo, useState, useTransition } from "react";
import {
  archivePlayer,
  unarchivePlayer,
  updatePlayer,
  deletePlayer,
  updateRosterExperience,
} from "@/actions/players";
import { SubmitButton } from "@/components/submit-button";
import { EXPERIENCE_LEVELS, POSITIONS } from "@/lib/db/schema";

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
  // Every row's current Experience dropdown value, keyed by player id, so it can be edited in
  // place and saved for the whole roster in one action instead of one player at a time.
  const [experienceDraft, setExperienceDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.experience ?? ""]))
  );
  const [isSaving, startSaving] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const dirtyPlayerIds = useMemo(
    () => players.filter((p) => (experienceDraft[p.id] ?? p.experience ?? "") !== (p.experience ?? "")).map((p) => p.id),
    [players, experienceDraft]
  );

  function setExperience(playerId: string, value: string) {
    setExperienceDraft((prev) => ({ ...prev, [playerId]: value }));
    setJustSaved(false);
  }

  function saveRoster() {
    const teamId = players[0]?.teamId;
    if (!teamId || dirtyPlayerIds.length === 0) return;
    const entries = dirtyPlayerIds.map((playerId) => ({
      playerId,
      experience: experienceDraft[playerId] ?? "",
    }));
    startSaving(async () => {
      await updateRosterExperience(teamId, entries);
      setJustSaved(true);
    });
  }

  if (players.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No players yet - add one below.</p>;
  }

  return (
    <div>
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
            <PlayerRow
              key={p.id}
              player={p}
              canEdit={canEdit}
              experience={experienceDraft[p.id] ?? p.experience ?? ""}
              onExperienceChange={(value) => setExperience(p.id, value)}
            />
          ))}
        </tbody>
      </table>

      {canEdit && (
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            disabled={dirtyPlayerIds.length === 0 || isSaving}
            onClick={saveRoster}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save roster changes"}
          </button>
          <span className="text-xs text-slate-500">
            {isSaving
              ? "Saving…"
              : dirtyPlayerIds.length > 0
                ? `${dirtyPlayerIds.length} player${dirtyPlayerIds.length === 1 ? "" : "s"} changed`
                : justSaved
                  ? "Saved"
                  : "No unsaved changes"}
          </span>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  canEdit,
  experience,
  onExperienceChange,
}: {
  player: Player;
  canEdit: boolean;
  experience: string;
  onExperienceChange: (value: string) => void;
}) {
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
            {/* Experience is edited from the dropdown in the table row itself (and saved via
                "Save roster changes"), not here - carry the current value through unchanged so
                saving name/#/position/grade never touches it. */}
            <input type="hidden" name="experience" value={player.experience ?? ""} />
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

  // A row's stored experience might not be one of EXPERIENCE_LEVELS - older free-text data, or a
  // CSV import - in which case it's pinned in as an extra option so the dropdown shows what's
  // actually saved instead of silently falling back to "New" and overwriting it on next save.
  const options =
    experience && !(EXPERIENCE_LEVELS as readonly string[]).includes(experience)
      ? [experience, ...EXPERIENCE_LEVELS]
      : EXPERIENCE_LEVELS;

  return (
    <tr className={player.archivedAt ? "text-slate-400" : ""}>
      <td className="px-4 py-2 font-medium">{player.name}</td>
      <td className="px-4 py-2">{player.number ?? "-"}</td>
      <td className="px-4 py-2">{player.position ?? "-"}</td>
      <td className="px-4 py-2">{player.grade ?? "-"}</td>
      <td className="px-4 py-2">
        {canEdit ? (
          <select
            value={experience}
            onChange={(e) => onExperienceChange(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">-</option>
            {options.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        ) : (
          (player.experience ?? "-")
        )}
      </td>
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
            <form
              action={async (fd) => {
                if (
                  !window.confirm(
                    `Permanently delete ${player.name}? This can't be undone. If they have any game history, they'll be archived instead of deleted.`
                  )
                ) {
                  return;
                }
                await deletePlayer(fd);
              }}
            >
              <input type="hidden" name="teamId" value={player.teamId} />
              <input type="hidden" name="playerId" value={player.id} />
              <button type="submit" className="text-xs font-medium text-red-600 hover:text-red-800">
                Delete
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
