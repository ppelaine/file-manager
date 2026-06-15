use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ListDirResult {
    path: String,
    entries: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
}

fn resolve_path(path: &str) -> PathBuf {
    if path == "~" {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    } else if path.starts_with("~/") {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        home.join(&path[2..])
    } else {
        PathBuf::from(path)
    }
}

#[tauri::command]
fn list_dir(path: &str, sort_by: &str, ascending: bool) -> Result<ListDirResult, String> {
    let resolved = resolve_path(path);

    if !resolved.exists() {
        return Err(format!("Path does not exist: {}", resolved.display()));
    }
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    for entry in fs::read_dir(&resolved).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        // For directories, count children for UI hint
        let children_count = if path.is_dir() {
            fs::read_dir(&path)
                .map(|rd| rd.filter(|e| {
                    e.as_ref()
                        .map(|de| !de.file_name().to_string_lossy().starts_with('.'))
                        .unwrap_or(false)
                }).count())
                .unwrap_or(0)
        } else {
            0
        };

        let modified = metadata
            .modified()
            .ok()
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Local> = t.into();
                datetime.format("%Y-%m-%d %H:%M").to_string()
            })
            .unwrap_or_default();

        let kind = if path.is_dir() {
            None
        } else {
            Some(detect_kind(&name))
        };

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            size: if path.is_dir() { children_count as u64 } else { metadata.len() },
            modified,
            children: if path.is_dir() && children_count > 0 {
                Some(Vec::new()) // placeholder for expansion
            } else {
                None
            },
            kind,
        });
    }

    // Sort
    entries.sort_by(|a, b| {
        let cmp = match sort_by {
            "size" => a.size.cmp(&b.size),
            "date" => a.modified.cmp(&b.modified),
            "kind" => {
                let ka = a.kind.as_deref().unwrap_or("generic");
                let kb = b.kind.as_deref().unwrap_or("generic");
                ka.cmp(kb).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            }
            _ => {
                // name: dirs first, then alphabetical
                b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            }
        };
        if ascending { cmp } else { cmp.reverse() }
    });

    let resolved_path = resolved.to_string_lossy().to_string();
    Ok(ListDirResult {
        path: resolved_path,
        entries,
    })
}

#[tauri::command]
fn create_file(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path);
    if resolved.exists() {
        return Err(format!("File already exists: {}", resolved.display()));
    }
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&resolved, "").map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn create_dir(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path);
    if resolved.exists() {
        return Err(format!("Directory already exists: {}", resolved.display()));
    }
    fs::create_dir_all(&resolved).map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}

#[tauri::command]
fn delete_item(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path);
    if !resolved.exists() {
        return Err(format!("Path does not exist: {}", resolved.display()));
    }
    if resolved.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_file(&resolved).map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn rename_item(old_path: &str, new_name: &str) -> Result<(), String> {
    let resolved_old = resolve_path(old_path);
    if !resolved_old.exists() {
        return Err(format!("Path does not exist: {}", resolved_old.display()));
    }
    let parent = resolved_old
        .parent()
        .ok_or_else(|| "Cannot rename root".to_string())?;
    let resolved_new = parent.join(new_name);
    if resolved_new.exists() {
        return Err(format!("Target already exists: {}", resolved_new.display()));
    }
    fs::rename(&resolved_old, &resolved_new).map_err(|e| format!("Failed to rename: {}", e))?;
    Ok(())
}

#[tauri::command]
fn open_file(path: &str) -> Result<(), String> {
    let resolved = resolve_path(path);
    if !resolved.exists() {
        return Err(format!("File does not exist: {}", resolved.display()));
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&resolved)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        opener::open(&resolved).map_err(|e| format!("Failed to open file: {}", e))?;
    }
    Ok(())
}

fn detect_kind(name: &str) -> String {
    let ext = std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let code_exts: &[&str] = &[
        "ts", "tsx", "js", "jsx", "json", "css", "html", "rs", "py", "rb",
        "go", "java", "c", "h", "cpp", "hpp", "swift", "kt", "yaml", "yml",
        "toml", "xml", "sh", "bash", "zsh", "fish", "sql", "graphql", "vue",
        "svelte", "astro", "mdx", "cjs", "mjs",
    ];
    let image_exts: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "avif",
    ];
    let doc_exts: &[&str] = &[
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "md", "txt",
        "rtf", "csv", "pages", "numbers", "key",
    ];

    if code_exts.contains(&ext.as_str()) { "code".to_string() }
    else if image_exts.contains(&ext.as_str()) { "image".to_string() }
    else if doc_exts.contains(&ext.as_str()) { "doc".to_string() }
    else { "generic".to_string() }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            create_file,
            create_dir,
            delete_item,
            rename_item,
            open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_resolve_path_home() {
        let path = resolve_path("~");
        let home = dirs::home_dir().unwrap();
        assert_eq!(path, home);
    }

    #[test]
    fn test_resolve_path_home_subdir() {
        let path = resolve_path("~/Documents");
        let home = dirs::home_dir().unwrap();
        assert_eq!(path, home.join("Documents"));
    }

    #[test]
    fn test_resolve_path_absolute() {
        let path = resolve_path("/tmp");
        assert_eq!(path, PathBuf::from("/tmp"));
    }

    #[test]
    fn test_resolve_path_relative() {
        let path = resolve_path("foo/bar");
        assert_eq!(path, PathBuf::from("foo/bar"));
    }

    #[test]
    fn test_list_dir_home() {
        let result = list_dir("~", "name", true);
        assert!(result.is_ok(), "list_dir(~) failed: {:?}", result.err());
        let data = result.unwrap();
        assert!(!data.path.is_empty(), "resolved path should not be empty");
        // Home directory should have at least some entries (Desktop, Documents, etc.)
        assert!(!data.entries.is_empty(), "home dir should have entries");
        // First entries should be directories (sorted dirs first)
        let first = &data.entries[0];
        assert!(first.is_dir, "first entry should be a directory");
    }

    #[test]
    fn test_list_dir_nonexistent() {
        let result = list_dir("/nonexistent_path_12345", "name", true);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_and_delete_file() {
        let tmp = env::temp_dir().join("tauri_test_file.txt");
        let path_str = tmp.to_string_lossy().to_string();

        // Clean up first
        let _ = fs::remove_file(&tmp);

        // Create
        let result = create_file(&path_str);
        assert!(result.is_ok(), "create_file failed: {:?}", result.err());
        assert!(tmp.exists(), "file should exist after create");

        // Delete
        let result = delete_item(&path_str);
        assert!(result.is_ok(), "delete_item failed: {:?}", result.err());
        assert!(!tmp.exists(), "file should not exist after delete");
    }

    #[test]
    fn test_create_and_delete_dir() {
        let tmp = env::temp_dir().join("tauri_test_dir");
        let path_str = tmp.to_string_lossy().to_string();

        let _ = fs::remove_dir_all(&tmp);

        let result = create_dir(&path_str);
        assert!(result.is_ok(), "create_dir failed: {:?}", result.err());
        assert!(tmp.is_dir(), "should be a directory");

        let result = delete_item(&path_str);
        assert!(result.is_ok());
        assert!(!tmp.exists());
    }

    #[test]
    fn test_rename_item() {
        let tmp = env::temp_dir();
        let old_path = tmp.join("tauri_rename_old.txt");
        let new_name = "tauri_rename_new.txt";
        let new_path = tmp.join(new_name);

        let _ = fs::remove_file(&old_path);
        let _ = fs::remove_file(&new_path);

        fs::write(&old_path, "test content").unwrap();
        assert!(old_path.exists());

        let result = rename_item(&old_path.to_string_lossy(), new_name);
        assert!(result.is_ok(), "rename failed: {:?}", result.err());
        assert!(!old_path.exists(), "old should not exist");
        assert!(new_path.exists(), "new should exist");

        let _ = fs::remove_file(&new_path);
    }

    #[test]
    fn test_rename_nonexistent() {
        let result = rename_item("/nonexistent_rename_test", "newname");
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_kind_types() {
        assert_eq!(detect_kind("main.rs"), "code");
        assert_eq!(detect_kind("app.tsx"), "code");
        assert_eq!(detect_kind("photo.png"), "image");
        assert_eq!(detect_kind("doc.pdf"), "doc");
        assert_eq!(detect_kind("notes.txt"), "doc");
        assert_eq!(detect_kind("random.xyz"), "generic");
    }
}
