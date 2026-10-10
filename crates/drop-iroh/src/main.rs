//! drop-iroh: drop's Internet path (T4.2b, D68).
//!
//! One iroh endpoint with the `Minimal` preset: no address lookup, no relay unless the owner chose one, no port
//! mapping, and the system DNS only (never public fallback resolvers). The drop daemon drives it over stdin and
//! stdout, one JSON object per line. The first line carries the key seed, so the secret never shows in the process
//! arguments or environment. The endpoint id is the drop node id: iroh derives the same Ed25519 public key from the
//! seed as libsodium.
//!
//! One bidirectional QUIC stream per envelope: a 4-byte length, the envelope, then the receiver's acknowledgement.
//! This program never signs anything with the drop key: the receiving daemon signs the acknowledgement, the sending
//! daemon verifies it. A connection serves both directions, so a node that dialed can be answered without knowing its
//! address. Connections from a node that is neither a peer nor pairing during a live invite are closed before any
//! stream is read, and closed again when that node stops being accepted. Closing stdin stops the program.

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use iroh::dns::{DnsResolver, FallbackMode};
use iroh::endpoint::{
    Connection, PortmapperConfig, QuicTransportConfig, RecvStream, SendStream, VarInt, presets,
};
use iroh::{
    Endpoint, EndpointAddr, EndpointId, PublicKey, RelayMode, RelayUrl, SecretKey, TransportAddr,
    Watcher,
};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{Mutex, RwLock, mpsc, oneshot};

const ALPN: &[u8] = b"drop/1";
/// The largest envelope drop sends (the relay's limit).
const MAX_ENVELOPE: usize = 256 * 1024;
const MAX_ACK: usize = 1024;
const MAX_DIRECT: usize = 8;
const MAX_CONNECTIONS: usize = 64;
/// Nodes that are not peers yet, connected while an invite is live: a few pairings at once, no more.
const MAX_STRANGERS: usize = 4;
const MAX_HANDSHAKES: usize = 16;
/// Envelopes in flight on one connection: drop sends them one after the other.
const MAX_STREAMS: u32 = 8;
const MAX_PENDING_REPLIES: usize = 256;
/// Lines waiting for the daemon to read them; past this, the program waits rather than grow.
const MAX_OUTPUT_QUEUE: usize = 1024;
/// One stdin line: a send command carries an envelope, escaped as a JSON string.
const MAX_LINE: usize = 2 * MAX_ENVELOPE + 4096;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const STREAM_TIMEOUT: Duration = Duration::from_secs(15);
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
enum Input {
    Init {
        seed: String,
        relay: Option<String>,
        peers: Vec<String>,
        #[serde(default)]
        open: bool,
        /// How long to try a path before giving up; the daemon's tests shorten it.
        connect_ms: Option<u64>,
    },
    Peers {
        list: Vec<String>,
        #[serde(default)]
        open: bool,
    },
    Send {
        req: u64,
        to: String,
        addr: Addr,
        envelope: String,
    },
    Reply {
        rid: u64,
        ack: Option<String>,
    },
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
struct Addr {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    relay: Option<String>,
    #[serde(default)]
    direct: Vec<String>,
}

#[derive(Serialize)]
#[serde(tag = "t", rename_all = "lowercase")]
enum Output {
    Ready {
        id: String,
        addr: Addr,
    },
    Addr {
        addr: Addr,
    },
    Env {
        rid: u64,
        from: String,
        envelope: String,
    },
    Sent {
        req: u64,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        ack: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<&'static str>,
    },
    Error {
        code: &'static str,
        message: String,
    },
}

struct State {
    endpoint: Endpoint,
    out: mpsc::Sender<Output>,
    peers: RwLock<HashSet<EndpointId>>,
    /// While one of the owner's invites is live, an unknown node may connect to pair (D60); the daemon checks the token.
    open: AtomicBool,
    /// Relays this node may contact: the one the owner chose, never one a peer names.
    relays: HashSet<RelayUrl>,
    /// One live connection per node, dialed or accepted; both directions use it.
    connections: Mutex<HashMap<EndpointId, Connection>>,
    replies: Mutex<HashMap<u64, oneshot::Sender<Option<String>>>>,
    next_rid: AtomicU64,
    handshakes: AtomicUsize,
    connect_timeout: Duration,
}

fn node_id(id: &EndpointId) -> String {
    URL_SAFE_NO_PAD.encode(id.as_bytes())
}

fn parse_node_id(text: &str) -> Option<EndpointId> {
    let bytes: [u8; 32] = URL_SAFE_NO_PAD.decode(text).ok()?.try_into().ok()?;
    PublicKey::from_bytes(&bytes).ok()
}

/// An address that is worth giving to a peer or dialing: not link-local, loopback, unspecified or multicast.
fn routable(addr: &SocketAddr) -> bool {
    let ip = addr.ip();
    let link_local = match addr {
        SocketAddr::V4(v4) => v4.ip().is_link_local(),
        SocketAddr::V6(v6) => (v6.ip().segments()[0] & 0xffc0) == 0xfe80,
    };
    !link_local
        && !ip.is_loopback()
        && !ip.is_unspecified()
        && !ip.is_multicast()
        && addr.port() != 0
}

fn addr_of(addr: &EndpointAddr) -> Addr {
    let mut out = Addr::default();
    for transport in &addr.addrs {
        match transport {
            TransportAddr::Relay(url) if out.relay.is_none() => out.relay = Some(url.to_string()),
            TransportAddr::Ip(ip) if out.direct.len() < MAX_DIRECT && routable(ip) => {
                out.direct.push(ip.to_string())
            }
            _ => {}
        }
    }
    out
}

fn relay_mode(choice: Option<&str>) -> Result<RelayMode, String> {
    match choice {
        None => Ok(RelayMode::Disabled),
        Some("n0") => Ok(RelayMode::Default),
        Some(url) => RelayUrl::from_str(url)
            .map(|url| RelayMode::custom([url]))
            .map_err(|e| e.to_string()),
    }
}

async fn emit(state: &State, output: Output) {
    let _ = state.out.send(output).await;
}

#[tokio::main]
async fn main() {
    let (out, mut rx) = mpsc::channel::<Output>(MAX_OUTPUT_QUEUE);
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(output) = rx.recv().await {
            let Ok(mut line) = serde_json::to_vec(&output) else {
                continue;
            };
            line.push(b'\n');
            if stdout.write_all(&line).await.is_err() || stdout.flush().await.is_err() {
                break;
            }
        }
    });
    let code = run(out.clone()).await;
    drop(out);
    // Spawned tasks still hold senders: flush what is queued, briefly, then leave.
    let _ = tokio::time::timeout(Duration::from_secs(1), writer).await;
    std::process::exit(code);
}

/// Reads one line of at most `MAX_LINE` bytes. `Some(false)`: the line was longer and has been skipped whole.
async fn read_line(lines: &mut BufReader<tokio::io::Stdin>, buf: &mut Vec<u8>) -> Option<bool> {
    buf.clear();
    let mut limited = (&mut *lines).take(MAX_LINE as u64 + 1);
    match limited.read_until(b'\n', buf).await {
        Ok(0) | Err(_) => return None,
        Ok(_) => {}
    }
    if buf.len() <= MAX_LINE {
        return Some(true);
    }
    while buf.last() != Some(&b'\n') {
        buf.clear();
        let mut limited = (&mut *lines).take(MAX_LINE as u64);
        match limited.read_until(b'\n', buf).await {
            Ok(0) | Err(_) => return None,
            Ok(_) => {}
        }
    }
    Some(false)
}

async fn run(out: mpsc::Sender<Output>) -> i32 {
    let mut stdin = BufReader::new(tokio::io::stdin());
    let mut buf = Vec::new();
    let fail = async |code: &'static str, message: String| {
        let _ = out.send(Output::Error { code, message }).await;
        2
    };
    let Some(true) = read_line(&mut stdin, &mut buf).await else {
        return fail("E_SCHEMA", "the first line must be init".into()).await;
    };
    let Ok(Input::Init {
        seed,
        relay,
        peers,
        open,
        connect_ms,
    }) = serde_json::from_slice::<Input>(&buf)
    else {
        return fail("E_SCHEMA", "the first line must be init".into()).await;
    };
    let Some(seed) = URL_SAFE_NO_PAD
        .decode(&seed)
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
    else {
        return fail("E_SCHEMA", "the seed must be 32 bytes in base64url".into()).await;
    };
    let mode = match relay_mode(relay.as_deref()) {
        Ok(mode) => mode,
        Err(message) => return fail("E_IROH_RELAY", message).await,
    };
    let relays: HashSet<RelayUrl> = mode.relay_map().urls::<Vec<_>>().into_iter().collect();
    // The system resolvers only: a relay's name must never leak to public resolvers when they time out.
    let dns = DnsResolver::builder()
        .with_system_defaults()
        .with_fallback_mode(FallbackMode::Never)
        .build();
    let transport = QuicTransportConfig::builder()
        .max_concurrent_bidi_streams(VarInt::from_u32(MAX_STREAMS))
        .max_concurrent_uni_streams(VarInt::from_u32(0))
        .build();
    let endpoint = match Endpoint::builder(presets::Minimal)
        .secret_key(SecretKey::from_bytes(&seed))
        .relay_mode(mode)
        .dns_resolver(dns)
        .portmapper_config(PortmapperConfig::Disabled)
        .transport_config(transport)
        .alpns(vec![ALPN.to_vec()])
        .bind()
        .await
    {
        Ok(endpoint) => endpoint,
        Err(error) => return fail("E_IROH_BIND", error.to_string()).await,
    };
    let state = Arc::new(State {
        endpoint: endpoint.clone(),
        out: out.clone(),
        peers: RwLock::new(peers.iter().filter_map(|id| parse_node_id(id)).collect()),
        open: AtomicBool::new(open),
        relays,
        connections: Mutex::new(HashMap::new()),
        replies: Mutex::new(HashMap::new()),
        next_rid: AtomicU64::new(1),
        handshakes: AtomicUsize::new(0),
        connect_timeout: connect_ms.map_or(CONNECT_TIMEOUT, |ms| {
            Duration::from_millis(ms.clamp(500, 30_000))
        }),
    });
    if !state.relays.is_empty() {
        // The home relay is part of the address peers need; wait a little for it, never forever.
        let _ = tokio::time::timeout(Duration::from_secs(5), endpoint.online()).await;
    }
    let mut current = addr_of(&endpoint.addr());
    emit(
        &state,
        Output::Ready {
            id: node_id(&endpoint.id()),
            addr: current.clone(),
        },
    )
    .await;

    tokio::spawn({
        let state = state.clone();
        async move {
            let mut watcher = state.endpoint.watch_addr();
            while let Ok(addr) = watcher.updated().await {
                let addr = addr_of(&addr);
                if addr != current {
                    current = addr.clone();
                    emit(&state, Output::Addr { addr }).await;
                }
            }
        }
    });
    tokio::spawn({
        let state = state.clone();
        async move {
            accept_loop(state.clone()).await;
            // The endpoint is gone: say so and leave, the daemon starts the program again.
            emit(
                &state,
                Output::Error {
                    code: "E_IROH_EXIT",
                    message: "the endpoint stopped accepting connections".into(),
                },
            )
            .await;
            tokio::time::sleep(Duration::from_millis(200)).await;
            std::process::exit(3);
        }
    });

    loop {
        match read_line(&mut stdin, &mut buf).await {
            None => break,
            Some(false) => {
                emit(
                    &state,
                    Output::Error {
                        code: "E_SCHEMA",
                        message: "line too long".into(),
                    },
                )
                .await;
                continue;
            }
            Some(true) => {}
        }
        match serde_json::from_slice::<Input>(&buf) {
            Ok(Input::Peers { list, open }) => {
                let list: HashSet<EndpointId> =
                    list.iter().filter_map(|id| parse_node_id(id)).collect();
                *state.peers.write().await = list.clone();
                state.open.store(open, Ordering::Relaxed);
                // A node no longer accepted loses its connection, dialed or accepted: removed peers, and strangers once
                // the invite is over.
                state.connections.lock().await.retain(|id, connection| {
                    let keep = open || list.contains(id);
                    if !keep {
                        connection.close(1u32.into(), b"not a peer");
                    }
                    keep
                });
            }
            Ok(Input::Send {
                req,
                to,
                addr,
                envelope,
            }) => {
                tokio::spawn(send(state.clone(), req, to, addr, envelope));
            }
            Ok(Input::Reply { rid, ack }) => {
                if let Some(reply) = state.replies.lock().await.remove(&rid) {
                    let _ = reply.send(ack);
                }
            }
            Ok(Input::Init { .. }) | Err(_) => {
                emit(
                    &state,
                    Output::Error {
                        code: "E_SCHEMA",
                        message: "unexpected line".into(),
                    },
                )
                .await;
            }
        }
    }
    let _ = tokio::time::timeout(Duration::from_secs(2), endpoint.close()).await;
    0
}

/// Builds the address to dial: the peer's routable direct addresses, and its relay only when it is one this node uses.
fn dial_addr(state: &State, id: EndpointId, addr: &Addr) -> EndpointAddr {
    let relay = addr
        .relay
        .as_deref()
        .and_then(|url| RelayUrl::from_str(url).ok())
        .filter(|url| state.relays.contains(url))
        .map(TransportAddr::Relay);
    let direct = addr
        .direct
        .iter()
        .take(MAX_DIRECT)
        .filter_map(|text| SocketAddr::from_str(text).ok())
        .filter(routable)
        .map(TransportAddr::Ip);
    EndpointAddr::from_parts(id, relay.into_iter().chain(direct))
}

/// A paired peer or a pairing in progress, or anyone while an invite is live.
async fn accepts(state: &State, peer: &EndpointId) -> bool {
    state.open.load(Ordering::Relaxed) || state.peers.read().await.contains(peer)
}

/// Keeps a connection as the one for that node and serves the streams the other side opens on it.
async fn adopt(state: Arc<State>, peer: EndpointId, connection: Connection) {
    let previous = state
        .connections
        .lock()
        .await
        .insert(peer, connection.clone());
    if let Some(previous) = previous
        && previous.stable_id() != connection.stable_id()
    {
        // Both sides dialed at once: let what is in flight on the older one finish, then close it.
        tokio::spawn(async move {
            tokio::time::sleep(STREAM_TIMEOUT + Duration::from_secs(5)).await;
            previous.close(0u32.into(), b"replaced");
        });
    }
    tokio::spawn(async move {
        while let Ok((tx, rx)) = connection.accept_bi().await {
            tokio::spawn(receive(state.clone(), peer, tx, rx));
        }
        let mut connections = state.connections.lock().await;
        if connections
            .get(&peer)
            .is_some_and(|kept| kept.stable_id() == connection.stable_id())
        {
            connections.remove(&peer);
        }
    });
}

async fn connection(
    state: &Arc<State>,
    id: EndpointId,
    addr: &Addr,
) -> Result<Connection, &'static str> {
    if let Some(open) = state.connections.lock().await.get(&id)
        && open.close_reason().is_none()
    {
        return Ok(open.clone());
    }
    let target = dial_addr(state, id, addr);
    if target.addrs.is_empty() {
        return Err("E_IROH_NO_PATH");
    }
    let connected =
        tokio::time::timeout(state.connect_timeout, state.endpoint.connect(target, ALPN))
            .await
            .map_err(|_| "E_IROH_NO_PATH")?
            .map_err(|_| "E_IROH_NO_PATH")?;
    if connected.remote_id() != id {
        connected.close(1u32.into(), b"identity");
        return Err("E_IROH_IDENTITY");
    }
    adopt(state.clone(), id, connected.clone()).await;
    Ok(connected)
}

async fn send(state: Arc<State>, req: u64, to: String, addr: Addr, envelope: String) {
    let result = async {
        let id = parse_node_id(&to).ok_or("E_SCHEMA")?;
        if !state.peers.read().await.contains(&id) {
            return Err("E_IROH_NOT_PEER");
        }
        if envelope.len() > MAX_ENVELOPE {
            return Err("E_IROH_TOO_LARGE");
        }
        let connected = connection(&state, id, &addr).await?;
        let exchange = async {
            let (mut tx, mut rx) = connected.open_bi().await.map_err(|_| "E_IROH_CLOSED")?;
            tx.write_all(&(envelope.len() as u32).to_be_bytes())
                .await
                .map_err(|_| "E_IROH_CLOSED")?;
            tx.write_all(envelope.as_bytes())
                .await
                .map_err(|_| "E_IROH_CLOSED")?;
            tx.finish().map_err(|_| "E_IROH_CLOSED")?;
            let ack = rx
                .read_to_end(MAX_ACK)
                .await
                .map_err(|_| "E_IROH_REFUSED")?;
            if ack.is_empty() {
                return Err("E_IROH_REFUSED");
            }
            String::from_utf8(ack).map_err(|_| "E_IROH_REFUSED")
        };
        let outcome = tokio::time::timeout(STREAM_TIMEOUT, exchange)
            .await
            .map_err(|_| "E_IROH_TIMEOUT")?;
        if outcome.is_err() {
            // A broken connection is not reused for the next envelope.
            let mut connections = state.connections.lock().await;
            if connections
                .get(&id)
                .is_some_and(|kept| kept.stable_id() == connected.stable_id())
            {
                connections.remove(&id);
            }
        }
        outcome
    }
    .await;
    let output = match result {
        Ok(ack) => Output::Sent {
            req,
            ok: true,
            ack: Some(ack),
            code: None,
        },
        Err(code) => Output::Sent {
            req,
            ok: false,
            ack: None,
            code: Some(code),
        },
    };
    emit(&state, output).await;
}

struct Handshake<'a>(&'a AtomicUsize);

impl Drop for Handshake<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

async fn accept_loop(state: Arc<State>) {
    while let Some(incoming) = state.endpoint.accept().await {
        // Handshakes are bounded before any work: a flood of Initials cannot grow tasks without limit.
        if state.handshakes.fetch_add(1, Ordering::Relaxed) >= MAX_HANDSHAKES
            || state.connections.lock().await.len() >= MAX_CONNECTIONS
        {
            state.handshakes.fetch_sub(1, Ordering::Relaxed);
            incoming.refuse();
            continue;
        }
        let state = state.clone();
        tokio::spawn(async move {
            let accepted = {
                let _slot = Handshake(&state.handshakes);
                tokio::time::timeout(state.connect_timeout, incoming).await
            };
            let Ok(Ok(connected)) = accepted else {
                return;
            };
            let peer = connected.remote_id();
            if !accepts(&state, &peer).await {
                connected.close(1u32.into(), b"not a peer");
                return;
            }
            if !state.peers.read().await.contains(&peer) {
                let peers = state.peers.read().await.clone();
                let strangers = state
                    .connections
                    .lock()
                    .await
                    .keys()
                    .filter(|id| !peers.contains(*id))
                    .count();
                if strangers >= MAX_STRANGERS {
                    connected.close(1u32.into(), b"busy");
                    return;
                }
            }
            adopt(state, peer, connected).await;
        });
    }
}

async fn receive(state: Arc<State>, peer: EndpointId, mut tx: SendStream, mut rx: RecvStream) {
    let read = async {
        let mut len = [0u8; 4];
        rx.read_exact(&mut len).await.ok()?;
        let len = u32::from_be_bytes(len) as usize;
        if len == 0 || len > MAX_ENVELOPE {
            return None;
        }
        // Read as it comes, never sized from the announced length: a short stream costs only what it sent.
        let body = rx.read_to_end(len).await.ok()?;
        if body.len() != len {
            return None;
        }
        String::from_utf8(body).ok()
    };
    let Ok(Some(envelope)) = tokio::time::timeout(STREAM_TIMEOUT, read).await else {
        let _ = tx.finish();
        return;
    };
    // Still accepted once the envelope is in: removal while reading wins.
    if !accepts(&state, &peer).await {
        let _ = tx.finish();
        return;
    }
    let rid = state.next_rid.fetch_add(1, Ordering::Relaxed);
    let (reply, answer) = oneshot::channel();
    {
        let mut replies = state.replies.lock().await;
        if replies.len() >= MAX_PENDING_REPLIES {
            drop(replies);
            let _ = tx.finish();
            return;
        }
        replies.insert(rid, reply);
    }
    emit(
        &state,
        Output::Env {
            rid,
            from: node_id(&peer),
            envelope,
        },
    )
    .await;
    let ack = tokio::time::timeout(REPLY_TIMEOUT, answer)
        .await
        .ok()
        .and_then(Result::ok)
        .flatten();
    state.replies.lock().await.remove(&rid);
    if let Some(ack) = ack.filter(|ack| ack.len() <= MAX_ACK) {
        let _ = tx.write_all(ack.as_bytes()).await;
    }
    let _ = tx.finish();
    // Let the acknowledgement reach the sender before the stream is dropped.
    let _ = tokio::time::timeout(Duration::from_secs(2), tx.stopped()).await;
}
