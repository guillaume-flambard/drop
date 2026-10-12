//! Verify the *actual shipped bytes*, against the committed updater public key.
//! The GitHub draft is never created if even one of the five signatures fails.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;
use std::collections::BTreeSet;
use std::error::Error;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

const TARGETS: [&str; 5] = [
    "darwin-aarch64",
    "darwin-x86_64",
    "windows-x86_64",
    "linux-x86_64",
    "linux-aarch64",
];

fn require<'a>(value: &'a Value, key: &str) -> Result<&'a str, Box<dyn Error>> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing or invalid {key}").into())
}

fn asset_name(url: &str) -> Result<&str, Box<dyn Error>> {
    let prefix = "https://github.com/memolabs-dev/drop/releases/download/";
    let tail = url
        .strip_prefix(prefix)
        .ok_or("updater URL is not in the Drop GitHub release")?;
    let (tag, name) = tail
        .split_once('/')
        .ok_or("updater URL has no asset path")?;
    if tag.is_empty()
        || !tag.starts_with('v')
        || name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        || name == "."
        || name == ".."
    {
        return Err("invalid updater asset name or release tag".into());
    }
    Ok(name)
}

fn verify_one(
    public_key: &PublicKey,
    path: &Path,
    signature_b64: &str,
    version: &str,
) -> Result<(), Box<dyn Error>> {
    let signature_bytes = STANDARD.decode(signature_b64)?;
    let signature_text = std::str::from_utf8(&signature_bytes)?;
    let signature = Signature::decode(signature_text)?;
    let bound_version = signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
        .ok_or("signed archive has no bound version")?;
    if bound_version != version {
        return Err("signed archive version does not match release manifest".into());
    }
    let mut verifier = public_key.verify_stream(&signature)?;
    let mut file = File::open(path)?;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        verifier.update(&buffer[..read]);
    }
    verifier.finalize()?;
    Ok(())
}

fn verify_release(
    public_key_path: &Path,
    manifest_path: &Path,
    assets_dir: &Path,
) -> Result<(), Box<dyn Error>> {
    let encoded_public_key = fs::read_to_string(public_key_path)?;
    let pubkey_text = String::from_utf8(STANDARD.decode(encoded_public_key.trim())?)?;
    let public_key = PublicKey::decode(&pubkey_text)?;
    let manifest: Value = serde_json::from_slice(&fs::read(manifest_path)?)?;
    let version = require(&manifest, "version")?;
    if version.is_empty() || !version.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        return Err("invalid release version".into());
    }
    let platforms = manifest
        .get("platforms")
        .and_then(Value::as_object)
        .ok_or("missing platforms")?;
    if platforms.len() != TARGETS.len() {
        return Err("updater release must cover exactly five architectures".into());
    }
    let mut archive_names = BTreeSet::new();
    for target in TARGETS {
        let entry = platforms
            .get(target)
            .ok_or_else(|| format!("missing target {target}"))?;
        let signature = require(entry, "signature")?;
        let url = require(entry, "url")?;
        let name = asset_name(url)?;
        if !archive_names.insert(name) {
            return Err("two architectures refer to the same archive".into());
        }
        let path = assets_dir.join(name);
        verify_one(&public_key, &path, signature, version)
            .map_err(|error| format!("{target}: {error}"))?;
        println!("verified {target}: {name}");
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    let [_, public_key_path, manifest_path, assets_dir] = args.as_slice() else {
        return Err("usage: drop-update-verify updater.pub latest.json release-assets-dir".into());
    };
    verify_release(
        &PathBuf::from(public_key_path),
        &PathBuf::from(manifest_path),
        &PathBuf::from(assets_dir),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_external_and_unsafe_urls() {
        for url in [
            "https://evil.example/release/drop.exe",
            "https://github.com/memolabs-dev/drop/releases/download/v1/../key",
            "https://github.com/memolabs-dev/drop/releases/download/v1/file?x=1",
            "https://github.com/memolabs-dev/drop/releases/download/v1/a/b",
            "https://github.com/memolabs-dev/drop/releases/download/v1/..",
        ] {
            assert!(asset_name(url).is_err(), "{url}");
        }
    }

    #[test]
    fn accepts_safe_release_urls() {
        assert_eq!(
            asset_name("https://github.com/memolabs-dev/drop/releases/download/v0.1.0-ci.24/drop_0.1.0_amd64.AppImage").unwrap(),
            "drop_0.1.0_amd64.AppImage"
        );
    }
}
