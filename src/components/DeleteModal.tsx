"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";

import { useProductT } from "../i18n/productCopy";
interface Props {
  productName: string;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function DeleteModal({ productName, onDelete, onClose }: Props) {
  const tp = useProductT("marketplaceUi.productUi");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch { /* parent owns the toast; modal stays open on error */ }
    finally {
      setDeleting(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-2">{tp("deleteModal.deleteProduct")}</h3>
      <p className="text-[13px] text-zinc-500 mb-5">
        {tp("deleteModal.permanentlyDelete", { name: productName })}
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={deleting} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer disabled:opacity-40">{tp("common.cancel")}</button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-4 py-2 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-40"
        >
          {deleting ? tp("common.deleting") : tp("common.delete")}
        </button>
      </div>
    </ModalShell>
  );
}
