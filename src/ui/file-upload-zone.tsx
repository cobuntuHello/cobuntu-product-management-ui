"use client";

import * as React from "react";
import { Upload, X, FileText, FileImage, FileVideo, FileArchive, FileCode, FileMusic } from "lucide-react";
import { cn } from "./utils";

export interface UploadedFile {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  url?: string;
  isExisting?: boolean;
}

interface FileUploadZoneProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return { Icon: FileImage, cls: "text-blue-500" };
  if (type.startsWith("video/")) return { Icon: FileVideo, cls: "text-purple-500" };
  if (type.startsWith("audio/")) return { Icon: FileMusic, cls: "text-pink-500" };
  if (type === "application/pdf") return { Icon: FileText, cls: "text-red-500" };
  if (type.includes("zip") || type.includes("rar") || type.includes("7z") || type.includes("archive"))
    return { Icon: FileArchive, cls: "text-amber-500" };
  if (type.includes("javascript") || type.includes("typescript") || type.includes("json") || type.includes("html") || type.includes("css") || type.includes("python"))
    return { Icon: FileCode, cls: "text-emerald-500" };
  return { Icon: FileText, cls: "text-zinc-500" };
}

function getFileExtension(name: string): string {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext || "FILE";
}

export function FileUploadZone({ files, onChange, maxFiles = 10 }: FileUploadZoneProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  function addFiles(fileList: FileList | File[]) {
    const remaining = maxFiles - files.length;
    const toAdd = Array.from(fileList).slice(0, remaining);
    const newFiles: UploadedFile[] = toAdd.map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    }));
    onChange([...files, ...newFiles]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (files.length >= maxFiles) return;
    addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemove(id: string) {
    onChange(files.filter(f => f.id !== id));
  }

  return (
    <div className="space-y-2">
      {files.length < maxFiles && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors cursor-pointer",
            isDragOver ? "border-zinc-400 bg-zinc-100" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
          )}
        >
          <Upload className="h-5 w-5 text-zinc-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-600">Drop files here or click to browse</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Up to {maxFiles} files. PDF, images, videos, documents, and more.</p>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />

      {files.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
          {files.map(file => {
            const { Icon, cls } = getFileIcon(file.type);
            return (
              <div key={file.id} className="flex items-center gap-3 px-3 py-2.5 group">
                <div className={cn("flex-shrink-0 h-8 w-8 rounded-md flex items-center justify-center bg-zinc-50", cls)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-800 truncate">{file.name}</p>
                  <p className="text-[11px] text-zinc-400">{getFileExtension(file.name)} &middot; {formatFileSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => handleRemove(file.id)}
                  className="flex-shrink-0 p-1 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {files.length > 0 && (
        <p className="text-[11px] text-zinc-400">{files.length}/{maxFiles} files. These will be available for download after purchase.</p>
      )}
    </div>
  );
}
