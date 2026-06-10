use std::collections::HashMap;
use std::sync::Mutex;
use tokio::process::Child;
use tokio::task::AbortHandle;

pub struct ChildRegistry {
    inner: Mutex<HashMap<String, Child>>,
    // Ollama streams over HTTP and has no child process, so its in-flight turn
    // is tracked by the AbortHandle of the tokio task pumping the response body.
    // Aborting it drops the reqwest stream and stops generation.
    aborts: Mutex<HashMap<String, AbortHandle>>,
}

impl ChildRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()), aborts: Mutex::new(HashMap::new()) }
    }

    pub fn insert(&self, request_id: String, child: Child) {
        self.inner.lock().unwrap().insert(request_id, child);
    }

    pub fn take(&self, request_id: &str) -> Option<Child> {
        self.inner.lock().unwrap().remove(request_id)
    }

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
