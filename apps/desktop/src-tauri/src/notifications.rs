// Request notifications and their two actions (T4.30). Decisions of 12 October 2026: « Voir » opens the full card and
// « Refuser » refuses; « Autoriser » never appears outside the full card, since a notification cuts the peer's text at
// 200 characters. There is no allow action anywhere in this file: the only types an action can become are `View` and
// `Deny`. « Refuser » goes to the node's `/ui/notification/deny`, the card's own decision path, which holds only while
// the request still waits (same identifier, not expired, not decided) and otherwise answers with a stable code.
//
// macOS shows them through the UserNotifications framework (UNUserNotificationCenter, documented and current), not
// NSUserNotification (deprecated since macOS 11, its extra buttons only reachable through private keys). Each
// notification keeps the default interruption level, `active`: it never breaks through a Focus mode. Windows and Linux
// show no notification yet (T3.7, T3.8, docs/RELEASE.md): the panel and `drop pending` remain their way in.
// Outside macOS the actions are therefore never reached, only compiled and unit-tested.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// The notification is about a decision (« X a besoin d'aide ») or a review before sending.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestKind {
    Approval,
    Review,
}

/// What an action on a notification may do. On purpose, nothing else: never allow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationAction {
    /// « Voir », or a click on the notification itself: the panel opens on the full card.
    View,
    /// « Refuser »: the node refuses the request, if it still waits.
    Deny,
}

/// A notification handed over by the daemon (`DROP_NOTIFY=shell`), its peer text already cut at 200 characters.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notice {
    pub title: String,
    pub body: String,
    /// The request it announces, when the daemon names one with a well-formed identifier.
    pub request: Option<(RequestKind, String)>,
}

pub const VIEW_ACTION: &str = "dev.memolabs.drop.view";
pub const DENY_ACTION: &str = "dev.memolabs.drop.deny";
/// The category of decision notifications: the only one with actions, « Voir » then « Refuser ».
pub const APPROVAL_CATEGORY: &str = "dev.memolabs.drop.approval";
/// Peer text longer than this is cut: the full text lives on the card.
pub const MAX_TEXT_CHARS: usize = 200;

/// A drop identifier as the node writes it (a lowercase UUID): anything else never reaches a URL or the node.
pub fn valid_drop_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
        })
}

/// One line of the daemon's stdout: `{"dropNotify":{"title","subtitle","dropId"?,"kind"?}}`. Anything else is ignored.
pub fn parse_notice(line: &str) -> Option<Notice> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    let notice = value.get("dropNotify")?;
    let text = |key: &str| {
        notice
            .get(key)
            .and_then(serde_json::Value::as_str)
            .map(|s| s.chars().take(MAX_TEXT_CHARS).collect::<String>())
    };
    let kind = match notice.get("kind").and_then(serde_json::Value::as_str) {
        Some("approval") => Some(RequestKind::Approval),
        Some("review") => Some(RequestKind::Review),
        _ => None,
    };
    let drop_id = notice
        .get("dropId")
        .and_then(serde_json::Value::as_str)
        .filter(|id| valid_drop_id(id))
        .map(str::to_string);
    Some(Notice {
        title: text("title")?,
        body: text("subtitle")?,
        request: kind.zip(drop_id),
    })
}

/// The system identifier of a notification: the request's kind and drop, so that a later action finds them again.
pub fn notification_identifier(request: &(RequestKind, String)) -> String {
    match request.0 {
        RequestKind::Approval => format!("approval:{}", request.1),
        RequestKind::Review => format!("review:{}", request.1),
    }
}

pub fn parse_identifier(identifier: &str) -> Option<(RequestKind, String)> {
    let (kind, id) = identifier.split_once(':')?;
    let kind = match kind {
        "approval" => RequestKind::Approval,
        "review" => RequestKind::Review,
        _ => return None,
    };
    valid_drop_id(id).then(|| (kind, id.to_string()))
}

/// What the owner's gesture means. `default_identifier` is the system's own name for a click on the notification.
/// « Refuser » means something only on a decision; a dismissal or any unknown identifier does nothing.
pub fn action_for(
    action_identifier: &str,
    default_identifier: &str,
    kind: Option<RequestKind>,
) -> Option<NotificationAction> {
    if action_identifier == VIEW_ACTION || action_identifier == default_identifier {
        return Some(NotificationAction::View);
    }
    if action_identifier == DENY_ACTION && kind == Some(RequestKind::Approval) {
        return Some(NotificationAction::Deny);
    }
    None
}

/// What the app does for an action: the shell's whole dispatch, kept free of window code so it can be tested.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Step {
    /// The panel on the full card of this request.
    OpenRequest(String),
    /// The panel where it was (a notification that names no request).
    OpenPanel,
    /// The node's refusal route for this decision.
    Deny(String),
    Nothing,
}

pub fn step_for(action: NotificationAction, request: Option<(RequestKind, String)>) -> Step {
    match (action, request) {
        (NotificationAction::View, Some((_, drop_id))) => Step::OpenRequest(drop_id),
        (NotificationAction::View, None) => Step::OpenPanel,
        (NotificationAction::Deny, Some((RequestKind::Approval, drop_id))) => Step::Deny(drop_id),
        (NotificationAction::Deny, _) => Step::Nothing,
    }
}

/// How the node answered a « Refuser ».
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DenyOutcome {
    Denied,
    /// The request no longer waits: E_NOT_PENDING or E_EXPIRED. Nothing was sent.
    Ignored(String),
    /// The node could not be reached or answered something else: the request may still wait.
    Failed(&'static str),
}

/// After a « Refuser »: the code to log, and whether to open the card. A refusal that did not apply opens the card,
/// so the owner sees why (« n'attend plus ») or that it still waits, instead of believing it was refused.
pub fn after_deny(outcome: &DenyOutcome) -> (Option<String>, bool) {
    match outcome {
        DenyOutcome::Denied => (None, false),
        DenyOutcome::Ignored(code) => (Some(code.clone()), true),
        DenyOutcome::Failed(code) => (Some((*code).to_string()), true),
    }
}

/// « Voir » on a panel already showing the node's page: the request goes in the address fragment, which the panel
/// reads without reloading, so a draft answer survives. Only a well-formed identifier reaches the script.
pub fn landing_script(drop_id: &str) -> Option<String> {
    valid_drop_id(drop_id).then(|| format!("window.location.hash = 'request={drop_id}';"))
}

/// The HTTP request for the node's local API: Host names this exact port, as the node requires.
pub fn deny_request(port: u16, token: &str, drop_id: &str) -> String {
    let body = serde_json::json!({ "dropId": drop_id }).to_string();
    format!(
        "POST /ui/notification/deny HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

pub fn deny_outcome(response: &str) -> DenyOutcome {
    let Some((head, body)) = response.split_once("\r\n\r\n") else {
        return DenyOutcome::Failed("E_NOTIFY_DENY");
    };
    if head.starts_with("HTTP/1.1 200 ") {
        return DenyOutcome::Denied;
    }
    if head.starts_with("HTTP/1.1 409 ") {
        let code = serde_json::from_str::<serde_json::Value>(body)
            .ok()
            .and_then(|json| {
                json.get("code")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string)
            });
        if let Some(code @ ("E_NOT_PENDING" | "E_EXPIRED")) = code.as_deref() {
            return DenyOutcome::Ignored(code.to_string());
        }
    }
    DenyOutcome::Failed("E_NOTIFY_DENY")
}

/// « Refuser »: one call to the node, the same decision path as the card's « Refuser ».
pub fn deny(port: u16, token: &str, drop_id: &str) -> DenyOutcome {
    if !valid_drop_id(drop_id) {
        return DenyOutcome::Failed("E_NOTIFY_DENY");
    }
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return DenyOutcome::Failed("E_NOTIFY_UNREACHABLE");
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    if stream
        .write_all(deny_request(port, token, drop_id).as_bytes())
        .is_err()
    {
        return DenyOutcome::Failed("E_NOTIFY_UNREACHABLE");
    }
    let mut response = String::new();
    if stream
        .take(16 * 1024)
        .read_to_string(&mut response)
        .is_err()
    {
        return DenyOutcome::Failed("E_NOTIFY_UNREACHABLE");
    }
    deny_outcome(&response)
}

#[cfg(target_os = "macos")]
pub mod mac {
    //! UNUserNotificationCenter: one category with « Voir » and « Refuser » (destructive), a delegate that turns each
    //! response into a `NotificationAction`, and nothing for a dismissal (the category asks for no dismiss action).
    use super::{
        action_for, notification_identifier, parse_identifier, Notice, NotificationAction,
        RequestKind, APPROVAL_CATEGORY, DENY_ACTION, VIEW_ACTION,
    };
    use block2::{DynBlock, RcBlock};
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AnyThread};
    use objc2_foundation::{NSArray, NSBundle, NSError, NSSet, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNMutableNotificationContent, UNNotification, UNNotificationAction,
        UNNotificationActionOptions, UNNotificationCategory, UNNotificationCategoryOptions,
        UNNotificationDefaultActionIdentifier, UNNotificationInterruptionLevel,
        UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
        UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use std::sync::OnceLock;

    type Handler = Box<dyn Fn(NotificationAction, Option<(RequestKind, String)>) + Send + Sync>;
    static HANDLER: OnceLock<Handler> = OnceLock::new();
    static READY: OnceLock<bool> = OnceLock::new();

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "DropNotificationDelegate"]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                completion: &DynBlock<dyn Fn()>,
            ) {
                let identifier = response.notification().request().identifier().to_string();
                let request = parse_identifier(&identifier);
                let default = unsafe { UNNotificationDefaultActionIdentifier }.to_string();
                let action = action_for(
                    &response.actionIdentifier().to_string(),
                    &default,
                    request.as_ref().map(|(kind, _)| *kind),
                );
                // The handler runs on its own thread: nothing that may block or panic runs inside this Objective-C
                // callback, and the system gets its completion at once. A thread that cannot start loses the action.
                if let (Some(action), Some(handler)) = (action, HANDLER.get()) {
                    let started = std::thread::Builder::new()
                        .name("drop-notification-action".into())
                        .spawn(move || handler(action, request));
                    if started.is_err() {
                        eprintln!("E_NOTIFY_ACTION the action could not start");
                    }
                }
                completion.call(());
            }

            // The app is an accessory with no Dock icon: a request arriving while its panel has the focus still shows.
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List
                    | UNNotificationPresentationOptions::Sound,));
            }
        }
    );

    /// UNUserNotificationCenter needs a real app bundle: `tauri dev` runs a bare binary, where the framework throws.
    fn bundled() -> bool {
        let bundle = NSBundle::mainBundle();
        bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
    }

    /// At launch, before any notification: the delegate, the category and the authorization request. False when the
    /// app runs outside a bundle; notifications are then skipped and logged.
    pub fn install(handler: Handler) -> bool {
        *READY.get_or_init(|| {
            if !bundled() {
                return false;
            }
            let _ = HANDLER.set(handler);
            let center = UNUserNotificationCenter::currentNotificationCenter();
            let delegate: Retained<Delegate> = unsafe { msg_send![Delegate::alloc(), init] };
            center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            // The center keeps a weak reference: the delegate lives as long as the app.
            std::mem::forget(delegate);
            let view = UNNotificationAction::actionWithIdentifier_title_options(
                &NSString::from_str(VIEW_ACTION),
                &NSString::from_str("Voir"),
                UNNotificationActionOptions::Foreground,
            );
            let deny = UNNotificationAction::actionWithIdentifier_title_options(
                &NSString::from_str(DENY_ACTION),
                &NSString::from_str("Refuser"),
                // From a locked Mac, the session must be unlocked first.
                UNNotificationActionOptions::Destructive
                    | UNNotificationActionOptions::AuthenticationRequired,
            );
            let category =
                UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
                    &NSString::from_str(APPROVAL_CATEGORY),
                    &NSArray::from_retained_slice(&[view, deny]),
                    &NSArray::new(),
                    UNNotificationCategoryOptions::empty(),
                );
            center.setNotificationCategories(&NSSet::from_retained_slice(&[category]));
            let answered = RcBlock::new(|granted: Bool, error: *mut NSError| {
                if !granted.as_bool() || !error.is_null() {
                    crate::log_error("E_NOTIFY_DENIED", "notifications not allowed by the user");
                }
            });
            center.requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
                &answered,
            );
            true
        })
    }

    /// Shows one notification; a decision carries the « Voir » and « Refuser » category, a review none.
    pub fn show(notice: &Notice, fallback_id: u64) {
        if READY.get() != Some(&true) {
            eprintln!("E_NOTIFY notifications unavailable outside the app bundle");
            return;
        }
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&notice.title));
        content.setBody(&NSString::from_str(&notice.body));
        content.setSound(Some(&UNNotificationSound::defaultSound()));
        // Never time-sensitive nor critical: a Focus mode keeps the notification for later (T4.30).
        content.setInterruptionLevel(UNNotificationInterruptionLevel::Active);
        if let Some((RequestKind::Approval, _)) = &notice.request {
            content.setCategoryIdentifier(&NSString::from_str(APPROVAL_CATEGORY));
        }
        let identifier = notice
            .request
            .as_ref()
            .map(notification_identifier)
            .unwrap_or_else(|| format!("notice:{fallback_id}"));
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&identifier),
            &content,
            None,
        );
        let delivered = RcBlock::new(|error: *mut NSError| {
            if !error.is_null() {
                eprintln!("E_NOTIFY the system refused the notification");
            }
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .addNotificationRequest_withCompletionHandler(&request, Some(&delivered));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    const DROP: &str = "0199c5a0-0000-7000-8000-000000000001";
    const DEFAULT: &str = "com.apple.UNNotificationDefaultActionIdentifier";

    #[test]
    fn notification_actions_only_view_or_deny_never_allow() {
        // Voir and a click open the card; Refuser refuses a decision only; everything else does nothing.
        assert_eq!(
            action_for(VIEW_ACTION, DEFAULT, Some(RequestKind::Approval)),
            Some(NotificationAction::View)
        );
        assert_eq!(
            action_for(DEFAULT, DEFAULT, Some(RequestKind::Review)),
            Some(NotificationAction::View)
        );
        assert_eq!(
            action_for(DEFAULT, DEFAULT, None),
            Some(NotificationAction::View)
        );
        assert_eq!(
            action_for(DENY_ACTION, DEFAULT, Some(RequestKind::Approval)),
            Some(NotificationAction::Deny)
        );
        assert_eq!(
            action_for(DENY_ACTION, DEFAULT, Some(RequestKind::Review)),
            None
        );
        assert_eq!(action_for(DENY_ACTION, DEFAULT, None), None);
        for other in [
            "com.apple.UNNotificationDismissActionIdentifier",
            "dev.memolabs.drop.allow",
            "allow_once",
            "",
        ] {
            assert_eq!(
                action_for(other, DEFAULT, Some(RequestKind::Approval)),
                None,
                "{other}"
            );
        }
    }

    #[test]
    fn notices_name_their_request_only_with_a_well_formed_identifier() {
        let line = format!(
            r#"{{"dropNotify":{{"title":"Julie a besoin d'aide","subtitle":"{}","dropId":"{DROP}","kind":"approval"}}}}"#,
            "x".repeat(300)
        );
        let notice = parse_notice(&line).expect("notice");
        assert_eq!(notice.body.chars().count(), MAX_TEXT_CHARS);
        assert_eq!(
            notice.request,
            Some((RequestKind::Approval, DROP.to_string()))
        );
        let identifier = notification_identifier(notice.request.as_ref().expect("request"));
        assert_eq!(
            parse_identifier(&identifier),
            Some((RequestKind::Approval, DROP.to_string()))
        );
        // The T4.14 line, without a request, still shows; a bad identifier or kind names no request.
        let plain = parse_notice(r#"{"dropNotify":{"title":"t","subtitle":"s"}}"#).expect("plain");
        assert_eq!(plain.request, None);
        for bad in [
            "../../ui/decide",
            "0199C5A0-0000-7000-8000-000000000001",
            "",
            &format!("{DROP}x"),
        ] {
            let line = format!(
                r#"{{"dropNotify":{{"title":"t","subtitle":"s","dropId":"{bad}","kind":"approval"}}}}"#
            );
            assert_eq!(parse_notice(&line).expect("notice").request, None, "{bad}");
            assert_eq!(parse_identifier(&format!("approval:{bad}")), None, "{bad}");
        }
        let unknown = format!(
            r#"{{"dropNotify":{{"title":"t","subtitle":"s","dropId":"{DROP}","kind":"allow"}}}}"#
        );
        assert_eq!(parse_notice(&unknown).expect("notice").request, None);
        assert_eq!(parse_notice("not json"), None);
        assert_eq!(parse_notice(r#"{"other":1}"#), None);
    }

    #[test]
    fn notification_steps_open_the_card_or_refuse_through_the_node() {
        let request = |kind| Some((kind, DROP.to_string()));
        assert_eq!(
            step_for(NotificationAction::View, request(RequestKind::Approval)),
            Step::OpenRequest(DROP.to_string())
        );
        assert_eq!(
            step_for(NotificationAction::View, request(RequestKind::Review)),
            Step::OpenRequest(DROP.to_string())
        );
        assert_eq!(step_for(NotificationAction::View, None), Step::OpenPanel);
        assert_eq!(
            step_for(NotificationAction::Deny, request(RequestKind::Approval)),
            Step::Deny(DROP.to_string())
        );
        assert_eq!(
            step_for(NotificationAction::Deny, request(RequestKind::Review)),
            Step::Nothing
        );
        assert_eq!(step_for(NotificationAction::Deny, None), Step::Nothing);
        // A refusal that applied stays silent; one that did not opens the card and logs its code.
        assert_eq!(after_deny(&DenyOutcome::Denied), (None, false));
        assert_eq!(
            after_deny(&DenyOutcome::Ignored("E_EXPIRED".to_string())),
            (Some("E_EXPIRED".to_string()), true)
        );
        assert_eq!(
            after_deny(&DenyOutcome::Failed("E_NOTIFY_UNREACHABLE")),
            (Some("E_NOTIFY_UNREACHABLE".to_string()), true)
        );
        // « Voir » on a loaded panel only changes its fragment, and only for a well-formed identifier.
        assert_eq!(
            landing_script(DROP).as_deref(),
            Some("window.location.hash = 'request=0199c5a0-0000-7000-8000-000000000001';")
        );
        assert_eq!(landing_script("x';alert(1);'"), None);
    }

    /// A one-shot local server that checks the request and answers `status` with `body`.
    fn node_answering(
        status: &'static str,
        body: &'static str,
    ) -> (u16, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
        let port = listener.local_addr().expect("address").port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request");
            let mut request = [0u8; 2048];
            let size = stream.read(&mut request).expect("read");
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).expect("write");
            String::from_utf8_lossy(&request[..size]).into_owned()
        });
        (port, server)
    }

    #[test]
    fn deny_goes_to_the_node_refusal_route_and_reads_its_stable_codes() {
        let (port, server) = node_answering("200 OK", r#"{"ok":true}"#);
        assert_eq!(deny(port, "secret-token", DROP), DenyOutcome::Denied);
        let sent = server.join().expect("server");
        assert!(sent.starts_with("POST /ui/notification/deny HTTP/1.1\r\n"));
        assert!(sent.contains(&format!("Host: 127.0.0.1:{port}\r\n")));
        assert!(sent.contains("Authorization: Bearer secret-token\r\n"));
        // The body names the drop and nothing else: no decision travels, the route can only refuse.
        assert!(sent.ends_with(&format!(r#"{{"dropId":"{DROP}"}}"#)));
        assert!(!sent.contains("allow"));

        let (port, server) = node_answering("409 Conflict", r#"{"ok":false,"code":"E_EXPIRED"}"#);
        assert_eq!(
            deny(port, "t", DROP),
            DenyOutcome::Ignored("E_EXPIRED".to_string())
        );
        server.join().expect("server");
        let (port, server) =
            node_answering("409 Conflict", r#"{"ok":false,"code":"E_NOT_PENDING"}"#);
        assert_eq!(
            deny(port, "t", DROP),
            DenyOutcome::Ignored("E_NOT_PENDING".to_string())
        );
        server.join().expect("server");
        let (port, server) = node_answering("401 Unauthorized", r#"{"error":"unauthorized"}"#);
        assert_eq!(deny(port, "t", DROP), DenyOutcome::Failed("E_NOTIFY_DENY"));
        server.join().expect("server");
        // A malformed identifier never leaves the app.
        assert_eq!(
            deny(1, "t", "../ui/decide"),
            DenyOutcome::Failed("E_NOTIFY_DENY")
        );
    }
}
