use std::collections::HashMap;
use std::sync::Mutex;
use tokio::process::Child;

pub struct ChildRegistry {
    inner: Mutex<HashMap<String, Child>>,
}

impl ChildRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    pub fn insert(&self, request_id: String, child: Child) {
        self.inner.lock().unwrap().insert(request_id, child);
    }

    pub fn take(&self, request_id: &str) -> Option<Child> {
        self.inner.lock().unwrap().remove(request_id)
    }

    pub fn kill_all(&self) {
        let mut g = self.inner.lock().unwrap();
        for (_, mut child) in g.drain() {
            crate::ai::process::kill_tree(&mut child);
        }
    }
}

impl Default for ChildRegistry {
    fn default() -> Self { Self::new() }
}
