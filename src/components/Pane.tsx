import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import type { PaneState, FileEntry, ContextMenuTarget, PaneHandle } from "../types";
import { Breadcrumb } from "./Breadcrumb";
import { FileList } from "./FileList";

interface PaneProps {
  paneIdx: number;
  state: PaneState;
  isActive: boolean;
  onNavigate: (path: string) => void;
  onExpand: (name: string) => void;
  onSelect: (path: string | null) => void;
  onContextMenu: (target: Omit<ContextMenuTarget, "pane">) => void;
  onCreateItem: (name: string, isDir: boolean) => void;
  onRenameItem: (oldPath: string, newName: string) => void;
  onNavUp: () => void;
  onNavInto: () => void;
  onNavBack: () => void;
  onNavForward: () => void;
  onSort: (sortBy: string) => void;
}

export const Pane = forwardRef<PaneHandle, PaneProps>(function Pane({
  paneIdx,
  state,
  isActive,
  onNavigate,
  onExpand,
  onSelect,
  onContextMenu,
  onCreateItem,
  onRenameItem,
  onNavUp,
  onNavInto,
  onNavBack,
  onNavForward,
  onSort,
}, ref) {
  const [inlineMode, setInlineMode] = useState<"file" | "folder" | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const statusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalItems = countAll(state.entries);

  const flashStatus = useCallback((msg: string, isError?: boolean) => {
    setStatusMsg(isError ? `⚠ ${msg}` : msg);
    if (statusTimeout.current) clearTimeout(statusTimeout.current);
    statusTimeout.current = setTimeout(() => setStatusMsg(""), 3000);
  }, []);

  // Expose imperative methods to parent (for context menu actions)
  useImperativeHandle(ref, () => ({
    startInlineCreate(type: "file" | "folder") {
      setInlineMode(type);
      setInlineName("");
    },
    startRename(entryPath: string) {
      setRenamingPath(entryPath);
      // Find the entry name to pre-fill
      const entry = state.entries.find((e) => e.path === entryPath);
      setRenamingName(entry?.name || "");
    },
    showStatus(msg: string, isError?: boolean) {
      flashStatus(msg, isError);
    },
  }), [flashStatus, state.entries]);

  const handleCreateSubmit = useCallback(() => {
    const name = inlineName.trim();
    if (name) {
      onCreateItem(name, inlineMode === "folder");
      flashStatus(
        `Created ${inlineMode === "folder" ? "folder" : "file"}: "${name}"`
      );
    }
    setInlineMode(null);
    setInlineName("");
  }, [inlineName, inlineMode, onCreateItem, flashStatus]);

  const handleRenameSubmit = useCallback(
    (oldPath: string) => {
      const newName = renamingName.trim();
      if (newName) {
        onRenameItem(oldPath, newName);
        flashStatus(`Renamed to "${newName}"`);
      }
      setRenamingPath(null);
      setRenamingName("");
    },
    [renamingName, onRenameItem, flashStatus]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setInlineMode(null);
        setInlineName("");
        setRenamingPath(null);
        setRenamingName("");
        onContextMenu({ entry: null, x: 0, y: 0 }); // close context menu
      }
      if (e.key === "Backspace" && state.selected && !renamingPath && !inlineMode) {
        e.preventDefault();
        onContextMenu({
          entry: state.entries.find((f) => f.path === state.selected) || null,
          x: 0,
          y: 0,
        });
        // Delete is handled via context menu action
      }
      if (e.key === "Enter" && state.selected && !renamingPath && !inlineMode) {
        e.preventDefault();
        const entry = state.entries.find((f) => f.path === state.selected);
        if (entry) {
          setRenamingPath(entry.path);
          setRenamingName(entry.name);
        }
      }
    },
    [state.selected, renamingPath, inlineMode, onContextMenu, state.entries]
  );

  const handleDblClick = useCallback(
    (entry: FileEntry) => {
      console.log("[Pane] double-click:", entry.name, "is_dir:", entry.is_dir, "path:", entry.path);
      if (entry.is_dir) {
        console.log("[Pane] navigating to:", entry.path);
        onNavigate(entry.path);
      } else {
        console.log("[Pane] opening file:", entry.name);
        flashStatus(`Opening "${entry.name}" in system default app…`);
      }
    },
    [onNavigate, flashStatus]
  );

  return (
    <div
      className={`border-2 transition-colors ${
        isActive ? "border-[var(--border-active)] z-10" : "border-[var(--border)]"
      }`}
      style={{
        background: "var(--bg-root)",
        display: "grid",
        gridTemplateRows: "30px 1fr 22px",
        overflow: "hidden",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center h-[30px] px-2 bg-[var(--bg-surface)] border-b border-[var(--border)] gap-1 flex-shrink-0">
        <span
          className={`font-mono text-[10px] rounded-sm px-[6px] py-px flex-shrink-0 mr-1 ${
            isActive
              ? "text-[var(--accent)] border-[var(--accent-dim)] bg-[var(--bg-input)]"
              : "text-[var(--text-tertiary)] bg-[var(--bg-input)]"
          }`}
        >
          ⌘{paneIdx + 1}
        </span>
        {/* Nav buttons */}
        <button className="nav-btn" title="Back" onClick={(e) => { e.stopPropagation(); onNavBack(); }}>←</button>
        <button className="nav-btn" title="Forward" onClick={(e) => { e.stopPropagation(); onNavForward(); }}>→</button>
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        <button className="nav-btn" title="Up to parent" onClick={(e) => { e.stopPropagation(); onNavUp(); }}>↑</button>
        <button className="nav-btn" title="Into selected folder" onClick={(e) => { e.stopPropagation(); onNavInto(); }}>↓</button>
        <span className="w-px h-4 bg-[var(--border)] mx-0.5" />
        <Breadcrumb path={state.path} onNavigate={onNavigate} />
        <div className="flex gap-0.5 flex-shrink-0 ml-auto">
          <button className="nav-btn" title="New File" onClick={(e) => { e.stopPropagation(); setInlineMode("file"); setInlineName(""); }}>📄+</button>
          <button className="nav-btn" title="New Folder" onClick={(e) => { e.stopPropagation(); setInlineMode("folder"); setInlineName(""); }}>📁+</button>
        </div>
      </div>

      {/* File List */}
      <FileList
        entries={state.entries}
        expanded={state.expanded}
        selected={state.selected}
        renamingPath={renamingPath}
        renamingName={renamingName}
        sortBy={state.sort}
        sortAsc={state.ascending}
        onExpand={onExpand}
        onSelect={(path) => onSelect(path)}
        onContextMenu={(entry, x, y) => onContextMenu({ entry, x, y })}
        onDoubleClick={handleDblClick}
        onRenamingNameChange={setRenamingName}
        onRenameSubmit={handleRenameSubmit}
        onSort={onSort}
        inlineMode={inlineMode}
        inlineName={inlineName}
        onInlineNameChange={setInlineName}
        onInlineSubmit={handleCreateSubmit}
      />

      {/* Status Bar */}
      <div className="flex items-center h-[22px] px-2.5 text-[11px] bg-[var(--bg-surface)] border-t border-[var(--border)] gap-2 flex-shrink-0">
        {state.error ? (
          <span style={{ color: "var(--danger)" }}>Error: {state.error}</span>
        ) : statusMsg ? (
          <span style={{ color: "var(--accent)" }}>{statusMsg}</span>
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""} · {state.path}
          </span>
        )}
      </div>
    </div>
  );
});

function countAll(entries: FileEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    count++;
    if (entry.children) count += countAll(entry.children);
  }
  return count;
}
