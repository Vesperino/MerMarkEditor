//! AI CLI integration core.
//!
//! Sub-modules cover the orthogonal concerns: types, paths, health-check,
//! process spawn, sessions, access-map, snapshots, audit.

pub mod types;
pub mod paths;
pub mod cli;
pub mod audit;
pub mod access_map;
pub mod sessions;
pub mod snapshots;
pub mod health;
pub mod process;
