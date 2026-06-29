import { useEffect, useRef } from "react";
import type { ContextMenuTarget } from "../types";

interface ContextMenuProps {
  target: ContextMenuTarget;
  onAction: (action: string, pane: number, entryPath: string | null) => void;
  onClose: () => void;
  hasClipboard?: boolean;
}

export function ContextMenu({ target, onAction, onClose, hasClipboard }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasEntry = !!target.entry;

  useEffect(() => {
    const handleClick = () => onClose();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay listener to avoid closing immediately from the right-click event
    setTimeout(() => {
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleEsc);
    }, 0);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Clamp position to viewport
  const menuWidth = 190;
  const menuHeight = hasClipboard ? 330 : 300;
  const x = Math.min(target.x, window.innerWidth - menuWidth);
  const y = Math.min(target.y, window.innerHeight - menuHeight);

  const items: { action: string; label: string; icon: string; shortcut?: string; danger?: boolean }[] = [
    { action: "open", label: "Open", icon: "↗", shortcut: "⏎" },
    { action: "sep", label: "", icon: "" },
    { action: "copy", label: "Copy", icon: "📋", shortcut: "⌘C" },
    { action: "cut", label: "Cut", icon: "✂", shortcut: "⌘X" },
    { action: "copy-path", label: "Copy Path", icon: "📄", shortcut: "⌘⇧C" },
    { action: "paste", label: "Paste", icon: "📥", shortcut: "⌘V" },
    { action: "sep", label: "", icon: "" },
    { action: "new-file", label: "New File", icon: "📄", shortcut: "⌘N" },
    { action: "new-folder", label: "New Folder", icon: "📁", shortcut: "⌘⇧N" },
    { action: "sep", label: "", icon: "" },
    { action: "rename", label: "Rename", icon: "✎", shortcut: "⏎" },
    { action: "sep", label: "", icon: "" },
    { action: "delete", label: "Delete", icon: "🗑", shortcut: "⌫", danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-1 min-w-[190px] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,0,0,0.3)] z-[100] animate-[menu-in_100ms_ease-out]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.action === "sep") {
          return (
            <div key={i} className="h-px bg-[var(--border)] mx-1.5 my-[3px]" />
          );
        }

        // Determine if this item should be disabled
        const needsEntry = ["open", "copy-path", "rename", "delete", "copy", "cut"].includes(item.action);
        const needsClipboard = item.action === "paste";
        const disabled = (needsEntry && !hasEntry) || (needsClipboard && !hasClipboard);

        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-2.5 py-[5px] text-[12.5px] rounded-md cursor-pointer transition-colors ${
              disabled
                ? "opacity-35 pointer-events-none text-[var(--text-primary)]"
                : item.danger
                  ? "text-[var(--danger)] hover:bg-[rgba(244,71,71,0.1)]"
                  : "text-[var(--text-primary)] hover:bg-[var(--selected)]"
            }`}
            onClick={() => {
              if (!disabled) {
                onAction(item.action, target.pane, target.entry?.path || null);
              }
            }}
          >
            <span className="w-4 text-center text-xs text-[var(--text-secondary)]">
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-auto text-[11px] text-[var(--text-tertiary)] font-mono">
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
