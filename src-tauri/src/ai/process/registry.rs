use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;
use tokio::task::AbortHandle;

pub struct ChildRegistry {
    inner: Mutex<HashMap<String, Child>>,
    // Ollama streams over HTTP and has no child process, so its in-flight turn
    // is tracked by the AbortHandle of the tokio task pumping the response body.
    // Aborting it drops the reqwest stream and stops generation. Arc'd so the
    // task can remove its own entry when it finishes naturally.
    aborts: Arc<Mutex<HashMap<String, AbortHandle>>>,
}

impl ChildRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()), aborts: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub fn insert(&self, request_id: String, child: Child) {
        self.inner.lock().unwrap().insert(request_id, child);
    }

    pub fn take(&self, request_id: &str) -> Option<Child> {
        self.inner.lock().unwrap().remove(request_id)
    }

    /// Spawn an HTTP turn as an abortable task: registers its AbortHandle under
    /// `request_id` and removes the entry again when the task finishes
    /// naturally, so completed turns don't leak registry entries (cancel and
    /// app-exit are the only other removal paths).
    pub fn spawn_abortable(
        &self,
        request_id: String,
        fut: impl std::future::Future<Output = ()> + Send + 'static,
    ) {
        let aborts = self.aborts.clone();
        let cleanup_id = request_id.clone();
        let handle = tokio::spawn(async move {
            fut.await;
            aborts.lock().unwrap().remove(&cleanup_id);
        });
        self.aborts.lock().unwrap().insert(request_id.clone(), handle.abort_handle());
        // The task may have finished (and run its cleanup) before the insert
        // above — drop the stale entry instead of leaking it.
        if handle.is_finished() {
            self.aborts.lock().unwrap().remove(&request_id);
        }
    }

    #[cfg(test)]
    pub fn insert_abort(&self, request_id: String, handle: AbortHandle) {
        self.aborts.lock().unwrap().insert(request_id, handle);
    }

    pub fn take_abort(&self, request_id: &str) -> Option<AbortHandle> {
        self.aborts.lock().unwrap().remove(request_id)
    }

    pub fn kill_all(&self) {
        let mut g = self.inner.lock().unwrap();
        for (_, mut child) in g.drain() {
            crate::ai::process::kill_tree(&mut child);
        }
        let mut a = self.aborts.lock().unwrap();
        for (_, handle) in a.drain() {
            handle.abort();
        }
    }
}

impl Default for ChildRegistry {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn has_abort(reg: &ChildRegistry, id: &str) -> bool {
        reg.aborts.lock().unwrap().contains_key(id)
    }

    async fn wait_until_unregistered(reg: &ChildRegistry, id: &str) -> bool {
        for _ in 0..200 {
            if !has_abort(reg, id) {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        false
    }

    #[tokio::test]
    async fn spawn_abortable_removes_entry_on_natural_completion() {
        let reg = ChildRegistry::new();
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        reg.spawn_abortable("r1".into(), async move {
            let _ = rx.await;
        });
        assert!(has_abort(&reg, "r1"));
        tx.send(()).unwrap();
        assert!(wait_until_unregistered(&reg, "r1").await, "entry leaked after completion");
    }

    #[tokio::test]
    async fn spawn_abortable_entry_is_abortable_via_take_abort() {
        let reg = ChildRegistry::new();
        reg.spawn_abortable("r2".into(), std::future::pending());
        let handle = reg.take_abort("r2").expect("abort handle registered");
        handle.abort();
        assert!(!has_abort(&reg, "r2"));
    }

    #[tokio::test]
    async fn spawn_abortable_does_not_leak_an_already_finished_task() {
        let reg = ChildRegistry::new();
        reg.spawn_abortable("r3".into(), async {});
        assert!(wait_until_unregistered(&reg, "r3").await, "entry leaked after completion");
    }
}
