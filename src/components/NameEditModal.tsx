"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";

interface Props {
  currentName: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function NameEditModal({ currentName, onSave, onClose }: Props) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(name);
      onClose();
    } catch { /* parent owns the toast — swallow here so the modal stays open if save fails */ }
    finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-4">Edit Name</h3>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 mb-4"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}
