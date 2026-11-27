use base64::{Engine as _, engine::general_purpose::STANDARD};
use security_framework::{
    access_control::{ProtectionMode, SecAccessControl},
    item::{ItemClass, ItemSearchOptions},
    passwords::{
        PasswordOptions, delete_generic_password_options, generic_password,
        set_generic_password_options,
    },
};
use serde::Serialize;

const SERVICE: &str = "com.ducatapp.ducat.archive";
const ITEM_NOT_FOUND: i32 = -25300;
const USER_CANCELLED: i32 = -128;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    available: bool,
    configured: bool,
    requires_prompt: bool,
}

#[derive(Serialize)]
pub struct KeyValue {
    value: Option<String>,
}

fn valid_uid(uid: &str) -> bool {
    uid.len() == 36
        && uid.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

fn key_options(uid: &str) -> Result<PasswordOptions, &'static str> {
    if !valid_uid(uid) {
        return Err("invalidArgument");
    }
    let mut options = PasswordOptions::new_generic_password(SERVICE, uid);
    options.use_protected_keychain();
    options.set_access_synchronized(Some(false));
    Ok(options)
}

fn persist_archive_key(uid: &str, bytes: &[u8]) -> Result<(), &'static str> {
    let _ = delete_generic_password_options(key_options(uid)?);
    let mut options = key_options(uid)?;
    let access = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
        0,
    )
    .map_err(|_| "keychainError")?;
    options.set_access_control(access);
    set_generic_password_options(bytes, options).map_err(|_| "keychainError")
}

#[tauri::command]
pub async fn archive_key_status(uid: String) -> Result<KeyStatus, &'static str> {
    if !valid_uid(&uid) {
        return Err("invalidArgument");
    }
    let result = ItemSearchOptions::new()
        .class(ItemClass::generic_password())
        .service(SERVICE)
        .account(&uid)
        .load_attributes(true)
        .ignore_legacy_keychains()
        .search();

    Ok(match result {
        Ok(entries) => KeyStatus {
            available: true,
            configured: !entries.is_empty(),
            requires_prompt: false,
        },
        Err(error) => KeyStatus {
            available: error.code() == ITEM_NOT_FOUND,
            configured: false,
            requires_prompt: false,
        },
    })
}

#[tauri::command]
pub async fn unlock_archive_key(uid: String) -> Result<KeyValue, &'static str> {
    tauri::async_runtime::spawn_blocking(move || match generic_password(key_options(&uid)?) {
        Ok(mut bytes) if bytes.len() == 32 => {
            let value = STANDARD.encode(&bytes);
            bytes.fill(0);
            Ok(KeyValue { value: Some(value) })
        }
        Err(error) if error.code() == ITEM_NOT_FOUND => Ok(KeyValue { value: None }),
        Err(error) if error.code() == USER_CANCELLED => Err("userCancel"),
        _ => Err("keychainError"),
    })
    .await
    .map_err(|_| "keychainError")?
}

#[tauri::command]
pub async fn save_archive_key(uid: String, value: String) -> Result<(), &'static str> {
    let mut bytes = STANDARD.decode(value).map_err(|_| "invalidArgument")?;
    if bytes.len() != 32 {
        return Err("invalidArgument");
    }
    let result = persist_archive_key(&uid, &bytes);
    bytes.fill(0);
    result
}

#[tauri::command]
pub async fn remove_archive_key(uid: String) -> Result<(), &'static str> {
    match delete_generic_password_options(key_options(&uid)?) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == ITEM_NOT_FOUND => Ok(()),
        _ => Err("keychainError"),
    }
}
