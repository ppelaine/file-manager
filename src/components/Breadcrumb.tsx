interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  // Build segments from path
  let segments: string[];
  let paths: string[];

  if (path === "~") {
    segments = ["~"];
    paths = ["~"];
  } else if (path === "/") {
    segments = ["/"];
    paths = ["/"];
  } else if (path.startsWith("~/")) {
    const parts = path.slice(2).split("/");
    segments = ["~", ...parts];
    paths = ["~"];
    for (let i = 1; i < segments.length; i++) {
      paths.push("~/" + parts.slice(0, i).join("/"));
    }
  } else if (path.startsWith("/")) {
    const parts = path.slice(1).split("/");
    segments = ["/", ...parts];
    paths = ["/"];
    for (let i = 1; i < segments.length; i++) {
      paths.push("/" + parts.slice(0, i).join("/"));
    }
  } else {
    segments = path.split("/").filter(Boolean);
    if (segments.length === 0) segments = ["/"];
    paths = [];
    for (let i = 0; i < segments.length; i++) {
      paths.push(segments.slice(0, i + 1).join("/"));
    }
  }

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: "none" }}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
            <span
              onClick={() => onNavigate(paths[i])}
              className="cursor-pointer px-1 rounded-sm whitespace-nowrap text-xs font-medium hover:underline"
              style={{
                color: i === 0 ? "#dcb67a" : "#b0b0b0",
                background: "transparent",
              }}
              title={paths[i]}
            >
              {seg || "/"}
            </span>
            {!isLast && (
              <span style={{ color: "#666", fontSize: "10px" }}>›</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
