"use client";

import { useState } from "react";
import { ModalShell } from "../ui/modal-shell";

interface Props {
  productId: string;
  communityTag: string;
  productName: string;
  onClose: () => void;
}

export function ShareModal({ productId, communityTag, productName, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `https://${communityTag}.cobuntu.com/marketplace/${productId}`;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`Check out ${productName}`);
  const encodedSubject = encodeURIComponent(productName);
  const encodedBody = encodeURIComponent(`Check out ${productName}: ${url}`);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard can fail in insecure contexts */ }
  }

  const socials = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, color: "bg-blue-50 text-blue-600 hover:bg-blue-100", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    { label: "Twitter / X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`, color: "bg-zinc-50 text-zinc-800 hover:bg-zinc-100", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, color: "bg-sky-50 text-sky-600 hover:bg-sky-100", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { label: "Email", href: `mailto:?subject=${encodedSubject}&body=${encodedBody}`, color: "bg-amber-50 text-amber-600 hover:bg-amber-100", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> },
  ];

  return (
    <ModalShell onClose={onClose} width="w-[480px]">
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Share Product</h3>
      <p className="text-[13px] text-zinc-500 mb-5">Share &ldquo;{productName}&rdquo; with your audience.</p>

      <div className="flex gap-2 mb-5">
        <input
          readOnly
          value={url}
          className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-zinc-50 text-zinc-600 focus:outline-none"
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 cursor-pointer shrink-0"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {socials.map(s => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-[13px] font-medium transition-colors ${s.color}`}
          >
            {s.icon}
            {s.label}
          </a>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">Close</button>
      </div>
    </ModalShell>
  );
}
