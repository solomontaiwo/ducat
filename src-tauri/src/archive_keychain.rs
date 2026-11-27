use base64::{Engine as _, engine::general_purpose::STANDARD};
use security_framework::{
    access_control::{ProtectionMode, SecAccessControl},
    item::{ItemClass, ItemSearchOptions},
    passwords::{
        AccessControlOptions, PasswordOptions, delete_generic_password_options, generic_password,
        set_generic_password_options,
    },
};
use serde::Serialize;

const SERVICE: &str = "com.ducatapp.ducat.archive";
const ITEM_NOT_FOUND: i32 = -25300;
const USER_CANCELLED: i32 = -128;

#[derive(Serialize)]
pub struct KeyStatus {
    available: bool,
    configured: bool,
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
        },
        Err(error) => KeyStatus {
            available: error.code() == ITEM_NOT_FOUND,
            configured: false,
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
    let mut options = key_options(&uid)?;
    let mut bytes = STANDARD.decode(value).map_err(|_| "invalidArgument")?;
    if bytes.len() != 32 {
        return Err("invalidArgument");
    }
    let access = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
        AccessControlOptions::USER_PRESENCE.bits(),
    )
    .map_err(|_| "keychainError")?;
    options.set_access_control(access);
    let result = set_generic_password_options(&bytes, options);
    bytes.fill(0);
    result.map_err(|_| "keychainError")
}

#[tauri::command]
pub async fn remove_archive_key(uid: String) -> Result<(), &'static str> {
    match delete_generic_password_options(key_options(&uid)?) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == ITEM_NOT_FOUND => Ok(()),
        _ => Err("keychainError"),
    }
}
