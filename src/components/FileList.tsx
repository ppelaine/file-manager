import { useRef, useEffect } from "react";
import type { FileEntry, FileKind } from "../types";

interface FileListProps {
  entries: FileEntry[];
  expanded: Set<string>;
  selected: string | null;
  renamingPath: string | null;
  renamingName: string;
  sortBy: string;
  sortAsc: boolean;
  onExpand: (name: string) => void;
  onSelect: (path: string | null) => void;
  onContextMenu: (entry: FileEntry, x: number, y: number) => void;
  onDoubleClick: (entry: FileEntry) => void;
  onRenamingNameChange: (name: string) => void;
  onRenameSubmit: (oldPath: string) => void;
  onSort: (sortBy: string) => void;
  inlineMode: "file" | "folder" | null;
  inlineName: string;
  onInlineNameChange: (name: string) => void;
  onInlineSubmit: () => void;
}

interface FlatEntry {
  entry: FileEntry;
  depth: number;
}

export function FileList({
  entries,
  expanded,
  selected,
  renamingPath,
  renamingName,
  sortBy,
  sortAsc,
  onExpand,
  onSelect,
  onContextMenu,
  onDoubleClick,
  onRenamingNameChange,
  onRenameSubmit,
  onSort,
  inlineMode,
  inlineName,
  onInlineNameChange,
  onInlineSubmit,
}: FileListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Flatten tree respecting expanded state
  const flat: FlatEntry[] = [];
  function flatten(items: FileEntry[], depth: number) {
    for (const entry of items) {
      flat.push({ entry, depth });
      if (entry.is_dir && entry.children && expanded.has(entry.name)) {
        flatten(entry.children, depth + 1);
      }
    }
  }
  flatten(entries, 0);

  // Focus rename input when active
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  // Focus inline input when active
  useEffect(() => {
    if (inlineMode && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineMode]);

  return (
    <div
      ref={listRef}
      className="flex-1 min-h-0 outline-none"
      tabIndex={0}
      style={{ overflowY: "scroll", overflowX: "hidden", overscrollBehavior: "contain" }}
    >
      {/* Inline creation row */}
      {inlineMode && (
        <div className="flex items-center h-6 px-2 gap-1.5">
          <span className="w-4 flex-shrink-0" />
          <input
            ref={inlineInputRef}
            className="flex-1 h-5 bg-[var(--bg-input)] border border-[var(--accent)] rounded-sm text-[var(--text-primary)] font-[var(--font)] text-xs px-1.5 outline-none"
            placeholder={
              inlineMode === "file" ? "New file name…" : "New folder name…"
            }
            value={inlineName}
            onChange={(e) => onInlineNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInlineSubmit();
              if (e.key === "Escape") onInlineNameChange("");
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center h-6 px-2 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-root)] z-10">
        <span className="w-3 flex-shrink-0" />
        <span className="w-4 flex-shrink-0" />
        <ColumnHeader label="Name" sortKey="name" currentSort={sortBy} asc={sortAsc} onSort={onSort} flex />
        <ColumnHeader label="Size" sortKey="size" currentSort={sortBy} asc={sortAsc} onSort={onSort} className="w-[80px]" />
        <ColumnHeader label="Modified" sortKey="date" currentSort={sortBy} asc={sortAsc} onSort={onSort} className="w-[110px]" />
      </div>

      {/* File rows */}
      {flat.map(({ entry, depth }) => {
        const isSelected = entry.path === selected;
        const isRenaming = entry.path === renamingPath;
        const isOpen = expanded.has(entry.name);

        return (
          <div key={entry.path}>
            <div
              className={`flex items-center gap-1.5 transition-colors ${
                isSelected
                  ? "bg-[var(--selected)]"
                  : "hover:bg-[var(--hover)]"
              }`}
              style={{
                paddingLeft: 8 + depth * 12,
                height: 24,
                cursor: "pointer",
                position: "relative",
                zIndex: 1,
                pointerEvents: "auto",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(entry.path);
                // Manual double-click detection (more reliable than onDoubleClick)
                const now = Date.now();
                const last = (e.currentTarget as HTMLElement).dataset.lastClick;
                if (last && now - parseInt(last) < 400) {
                  console.log("[FileList] double-click detected:", entry.name);
                  onDoubleClick(entry);
                }
                (e.currentTarget as HTMLElement).dataset.lastClick = String(now);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(entry.path);
                onContextMenu(entry, e.clientX, e.clientY);
              }}
            >
              {/* Chevron */}
              <span
                className={`w-3 flex-shrink-0 text-[8px] text-[var(--text-tertiary)] transition-transform cursor-pointer ${
                  isOpen ? "rotate-90" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (entry.is_dir) onExpand(entry.name);
                }}
              >
                {entry.is_dir ? "▸" : ""}
              </span>

              {/* Icon */}
              <span
                className={`w-4 text-center flex-shrink-0 text-[13px] leading-none ${getIconClass(entry)}`}
              >
                {getIcon(entry, isOpen)}
              </span>

              {/* Name */}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="flex-1 h-5 bg-[var(--bg-input)] border border-[var(--accent)] rounded-sm text-[var(--text-primary)] font-[var(--font)] text-xs px-1.5 outline-none z-10"
                  value={renamingName}
                  onChange={(e) => onRenamingNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRenameSubmit(entry.path);
                    if (e.key === "Escape") onRenameSubmit(entry.path);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={`text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 ${
                    isSelected
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {entry.name}
                </span>
              )}

              {/* Size + Date metadata */}
              {!entry.is_dir && (
                <>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-mono whitespace-nowrap flex-shrink-0 w-[80px] text-right">
                    {formatSize(entry.size)}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-mono whitespace-nowrap flex-shrink-0 w-[110px]">
                    {entry.modified || "—"}
                  </span>
                </>
              )}
              {entry.is_dir && (
                <>
                  <span className="w-[80px] flex-shrink-0" />
                  <span className="w-[110px] flex-shrink-0" />
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {flat.length === 0 && !inlineMode && (
        <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] gap-1.5 text-xs">
          <span className="text-[28px] opacity-30">📂</span>
          <span>Empty folder</span>
        </div>
      )}
    </div>
  );
}

function getIcon(entry: FileEntry, isOpen: boolean): string {
  if (entry.is_dir) return isOpen ? "📂" : "📁";
  const kind = entry.kind || detectKind(entry.name);
  const map: Record<FileKind, string> = {
    code: "📄",
    image: "🖼",
    doc: "📋",
    generic: "📄",
  };
  return map[kind] || "📄";
}

function getIconClass(entry: FileEntry): string {
  if (entry.is_dir) return "text-[var(--folder)] text-sm";
  const kind = entry.kind || detectKind(entry.name);
  const map: Record<FileKind, string> = {
    code: "text-[var(--file-code)]",
    image: "text-[var(--file-image)]",
    doc: "text-[var(--file-doc)]",
    generic: "text-[var(--file-generic)]",
  };
  return map[kind] || "text-[var(--file-generic)]";
}

export function detectKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const codeExts = new Set([
    "ts", "tsx", "js", "jsx", "json", "css", "html", "rs", "py", "rb",
    "go", "java", "c", "h", "cpp", "hpp", "swift", "kt", "yaml", "yml",
    "toml", "xml", "sh", "bash", "zsh", "fish", "sql", "graphql", "vue",
    "svelte", "astro", "mdx", "cjs", "mjs",
  ]);
  const imageExts = new Set([
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "avif",
  ]);
  const docExts = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "md", "txt",
    "rtf", "csv", "pages", "numbers", "key",
  ]);

  if (codeExts.has(ext)) return "code";
  if (imageExts.has(ext)) return "image";
  if (docExts.has(ext)) return "doc";
  return "generic";
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ColumnHeader({
  label,
  sortKey,
  currentSort,
  asc,
  onSort,
  flex,
  className,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  asc: boolean;
  onSort: (key: string) => void;
  flex?: boolean;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <span
      className={`text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] select-none flex-shrink-0 ${flex ? "flex-1" : ""} ${className || ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive && (
        <span className="ml-0.5 text-[var(--accent)]">{asc ? "↑" : "↓"}</span>
      )}
    </span>
  );
}
