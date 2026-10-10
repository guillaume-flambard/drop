// drop for macOS (T2.4, D26): a menu bar icon, the node daemon running in the background, and the panel the daemon
// serves on 127.0.0.1, shown in a small window under the icon. The app holds no logic of its own: everything the panel
// does goes through the node's local API, protected by its token.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{
    ActivationPolicy, AppHandle, Manager, PhysicalPosition, RunEvent, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

const DEFAULT_RELAY: &str = "ws://127.0.0.1:7780/v1";

fn bootstrap_relay(configured: Option<String>) -> String {
    configured.unwrap_or_else(|| DEFAULT_RELAY.to_string())
}
const PANEL_WIDTH: f64 = 380.0;
const PANEL_HEIGHT: f64 = 620.0;
const PANEL_RADIUS: f64 = 12.0;

struct Daemon {
    child: Mutex<Option<Child>>,
    ready: AtomicBool,
    verified_port: Mutex<Option<u16>>,
    retry: AtomicBool,
    stopping: AtomicBool,
    splash_url: Mutex<Option<Url>>,
    pending_links: Mutex<Vec<Url>>,
}

fn instance_marker() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{nanos}", std::process::id())
}

fn drop_home() -> PathBuf {
    if let Ok(home) = std::env::var("DROP_HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".drop")
}

/// `node drop.mjs <args>` from the app's own resources, with DROP_HOME set.
fn drop_command(app: &AppHandle, args: &[&str]) -> Command {
    let resources = app.path().resource_dir().expect("resource dir");
    let mut command = Command::new(resources.join("node"));
    command
        .arg(resources.join("drop.mjs"))
        .args(args)
        .env("DROP_HOME", drop_home());
    command
}

/// First launch: a private identity named after the Mac's user, on an explicitly configured or loopback relay. Joining a team comes with an invite link.
fn ensure_identity(app: &AppHandle) -> Result<(), &'static str> {
    if drop_home().join("identity.json").exists() {
        return Ok(());
    }
    let full_name = Command::new("id")
        .arg("-F")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Moi".to_string());
    let first_name = full_name
        .split_whitespace()
        .next()
        .unwrap_or("Moi")
        .to_string();
    let relay = bootstrap_relay(std::env::var("DROP_RELAY_URL").ok());
    let status = drop_command(
        app,
        &[
            "init",
            "--profile",
            "private",
            "--name",
            &first_name,
            "--kind",
            "human",
            "--relay",
            &relay,
        ],
    )
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map_err(|_| "E_INIT")?;
    if !status.success() || !drop_home().join("identity.json").exists() {
        return Err("E_INIT");
    }
    Ok(())
}

fn start_daemon(app: &AppHandle, marker: &str, port: u16) -> Result<(), &'static str> {
    if panel_url(port, &[]).is_none() {
        return Err("E_TOKEN");
    }
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
        return Err("E_PORT");
    }
    let log = fs::File::create(drop_home().join("daemon.log")).map_err(|_| "E_LOG")?;
    let mut command = drop_command(app, &["serve"]);
    command.stdout(Stdio::null());
    command.stderr(log).env("DROP_SHELL_INSTANCE", marker);
    let child = command.spawn().map_err(|_| "E_SPAWN")?;
    *app.state::<Daemon>().child.lock().map_err(|_| "E_STATE")? = Some(child);
    Ok(())
}

fn api_port() -> Result<u16, &'static str> {
    let text = fs::read_to_string(drop_home().join("config.json")).map_err(|_| "E_CONFIG")?;
    let config: serde_json::Value = serde_json::from_str(&text).map_err(|_| "E_CONFIG")?;
    let port = config
        .get("apiPort")
        .and_then(serde_json::Value::as_u64)
        .ok_or("E_CONFIG")?;
    u16::try_from(port)
        .ok()
        .filter(|port| *port > 0)
        .ok_or("E_CONFIG")
}

fn panel_url(port: u16, extra: &[(&str, String)]) -> Option<Url> {
    let token = fs::read_to_string(drop_home().join("local-token")).ok()?;
    let token = token.trim();
    if token.is_empty() {
        return None;
    }
    let mut url = Url::parse(&format!("http://127.0.0.1:{port}/app")).ok()?;
    url.query_pairs_mut().append_pair("token", token);
    for (key, value) in extra {
        url.query_pairs_mut().append_pair(key, value);
    }
    Some(url)
}

fn own_health(port: u16, marker: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let request = format!(
        "GET /_shell/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.take(4096).read_to_string(&mut response).is_err() {
        return false;
    }
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    if !head.starts_with("HTTP/1.1 200 ") {
        return false;
    }
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|json| {
            json.get("instance")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .as_deref()
        == Some(marker)
}

fn wait_for_daemon(app: &AppHandle, port: u16, marker: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if app
            .state::<Daemon>()
            .child
            .lock()
            .ok()
            .and_then(|mut guard| {
                guard
                    .as_mut()
                    .and_then(|child| child.try_wait().ok().flatten())
            })
            .is_some()
        {
            return false;
        }
        if own_health(port, marker) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn stop_daemon(app: &AppHandle) {
    if let Ok(mut guard) = app.state::<Daemon>().child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    app.state::<Daemon>().ready.store(false, Ordering::SeqCst);
    *app.state::<Daemon>()
        .verified_port
        .lock()
        .expect("verified port") = None;
}

fn show_splash(app: &AppHandle, code: &str) {
    app.state::<Daemon>().ready.store(false, Ordering::SeqCst);
    let Some(base) = app
        .state::<Daemon>()
        .splash_url
        .lock()
        .ok()
        .and_then(|url| url.clone())
    else {
        return;
    };
    let mut url = base;
    url.query_pairs_mut().clear().append_pair("state", code);
    if let Some(window) = app.get_webview_window("panel") {
        let _ = window.navigate(url);
    }
}

fn supervise(app: AppHandle) {
    let mut restarts = 0u8;
    while !app.state::<Daemon>().stopping.load(Ordering::SeqCst) {
        show_splash(&app, "starting");
        let marker = instance_marker();
        let result = ensure_identity(&app)
            .and_then(|_| api_port())
            .and_then(|port| {
                start_daemon(&app, &marker, port)?;
                if wait_for_daemon(&app, port, &marker) {
                    let url = panel_url(port, &[]).ok_or("E_TOKEN")?;
                    let window = app.get_webview_window("panel").ok_or("E_PANEL")?;
                    window.navigate(url).map_err(|_| "E_PANEL")?;
                    Ok(port)
                } else {
                    Err("E_START")
                }
            });
        match result {
            Ok(port) => {
                *app.state::<Daemon>()
                    .verified_port
                    .lock()
                    .expect("verified port") = Some(port);
                app.state::<Daemon>().ready.store(true, Ordering::SeqCst);
                let links = std::mem::take(
                    &mut *app
                        .state::<Daemon>()
                        .pending_links
                        .lock()
                        .expect("link queue"),
                );
                open_links(&app, links);
                let mut failed_checks = 0u8;
                while app.state::<Daemon>().ready.load(Ordering::SeqCst)
                    && !app.state::<Daemon>().stopping.load(Ordering::SeqCst)
                {
                    thread::sleep(Duration::from_secs(3));
                    if app.state::<Daemon>().retry.swap(false, Ordering::SeqCst) {
                        break;
                    }
                    let exited = app
                        .state::<Daemon>()
                        .child
                        .lock()
                        .ok()
                        .and_then(|mut guard| {
                            guard
                                .as_mut()
                                .and_then(|child| child.try_wait().ok().flatten())
                        })
                        .is_some();
                    if exited || !own_health(port, &marker) {
                        failed_checks += 1;
                    } else {
                        failed_checks = 0;
                    }
                    if failed_checks >= 2 {
                        break;
                    }
                }
                stop_daemon(&app);
                if app.state::<Daemon>().retry.swap(false, Ordering::SeqCst) {
                    restarts = 0;
                    continue;
                }
                if restarts < 2 {
                    eprintln!("drop shell E_HEALTH: retry {}/2", restarts + 1);
                    restarts += 1;
                    continue;
                }
                eprintln!("drop shell E_RESTART");
                show_splash(&app, "E_RESTART");
            }
            Err(code) => {
                eprintln!("drop shell {code}");
                stop_daemon(&app);
                if code == "E_START" && restarts < 2 {
                    restarts += 1;
                    eprintln!("drop shell E_START: retry {restarts}/2");
                    continue;
                }
                if code == "E_START" {
                    eprintln!("drop shell E_RESTART");
                }
                show_splash(&app, if code == "E_START" { "E_RESTART" } else { code });
            }
        }
        // A persistent failure remains visible until the user explicitly retries from the tray menu.
        while !app.state::<Daemon>().retry.swap(false, Ordering::SeqCst)
            && !app.state::<Daemon>().stopping.load(Ordering::SeqCst)
        {
            thread::sleep(Duration::from_millis(300));
        }
        restarts = 0;
    }
}

fn show_panel(app: &AppHandle, near: Option<PhysicalPosition<f64>>) {
    let Some(window) = app.get_webview_window("panel") else {
        return;
    };
    if let Some(position) = near {
        let scale = window.scale_factor().unwrap_or(2.0);
        let x = position.x - PANEL_WIDTH * scale / 2.0;
        let _ = window.set_position(PhysicalPosition::new(x.max(0.0), position.y + 8.0 * scale));
    }
    let _ = window.show();
    let _ = window.set_focus();
}

fn toggle_panel(app: &AppHandle, near: PhysicalPosition<f64>) {
    if let Some(window) = app.get_webview_window("panel") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
    }
    show_panel(app, Some(near));
}

#[tauri::command]
fn retry_daemon(app: AppHandle) {
    app.state::<Daemon>().retry.store(true, Ordering::SeqCst);
}

/// `drop://pair?code=…` joins a team; `drop://link?session=…&gateway=…&client=…` asks to link an assistant such as
/// Claude or ChatGPT (T2.13). Either way the panel opens with the request and the user decides there.
fn open_links(app: &AppHandle, urls: Vec<Url>) {
    if !app.state::<Daemon>().ready.load(Ordering::SeqCst) {
        let daemon = app.state::<Daemon>();
        let mut queue = daemon.pending_links.lock().expect("link queue");
        for url in urls {
            if queue.len() >= 8 {
                break;
            }
            if url.scheme() == "drop"
                && matches!(url.host_str(), Some("pair" | "link"))
                && url.as_str().len() <= 4096
            {
                queue.push(url);
            }
        }
        show_panel(app, None);
        return;
    }
    let Some(port) = *app
        .state::<Daemon>()
        .verified_port
        .lock()
        .expect("verified port")
    else {
        return;
    };
    for link in urls {
        if link.scheme() != "drop" {
            continue;
        }
        let param = |name: &str| {
            link.query_pairs()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.into_owned())
        };
        let extra: Vec<(&str, String)> = match link.host_str() {
            Some("pair") => param("code")
                .map(|code| vec![("pair", code)])
                .unwrap_or_default(),
            Some("link") => match (param("session"), param("gateway")) {
                (Some(session), Some(gateway)) => vec![
                    ("link", session),
                    ("gateway", gateway),
                    (
                        "client",
                        param("client").unwrap_or_else(|| "Un assistant".to_string()),
                    ),
                ],
                _ => vec![],
            },
            _ => vec![],
        };
        if extra.is_empty() {
            continue;
        }
        if let (Some(window), Some(url)) =
            (app.get_webview_window("panel"), panel_url(port, &extra))
        {
            let _ = window.navigate(url);
            show_panel(app, None);
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![retry_daemon])
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(Daemon {
            child: Mutex::new(None),
            ready: AtomicBool::new(false),
            verified_port: Mutex::new(None),
            retry: AtomicBool::new(false),
            stopping: AtomicBool::new(false),
            splash_url: Mutex::new(None),
            pending_links: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            app.set_activation_policy(ActivationPolicy::Accessory);
            let handle = app.handle().clone();

            let window =
                WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("index.html".into()))
                    .title("drop")
                    .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
                    .resizable(false)
                    .decorations(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    // A popover material with rounded corners, like the system menu bar extras.
                    .transparent(true)
                    .shadow(true)
                    .effects(
                        EffectsBuilder::new()
                            .effect(Effect::Popover)
                            .state(EffectState::Active)
                            .radius(PANEL_RADIUS)
                            .build(),
                    )
                    .visible(false)
                    .build()?;
            *handle
                .state::<Daemon>()
                .splash_url
                .lock()
                .expect("splash URL") = Some(window.url()?);
            let hide_on_blur = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = hide_on_blur.hide();
                }
            });

            let ready = handle.clone();
            thread::spawn(move || supervise(ready));

            let open = MenuItem::with_id(app, "open", "Ouvrir drop", true, None::<&str>)?;
            let retry =
                MenuItem::with_id(app, "retry", "Réessayer le démarrage", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter drop", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &retry, &quit])?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("drop")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_panel(app, None),
                    "retry" => {
                        app.state::<Daemon>().retry.store(true, Ordering::SeqCst);
                        show_panel(app, None);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle(), position);
                    }
                })
                .build(app)?;

            let links = handle.clone();
            app.deep_link()
                .on_open_url(move |event| open_links(&links, event.urls()));
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                open_links(&handle, urls);
            }
            // Starts with the session, like a menu bar app should; the user can turn it off in System Settings. Only the
            // release build registers itself: a debug build must not end up in the developer's login items.
            if !cfg!(debug_assertions) {
                let _ = app.autolaunch().enable();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("drop failed to start");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle
                .state::<Daemon>()
                .stopping
                .store(true, Ordering::SeqCst);
            stop_daemon(handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn bootstrap_uses_loopback_or_explicit_relay() {
        assert_eq!(bootstrap_relay(None), "ws://127.0.0.1:7780/v1");
        assert_eq!(
            bootstrap_relay(Some("wss://10.0.0.2/v1".to_string())),
            "wss://10.0.0.2/v1"
        );
    }

    #[test]
    fn health_probe_accepts_only_the_launched_instance() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let port = listener.local_addr().expect("test address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request");
            let mut request = [0u8; 512];
            let size = stream.read(&mut request).expect("request body");
            assert!(String::from_utf8_lossy(&request[..size])
                .starts_with("GET /_shell/health HTTP/1.1"));
            let body = r#"{"instance":"other-process"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).expect("response");
        });
        assert!(!own_health(port, "our-process"));
        server.join().expect("server thread");
    }
}
