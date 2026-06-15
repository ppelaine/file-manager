export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string; // ISO date string
  children?: FileEntry[];
  kind?: FileKind;
}

export type FileKind = "code" | "image" | "doc" | "generic";

export type SortKey = "name" | "date" | "size" | "kind";

export interface PaneState {
  path: string;
  entries: FileEntry[];
  expanded: Set<string>;
  selected: string | null; // path of selected item
  sort: SortKey;
  ascending: boolean;
  error: string | null;
}

export interface AppState {
  panes: [PaneState, PaneState, PaneState, PaneState];
  activePane: number; // 0..3
  gridCols: string; // e.g. "50% 1px 50%"
  gridRows: string; // e.g. "50% 1px 50%"
}

export interface ContextMenuTarget {
  pane: number;
  entry: FileEntry | null;
  x: number;
  y: number;
}
