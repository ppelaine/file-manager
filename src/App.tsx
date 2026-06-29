import { useState, useCallback, useEffect, useRef } from "react";
import type { PaneState, ContextMenuTarget, FileClipboard, PaneHandle } from "./types";
import { Pane } from "./components/Pane";
import { ContextMenu } from "./components/ContextMenu";

// Tauri invoke helper — falls back to global if ESM import fails
const tauriInvoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> = (() => {
  try {
    const mod = (window as any).__TAURI__?.core;
    if (mod?.invoke) return mod.invoke.bind(mod);
  } catch { /* global not available */ }
  const internals = (window as any).__TAURI_INTERNALS__;
  if (internals?.invoke) return internals.invoke.bind(internals);
  // Last resort: try dynamic import
  return async (cmd: string, args?: Record<string, unknown>) => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
  };
})();

// Debug: check Tauri availability
console.log("[App] Tauri check:", {
  hasGlobalTauri: !!(window as any).__TAURI__,
  hasInternals: !!(window as any).__TAURI_INTERNALS__,
  hasTauriFlag: !!(window as any).isTauri,
});

const HOME = "~";

function createPane(path: string): PaneState {
  return {
    path,
    entries: [],
    expanded: new Set<string>(),
    selected: null,
    sort: "name",
    ascending: true,
    error: null,
  };
}

function getParentPath(path: string): string | null {
  if (path === "~" || path === "/") return null;
  if (path === "" || path === ".") return null;
  const parts = path.replace(/\/+$/, "").split("/");
  if (parts.length <= 1) return path.startsWith("/") ? "/" : "~";
  parts.pop();
  const parent = parts.join("/");
  if (parent === "") return "/";
  return parent.startsWith("~") ? parent : parent || "/";
}

function App() {
  const [panes, setPanes] = useState<[PaneState, PaneState, PaneState, PaneState]>([
    createPane(HOME),
    createPane(HOME),
    createPane(HOME),
    createPane(HOME),
  ]);
  const [activePane, setActivePane] = useState(0);
  const [gridCols, setGridCols] = useState("50% 1px 50%");
  const [gridRows, setGridRows] = useState("50% 1px 50%");
  const [ctxMenu, setCtxMenu] = useState<ContextMenuTarget | null>(null);
  const [fileClipboard, setFileClipboard] = useState<FileClipboard | null>(null);

  // Refs for imperative Pane control (context menu actions)
  const paneRefs = useRef<(PaneHandle | null)[]>([null, null, null, null]);

  // Navigation history per pane
  const backStack = useRef<string[][]>([[], [], [], []]);
  const forwardStack = useRef<string[][]>([[], [], [], []]);

  // Load directory listing for a pane
  const loadDir = useCallback(async (paneIdx: number, path: string, addToHistory = false, sort?: string, asc?: boolean) => {
    console.log(`[App] loadDir pane=${paneIdx} path="${path}" sort=${sort || "name"}`);
    try {
      const prevPath = panes[paneIdx]?.path;
      const sortBy = sort || panes[paneIdx]?.sort || "name";
      const ascSort = asc !== undefined ? asc : panes[paneIdx]?.ascending ?? true;
      const result = await tauriInvoke<{ path: string; entries: any[] }>("list_dir", {
        path,
        sortBy,
        ascending: ascSort,
      });
      console.log(`[App] list_dir OK: ${result.entries.length} entries, resolved: "${result.path}"`);
      setPanes((prev) => {
        const next = [...prev] as [PaneState, PaneState, PaneState, PaneState];
        next[paneIdx] = { ...next[paneIdx], path: result.path, entries: result.entries, selected: null, error: null };
        return next;
      });
      // Update history if navigating to a new path
      if (addToHistory && prevPath && prevPath !== path) {
        backStack.current[paneIdx].push(prevPath);
        forwardStack.current[paneIdx] = [];
      }
    } catch (err) {
      console.error(`Failed to list directory: ${path}`, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setPanes((prev) => {
        const next = [...prev] as [PaneState, PaneState, PaneState, PaneState];
        next[paneIdx] = { ...next[paneIdx], error: errMsg };
        return next;
      });
    }
  }, [panes]);

  // Load initial paths
  useEffect(() => {
    loadDir(0, HOME);
    loadDir(1, HOME);
    loadDir(2, HOME);
    loadDir(3, HOME);
  }, [loadDir]);

  const handleNavigate = useCallback(
    (paneIdx: number, path: string) => {
      setActivePane(paneIdx);
      loadDir(paneIdx, path, true);
    },
    [loadDir]
  );

  // Navigation arrows
  const handleNavUp = useCallback(
    (paneIdx: number) => {
      const parent = getParentPath(panes[paneIdx].path);
      if (parent) handleNavigate(paneIdx, parent);
    },
    [panes, handleNavigate]
  );

  const handleNavInto = useCallback(
    (paneIdx: number) => {
      const selected = panes[paneIdx].selected;
      if (selected) {
        const entry = panes[paneIdx].entries.find((e) => e.path === selected);
        if (entry?.is_dir) handleNavigate(paneIdx, selected);
      }
    },
    [panes, handleNavigate]
  );

  const handleNavBack = useCallback(
    (paneIdx: number) => {
      const stack = backStack.current[paneIdx];
      if (stack.length > 0) {
        const prevPath = stack.pop()!;
        forwardStack.current[paneIdx].push(panes[paneIdx].path);
        loadDir(paneIdx, prevPath, false);
      }
    },
    [panes, loadDir]
  );

  const handleNavForward = useCallback(
    (paneIdx: number) => {
      const stack = forwardStack.current[paneIdx];
      if (stack.length > 0) {
        const nextPath = stack.pop()!;
        backStack.current[paneIdx].push(panes[paneIdx].path);
        loadDir(paneIdx, nextPath, false);
      }
    },
    [panes, loadDir]
  );

  const handleSort = useCallback(
    (paneIdx: number, sortBy: string) => {
      const currentSort = panes[paneIdx].sort;
      const currentAsc = panes[paneIdx].ascending;
      const newAsc = currentSort === sortBy ? !currentAsc : true;
      // Update pane sort state
      setPanes((prev) => {
        const next = [...prev] as [PaneState, PaneState, PaneState, PaneState];
        next[paneIdx] = { ...next[paneIdx], sort: sortBy as PaneState["sort"], ascending: newAsc };
        return next;
      });
      loadDir(paneIdx, panes[paneIdx].path, false, sortBy, newAsc);
    },
    [panes, loadDir]
  );

  const handleExpand = useCallback((paneIdx: number, name: string) => {
    setPanes((prev) => {
      const next = [...prev] as [PaneState, PaneState, PaneState, PaneState];
      const expanded = new Set(next[paneIdx].expanded);
      if (expanded.has(name)) {
        expanded.delete(name);
      } else {
        expanded.add(name);
      }
      next[paneIdx] = { ...next[paneIdx], expanded };
      return next;
    });
  }, []);

  const handleSelect = useCallback((paneIdx: number, path: string | null) => {
    setActivePane(paneIdx);
    setPanes((prev) => {
      const next = [...prev] as [PaneState, PaneState, PaneState, PaneState];
      next[paneIdx] = { ...next[paneIdx], selected: path };
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((target: ContextMenuTarget) => {
    setCtxMenu(target);
  }, []);

  const handleContextAction = useCallback(
    async (action: string, pane: number, entryPath: string | null) => {
      const paneRef = paneRefs.current[pane];
      const statusFn = (msg: string, isErr?: boolean) => paneRef?.showStatus(msg, isErr);

      try {
        switch (action) {
          case "open": {
            if (!entryPath) return;
            await tauriInvoke("open_file", { path: entryPath });
            statusFn(`Opened "${entryPath.split("/").pop()}"`);
            break;
          }
          case "delete": {
            if (!entryPath) return;
            const name = entryPath.split("/").pop();
            await tauriInvoke("delete_item", { path: entryPath });
            loadDir(pane, panes[pane].path);
            statusFn(`Deleted "${name}"`);
            break;
          }
          case "rename": {
            if (!entryPath) return;
            paneRef?.startRename(entryPath);
            break;
          }
          case "copy-path": {
            if (!entryPath) return;
            await navigator.clipboard.writeText(entryPath);
            statusFn("Path copied to clipboard");
            break;
          }
          case "copy": {
            if (!entryPath) return;
            setFileClipboard({ paths: [entryPath], operation: "copy" });
            statusFn(`Copied "${entryPath.split("/").pop()}"`);
            break;
          }
          case "cut": {
            if (!entryPath) return;
            setFileClipboard({ paths: [entryPath], operation: "cut" });
            statusFn(`Cut "${entryPath.split("/").pop()}" — paste elsewhere`);
            break;
          }
          case "paste": {
            if (!fileClipboard) return;
            const destDir = panes[pane].path;
            let successCount = 0;
            for (const srcPath of fileClipboard.paths) {
              const srcName = srcPath.split("/").pop() || "unnamed";
              const destPath = destDir === HOME ? srcName : `${destDir}/${srcName}`;
              try {
                await tauriInvoke("copy_file", { src: srcPath, dest: destPath });
                successCount++;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                statusFn(`Failed to paste "${srcName}": ${msg}`, true);
              }
            }
            // If cut, delete originals after successful copy
            if (fileClipboard.operation === "cut" && successCount > 0) {
              for (const srcPath of fileClipboard.paths) {
                try {
                  await tauriInvoke("delete_item", { path: srcPath });
                } catch { /* best effort */ }
              }
            }
            setFileClipboard(null);
            loadDir(pane, destDir);
            statusFn(`Pasted ${successCount} item${successCount !== 1 ? "s" : ""}`);
            break;
          }
          case "new-file": {
            paneRef?.startInlineCreate("file");
            break;
          }
          case "new-folder": {
            paneRef?.startInlineCreate("folder");
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        statusFn(`${action} failed: ${msg}`, true);
        console.error(`Action ${action} failed:`, err);
      }
      setCtxMenu(null);
    },
    [loadDir, panes, fileClipboard]
  );

  const handleCreateItem = useCallback(
    async (paneIdx: number, name: string, isDir: boolean) => {
      const dirPath = panes[paneIdx].path;
      const fullPath = dirPath === HOME
        ? name
        : `${dirPath}/${name}`;
      try {
        if (isDir) {
          await tauriInvoke("create_dir", { path: fullPath });
        } else {
          await tauriInvoke("create_file", { path: fullPath });
        }
        loadDir(paneIdx, dirPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        paneRefs.current[paneIdx]?.showStatus(`Create failed: ${msg}`, true);
        console.error("Failed to create item:", err);
      }
    },
    [loadDir, panes]
  );

  const handleRenameItem = useCallback(
    async (paneIdx: number, oldPath: string, newName: string) => {
      try {
        await tauriInvoke("rename_item", { oldPath, newName });
        loadDir(paneIdx, panes[paneIdx].path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        paneRefs.current[paneIdx]?.showStatus(`Rename failed: ${msg}`, true);
        console.error("Failed to rename:", err);
      }
    },
    [loadDir, panes]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 4) {
          e.preventDefault();
          setActivePane(num - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center h-9 px-3 bg-[var(--bg-surface)] border-b border-[var(--border)] gap-2.5 flex-shrink-0">
        <span className="font-semibold text-xs text-[var(--text-secondary)] tracking-wide">
          File Manager
        </span>
        <div className="w-px h-[18px] bg-[var(--border)]" />
        <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
          <kbd className="inline-block bg-[var(--bg-input)] border border-[var(--border)] rounded-sm px-[5px] py-0 text-[10px] text-[var(--text-secondary)] font-mono leading-normal">
            ⌘1
          </kbd>{" "}
          <kbd className="inline-block bg-[var(--bg-input)] border border-[var(--border)] rounded-sm px-[5px] py-0 text-[10px] text-[var(--text-secondary)] font-mono leading-normal">
            ⌘2
          </kbd>{" "}
          <kbd className="inline-block bg-[var(--bg-input)] border border-[var(--border)] rounded-sm px-[5px] py-0 text-[10px] text-[var(--text-secondary)] font-mono leading-normal">
            ⌘3
          </kbd>{" "}
          <kbd className="inline-block bg-[var(--bg-input)] border border-[var(--border)] rounded-sm px-[5px] py-0 text-[10px] text-[var(--text-secondary)] font-mono leading-normal">
            ⌘4
          </kbd>{" "}
          focus panes
        </span>
      </div>

      {/* Grid */}
      <div
        className="flex-1 grid relative min-h-0"
        style={{
          gridTemplateColumns: gridCols,
          gridTemplateRows: gridRows,
        }}
      >
        {/* Pane 0: Top-Left */}
        <Pane
          ref={(el) => { paneRefs.current[0] = el; }}
          paneIdx={0}
          state={panes[0]}
          isActive={activePane === 0}
          onNavigate={(path) => handleNavigate(0, path)}
          onExpand={(name) => handleExpand(0, name)}
          onSelect={(path) => handleSelect(0, path)}
          onContextMenu={(target) => handleContextMenu({ ...target, pane: 0 })}
          onCreateItem={(name, isDir) => handleCreateItem(0, name, isDir)}
          onRenameItem={(oldPath, newName) => handleRenameItem(0, oldPath, newName)}
          onNavUp={() => handleNavUp(0)}
          onNavInto={() => handleNavInto(0)}
          onNavBack={() => handleNavBack(0)}
          onNavForward={() => handleNavForward(0)}
          onSort={(key) => handleSort(0, key)}
        />

        {/* Vertical divider */}
        <Divider
          direction="v"
          onDrag={(pct) => setGridCols(`${pct}% 1px ${100 - pct}%`)}
        />

        {/* Pane 1: Top-Right */}
        <div style={{ gridRow: 1, gridColumn: 3 }}>
          <Pane
            ref={(el) => { paneRefs.current[1] = el; }}
            paneIdx={1}
            state={panes[1]}
            isActive={activePane === 1}
            onNavigate={(path) => handleNavigate(1, path)}
            onExpand={(name) => handleExpand(1, name)}
            onSelect={(path) => handleSelect(1, path)}
            onContextMenu={(target) => handleContextMenu({ ...target, pane: 1 })}
            onCreateItem={(name, isDir) => handleCreateItem(1, name, isDir)}
            onRenameItem={(oldPath, newName) => handleRenameItem(1, oldPath, newName)}
            onNavUp={() => handleNavUp(1)}
            onNavInto={() => handleNavInto(1)}
            onNavBack={() => handleNavBack(1)}
            onNavForward={() => handleNavForward(1)}
            onSort={(key) => handleSort(1, key)}
          />
        </div>

        {/* Horizontal divider */}
        <Divider
          direction="h"
          onDrag={(pct) => setGridRows(`${pct}% 1px ${100 - pct}%`)}
        />

        {/* Center drag handle */}
        <CenterHandle
          onDrag={(colPct, rowPct) => {
            setGridCols(`${colPct}% 1px ${100 - colPct}%`);
            setGridRows(`${rowPct}% 1px ${100 - rowPct}%`);
          }}
        />

        {/* Pane 2: Bottom-Left */}
        <div style={{ gridRow: 3, gridColumn: 1 }}>
          <Pane
            ref={(el) => { paneRefs.current[2] = el; }}
            paneIdx={2}
            state={panes[2]}
            isActive={activePane === 2}
            onNavigate={(path) => handleNavigate(2, path)}
            onExpand={(name) => handleExpand(2, name)}
            onSelect={(path) => handleSelect(2, path)}
            onContextMenu={(target) => handleContextMenu({ ...target, pane: 2 })}
            onCreateItem={(name, isDir) => handleCreateItem(2, name, isDir)}
            onRenameItem={(oldPath, newName) => handleRenameItem(2, oldPath, newName)}
            onNavUp={() => handleNavUp(2)}
            onNavInto={() => handleNavInto(2)}
            onNavBack={() => handleNavBack(2)}
            onNavForward={() => handleNavForward(2)}
            onSort={(key) => handleSort(2, key)}
          />
        </div>

        {/* Pane 3: Bottom-Right */}
        <div style={{ gridRow: 3, gridColumn: 3 }}>
          <Pane
            ref={(el) => { paneRefs.current[3] = el; }}
            paneIdx={3}
            state={panes[3]}
            isActive={activePane === 3}
            onNavigate={(path) => handleNavigate(3, path)}
            onExpand={(name) => handleExpand(3, name)}
            onSelect={(path) => handleSelect(3, path)}
            onContextMenu={(target) => handleContextMenu({ ...target, pane: 3 })}
            onCreateItem={(name, isDir) => handleCreateItem(3, name, isDir)}
            onRenameItem={(oldPath, newName) => handleRenameItem(3, oldPath, newName)}
            onNavUp={() => handleNavUp(3)}
            onNavInto={() => handleNavInto(3)}
            onNavBack={() => handleNavBack(3)}
            onNavForward={() => handleNavForward(3)}
            onSort={(key) => handleSort(3, key)}
          />
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          target={ctxMenu}
          onAction={(action, pane, entryPath) =>
            handleContextAction(action, pane, entryPath)
          }
          onClose={() => setCtxMenu(null)}
          hasClipboard={fileClipboard !== null}
        />
      )}
    </div>
  );
}

function Divider({
  direction,
  onDrag,
}: {
  direction: "v" | "h";
  onDrag: (pct: number) => void;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const parent = (e.target as HTMLElement).parentElement!;
    const totalSize =
      direction === "v" ? parent.offsetWidth : parent.offsetHeight;
    const parentRect = parent.getBoundingClientRect();
    const parentStart = direction === "v" ? parentRect.left : parentRect.top;

    const onMouseMove = (ev: MouseEvent) => {
      const currentPos = direction === "v" ? ev.clientX : ev.clientY;
      const pct = ((currentPos - parentStart) / totalSize) * 100;
      onDrag(Math.max(15, Math.min(85, pct)));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor =
      direction === "v" ? "col-resize" : "row-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      className="bg-[var(--border)] hover:bg-[var(--accent-dim)] transition-colors relative z-10"
      style={
        direction === "v"
          ? { gridRow: "1 / 4", gridColumn: 2, width: 1, cursor: "col-resize" }
          : {
              gridRow: 2,
              gridColumn: "1 / 4",
              height: 1,
              cursor: "row-resize",
            }
      }
      onMouseDown={handleMouseDown}
    />
  );
}

function CenterHandle({
  onDrag,
}: {
  onDrag: (colPct: number, rowPct: number) => void;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const grid = (e.target as HTMLElement).closest(".grid")!;
    const rect = grid.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      const colPct = ((ev.clientX - rect.left) / rect.width) * 100;
      const rowPct = ((ev.clientY - rect.top) / rect.height) * 100;
      onDrag(Math.max(15, Math.min(85, colPct)), Math.max(15, Math.min(85, rowPct)));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "move";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      className="w-[7px] h-[7px] bg-[var(--border)] hover:bg-[var(--accent)] rounded-full z-20 place-self-center"
      style={{
        gridRow: 2,
        gridColumn: 2,
        margin: -3,
        cursor: "move",
      }}
      onMouseDown={handleMouseDown}
    />
  );
}

export default App;
