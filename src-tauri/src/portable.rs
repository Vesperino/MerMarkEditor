use std::path::Path;

// The portable ZIP ships this file next to the executable.
const MARKER: &str = "portable";

pub fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(marked))
        .unwrap_or(false)
}

fn marked(dir: &Path) -> bool {
    dir.join(MARKER).is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mermark-portable-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn marker_file_next_to_exe_means_portable() {
        let dir = scratch("marked");
        std::fs::write(dir.join(MARKER), "").unwrap();
        assert!(marked(&dir));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn installed_folder_without_marker_is_not_portable() {
        let dir = scratch("plain");
        assert!(!marked(&dir));
        std::fs::create_dir(dir.join(MARKER)).unwrap();
        assert!(!marked(&dir));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
