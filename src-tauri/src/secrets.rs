use std::sync::Arc;

use crate::google_auth::{KeyringSlot, SecretStore, StoreResult};

pub trait Vault: Send + Sync {
    fn read(&self, key: &str) -> StoreResult<Option<String>>;
    fn write(&self, key: &str, value: &str) -> StoreResult<()>;
    fn clear(&self, key: &str) -> StoreResult<()>;
}

pub struct KeyStore;

impl Vault for KeyStore {
    fn read(&self, key: &str) -> StoreResult<Option<String>> {
        KeyringSlot(key.to_owned()).read()
    }

    fn write(&self, key: &str, value: &str) -> StoreResult<()> {
        KeyringSlot(key.to_owned()).write(value)
    }

    fn clear(&self, key: &str) -> StoreResult<()> {
        KeyringSlot(key.to_owned()).clear()
    }
}

pub fn keystore() -> Arc<dyn Vault> {
    Arc::new(KeyStore)
}

pub fn keep_secret(vault: &dyn Vault, key: &str, value: &str) -> Option<String> {
    if value.is_empty() {
        forget_secret(vault, key);
        return None;
    }
    match vault.write(key, value) {
        Ok(()) => None,
        Err(error) => {
            tracing::warn!(%error, "key store refused a secret, it stays in the data file");
            Some(value.to_owned())
        }
    }
}

pub fn resolve_secret(vault: &dyn Vault, key: &str, kept: Option<&str>) -> Option<String> {
    match vault.read(key) {
        Ok(Some(value)) => Some(value),
        Ok(None) => kept.map(str::to_owned),
        Err(error) => {
            tracing::warn!(%error, "key store could not be read");
            kept.map(str::to_owned)
        }
    }
}

pub fn forget_secret(vault: &dyn Vault, key: &str) {
    if let Err(error) = vault.clear(key) {
        tracing::warn!(%error, "key store entry not removed");
    }
}

#[cfg(test)]
pub mod test_support {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    pub struct MemoryVault {
        values: Mutex<HashMap<String, String>>,
        refuse: bool,
    }

    impl MemoryVault {
        pub fn refusing() -> Arc<Self> {
            Arc::new(Self {
                values: Mutex::new(HashMap::new()),
                refuse: true,
            })
        }

        pub fn get(&self, key: &str) -> Option<String> {
            self.values.lock().unwrap().get(key).cloned()
        }

        fn check(&self) -> StoreResult<()> {
            if self.refuse {
                Err("no key store".to_owned())
            } else {
                Ok(())
            }
        }
    }

    impl Vault for MemoryVault {
        fn read(&self, key: &str) -> StoreResult<Option<String>> {
            self.check()?;
            Ok(self.get(key))
        }

        fn write(&self, key: &str, value: &str) -> StoreResult<()> {
            self.check()?;
            self.values.lock().unwrap().insert(key.to_owned(), value.to_owned());
            Ok(())
        }

        fn clear(&self, key: &str) -> StoreResult<()> {
            self.check()?;
            self.values.lock().unwrap().remove(key);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::MemoryVault;
    use super::*;

    const SLOT: &str = "network-share:s1";

    #[test]
    fn keep_secret_stores_the_value_in_the_vault_and_returns_nothing() {
        let vault = MemoryVault::default();
        assert_eq!(keep_secret(&vault, SLOT, "hunter2"), None);
        assert_eq!(vault.get(SLOT).as_deref(), Some("hunter2"));
    }

    #[test]
    fn keep_secret_hands_the_value_back_when_the_vault_refuses() {
        let vault = MemoryVault::refusing();
        assert_eq!(keep_secret(vault.as_ref(), SLOT, "hunter2").as_deref(), Some("hunter2"));
    }

    #[test]
    fn keep_secret_with_an_empty_value_clears_the_entry() {
        let vault = MemoryVault::default();
        vault.write(SLOT, "old").unwrap();
        assert_eq!(keep_secret(&vault, SLOT, ""), None);
        assert!(vault.get(SLOT).is_none());
    }

    #[test]
    fn resolve_prefers_the_vault_over_the_kept_value() {
        let vault = MemoryVault::default();
        vault.write(SLOT, "from-vault").unwrap();
        assert_eq!(resolve_secret(&vault, SLOT, Some("kept")).as_deref(), Some("from-vault"));
    }

    #[test]
    fn resolve_returns_the_kept_value_when_the_vault_is_empty() {
        let vault = MemoryVault::default();
        assert_eq!(resolve_secret(&vault, SLOT, Some("kept")).as_deref(), Some("kept"));
    }

    #[test]
    fn resolve_returns_the_kept_value_when_the_vault_cannot_be_read() {
        let vault = MemoryVault::refusing();
        assert_eq!(resolve_secret(vault.as_ref(), SLOT, Some("kept")).as_deref(), Some("kept"));
    }

    #[test]
    fn forget_removes_the_entry() {
        let vault = MemoryVault::default();
        vault.write(SLOT, "value").unwrap();
        forget_secret(&vault, SLOT);
        assert!(vault.get(SLOT).is_none());
    }

    #[test]
    fn forget_on_a_refusing_vault_does_not_panic() {
        let vault = MemoryVault::refusing();
        forget_secret(vault.as_ref(), SLOT);
        assert_eq!(resolve_secret(vault.as_ref(), SLOT, None), None);
    }

    #[test]
    fn the_android_key_list_names_every_slot_rust_writes() {
        let kotlin = include_str!(
            "../tauri-plugin-hushio-player/android/src/main/java/com/hushio/player/SecretRecords.kt"
        );
        let slots = [
            "google-refresh-token",
            crate::spotify_auth::TOKEN_SLOT,
            crate::yt_innertube_auth::TV_TOKEN_SLOT,
            "lastfm-session",
            "lastfm-pending-token",
            "listenbrainz-token",
        ];
        for slot in slots {
            assert!(kotlin.contains(&format!("\"{slot}\"")), "{slot} is missing from SecretRecords.kt");
        }
        assert!(crate::network::share_key("abc").starts_with("network-share:"));
        assert!(kotlin.contains("\"network-share:\""));
    }
}
