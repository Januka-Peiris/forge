use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;

use tungstenite::protocol::Message;
use tungstenite::WebSocket;
use tungstenite::http::Response as HttpResponse;

use crate::services::terminal_service;
use crate::state::AppState;

const WS_WRITE_CHANNEL_BOUND: usize = 256;

pub fn start_ws_server(state: AppState) -> Result<(u16, String), String> {
    let token = generate_token();
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind WS listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get WS port: {e}"))?
        .port();

    log::info!(target: "mnemonic_lib", "Terminal WebSocket server listening on 127.0.0.1:{port}");

    let expected_token = token.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            let stream = match stream {
                Ok(s) => s,
                Err(e) => {
                    log::warn!(target: "mnemonic_lib", "WS accept error: {e}");
                    continue;
                }
            };
            let state = state.clone();
            let expected_token = expected_token.clone();
            thread::spawn(move || {
                if let Err(e) = handle_connection(stream, &state, &expected_token) {
                    log::debug!(target: "mnemonic_lib", "WS connection ended: {e}");
                }
            });
        }
    });

    Ok((port, token))
}

fn generate_token() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn handle_connection(
    stream: TcpStream,
    state: &AppState,
    expected_token: &str,
) -> Result<(), String> {
    use std::sync::Mutex as StdMutex;

    let parsed = StdMutex::new(None::<(String, String)>);
    let parsed_ref = &parsed;

    let callback = |req: &tungstenite::handshake::server::Request,
                     response: tungstenite::handshake::server::Response|
        -> Result<tungstenite::handshake::server::Response, HttpResponse<Option<String>>>
    {
        let uri = req.uri().to_string();
        let (sid, tok) = parse_ws_uri(&uri);
        if let Ok(mut p) = parsed_ref.lock() {
            *p = Some((sid, tok));
        }
        Ok(response)
    };

    let write_stream = stream
        .try_clone()
        .map_err(|e| format!("Failed to clone TcpStream: {e}"))?;

    let mut read_ws = tungstenite::accept_hdr(stream, callback)
        .map_err(|e| format!("WS handshake failed: {e}"))?;

    let (session_id, token) = parsed
        .lock()
        .ok()
        .and_then(|p| p.clone())
        .ok_or_else(|| "Failed to parse WS request".to_string())?;

    if token != expected_token {
        let _ = read_ws.close(None);
        return Err("Invalid token".to_string());
    }

    if session_id.is_empty() {
        let _ = read_ws.close(None);
        return Err("Missing session_id".to_string());
    }

    let active = crate::services::terminal_service::runtime::active_for_session(state, &session_id)?
        .ok_or_else(|| format!("Session {session_id} not found or not active"))?;

    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(WS_WRITE_CHANNEL_BOUND);

    // Register this connection's sender in the WS connections registry.
    {
        let mut conns = state
            .ws_connections
            .lock()
            .map_err(|_| "WS connections lock poisoned".to_string())?;
        conns.entry(session_id.clone()).or_default().push(tx.clone());
    }

    // Writer thread: drains the channel and sends binary WS frames.
    let writer_session_id = session_id.clone();
    let ws_conns_for_cleanup = state.ws_connections.clone();
    let writer_handle = thread::spawn(move || {
        let mut write_ws = WebSocket::from_raw_socket(write_stream, tungstenite::protocol::Role::Server, None);
        for bytes in rx {
            if write_ws.send(Message::Binary(bytes)).is_err() {
                break;
            }
        }
        let _ = write_ws.close(None);
        // Cleanup: remove this sender from the registry.
        // (The tx is already dropped when the channel disconnects.)
        if let Ok(mut conns) = ws_conns_for_cleanup.lock() {
            if let Some(senders) = conns.get_mut(&writer_session_id) {
                senders.retain(|s| !s.send(Vec::new()).is_err());
                if senders.is_empty() {
                    conns.remove(&writer_session_id);
                }
            }
        }
    });

    // Reader loop: reads WS frames and writes to PTY.
    loop {
        let msg = match read_ws.read() {
            Ok(m) => m,
            Err(_) => break,
        };
        match msg {
            Message::Binary(data) => {
                if let Ok(mut writer) = active.writer.lock() {
                    let _ = writer.write_all(&data);
                    let _ = writer.flush();
                }
            }
            Message::Text(text) => {
                handle_control_message(&text, state, &session_id);
            }
            Message::Close(_) => break,
            Message::Ping(data) => {
                let _ = read_ws.send(Message::Pong(data));
            }
            _ => {}
        }
    }

    // Clean up: remove sender from registry and signal writer to stop.
    drop(tx);
    {
        if let Ok(mut conns) = state.ws_connections.lock() {
            if let Some(senders) = conns.get_mut(&session_id) {
                senders.retain(|s| s.send(Vec::new()).is_ok());
                if senders.is_empty() {
                    conns.remove(&session_id);
                }
            }
        }
    }
    let _ = writer_handle.join();

    Ok(())
}

fn handle_control_message(text: &str, state: &AppState, session_id: &str) {
    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) {
        if msg.get("type").and_then(|v| v.as_str()) == Some("resize") {
            let cols = msg.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let rows = msg.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            let _ = terminal_service::resize_workspace_terminal_session(state, session_id, cols, rows);
        }
    }
}

fn parse_ws_uri(uri: &str) -> (String, String) {
    let path = uri.split('?').next().unwrap_or("");
    let session_id = path
        .strip_prefix("/terminal/")
        .unwrap_or("")
        .to_string();

    let token = uri
        .split('?')
        .nth(1)
        .and_then(|query| {
            query.split('&').find_map(|param| {
                param.strip_prefix("token=").map(|v| v.to_string())
            })
        })
        .unwrap_or_default();

    (session_id, token)
}
