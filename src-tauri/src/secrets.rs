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
