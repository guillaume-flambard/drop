// drop for macOS (T2.4, D26): a menu bar icon, the node daemon running in the background, and the panel the daemon
// serves on 127.0.0.1, shown in a small window under the icon. The app holds no logic of its own: everything the panel
// does goes through the node's local API, protected by its token.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{ActivationPolicy, AppHandle, Manager, PhysicalPosition, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

const RELAY: &str = "wss://drop.memolabs.dev/v1";
const PANEL_WIDTH: f64 = 380.0;
const PANEL_HEIGHT: f64 = 620.0;

struct Daemon(Mutex<Option<Child>>);

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
    command.arg(resources.join("drop.mjs")).args(args).env("DROP_HOME", drop_home());
    command
}

/// First launch: an identity named after the Mac's user, on the public relay. Joining a team comes with an invite link.
fn ensure_identity(app: &AppHandle) {
    if drop_home().join("identity.json").exists() {
        return;
    }
    let full_name = Command::new("id")
        .arg("-F")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Moi".to_string());
    let first_name = full_name.split_whitespace().next().unwrap_or("Moi").to_string();
    let _ = drop_command(app, &["init", "--name", &first_name, "--kind", "human", "--relay", RELAY])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn start_daemon(app: &AppHandle) {
    let log = fs::File::create(drop_home().join("daemon.log")).ok();
    let mut command = drop_command(app, &["serve"]);
    command.stdout(Stdio::null());
    if let Some(file) = log {
        command.stderr(file);
    } else {
        command.stderr(Stdio::null());
    }
    if let Ok(child) = command.spawn() {
        *app.state::<Daemon>().0.lock().unwrap() = Some(child);
    }
}

fn api_port() -> u16 {
    fs::read_to_string(drop_home().join("config.json"))
        .ok()
        .and_then(|text| {
            let key = "\"apiPort\":";
            let start = text.find(key)? + key.len();
            text[start..].trim_start().split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()
        })
        .unwrap_or(7781)
}

fn panel_url(extra: &[(&str, String)]) -> Option<Url> {
    let token = fs::read_to_string(drop_home().join("local-token")).ok()?;
    let mut url = Url::parse(&format!("http://127.0.0.1:{}/app", api_port())).ok()?;
    url.query_pairs_mut().append_pair("token", token.trim());
    for (key, value) in extra {
        url.query_pairs_mut().append_pair(key, value);
    }
    Some(url)
}

fn wait_for_daemon() -> bool {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", api_port())).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn show_panel(app: &AppHandle, near: Option<PhysicalPosition<f64>>) {
    let Some(window) = app.get_webview_window("panel") else { return };
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

/// `drop://pair?code=…` joins a team; `drop://link?session=…&gateway=…&client=…` asks to link an assistant such as
/// Claude or ChatGPT (T2.13). Either way the panel opens with the request and the user decides there.
fn open_links(app: &AppHandle, urls: Vec<Url>) {
    for link in urls {
        if link.scheme() != "drop" {
            continue;
        }
        let param = |name: &str| link.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned());
        let extra: Vec<(&str, String)> = match link.host_str() {
            Some("pair") => param("code").map(|code| vec![("pair", code)]).unwrap_or_default(),
            Some("link") => match (param("session"), param("gateway")) {
                (Some(session), Some(gateway)) => vec![
                    ("link", session),
                    ("gateway", gateway),
                    ("client", param("client").unwrap_or_else(|| "Un assistant".to_string())),
                ],
                _ => vec![],
            },
            _ => vec![],
        };
        if extra.is_empty() {
            continue;
        }
        if let (Some(window), Some(url)) = (app.get_webview_window("panel"), panel_url(&extra)) {
            let _ = window.navigate(url);
            show_panel(app, None);
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(Daemon(Mutex::new(None)))
        .setup(|app| {
            app.set_activation_policy(ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            ensure_identity(&handle);
            start_daemon(&handle);

            let window = WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("index.html".into()))
                .title("drop")
                .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .build()?;
            let hide_on_blur = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = hide_on_blur.hide();
                }
            });

            let ready = handle.clone();
            thread::spawn(move || {
                if wait_for_daemon() {
                    if let (Some(window), Some(url)) = (ready.get_webview_window("panel"), panel_url(&[])) {
                        let _ = window.navigate(url);
                    }
                }
            });

            let open = MenuItem::with_id(app, "open", "Ouvrir drop", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter drop", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("drop")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_panel(app, None),
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
            app.deep_link().on_open_url(move |event| open_links(&links, event.urls()));
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
            if let Some(mut child) = handle.state::<Daemon>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
