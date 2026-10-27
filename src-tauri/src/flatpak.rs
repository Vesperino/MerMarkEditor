use std::ffi::OsStr;
use std::path::Path;

pub fn app_id() -> Option<String> {
    app_id_from(std::env::var_os("FLATPAK_ID").as_deref())
}

pub fn is_sandboxed() -> bool {
    sandboxed(
        std::env::var_os("FLATPAK_ID").as_deref(),
        Path::new("/.flatpak-info").exists(),
    )
}

fn app_id_from(flatpak_id: Option<&OsStr>) -> Option<String> {
    flatpak_id
        .map(|v| v.to_string_lossy().trim().to_string())
        .filter(|v| !v.is_empty())
}

fn sandboxed(flatpak_id: Option<&OsStr>, info_file_exists: bool) -> bool {
    info_file_exists || app_id_from(flatpak_id).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatpak_id_marks_sandbox() {
        assert!(sandboxed(Some(OsStr::new("io.github.Vesperino.MerMarkEditor")), false));
    }

    #[test]
    fn info_file_marks_sandbox_without_env() {
        assert!(sandboxed(None, true));
    }

    #[test]
    fn plain_host_is_not_sandboxed() {
        assert!(!sandboxed(None, false));
        assert!(!sandboxed(Some(OsStr::new("  ")), false));
    }

    #[test]
    fn app_id_is_trimmed_and_blank_is_none() {
        assert_eq!(
            app_id_from(Some(OsStr::new(" io.github.Vesperino.MerMarkEditor\n"))).as_deref(),
            Some("io.github.Vesperino.MerMarkEditor")
        );
        assert_eq!(app_id_from(Some(OsStr::new(""))), None);
        assert_eq!(app_id_from(None), None);
    }
}
