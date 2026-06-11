const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [100, 200, 400, 800, 1600];

export class TerminalWebSocket {
  private ws: WebSocket | null = null;
  private port: number;
  private token: string;
  private sessionId: string;
  private _onData: (bytes: Uint8Array) => void;
  private onStatusChange?: (connected: boolean) => void;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private encoder = new TextEncoder();

  constructor(
    port: number,
    token: string,
    sessionId: string,
    onData: (bytes: Uint8Array) => void,
    onStatusChange?: (connected: boolean) => void,
  ) {
    this.port = port;
    this.token = token;
    this.sessionId = sessionId;
    this._onData = onData;
    this.onStatusChange = onStatusChange;
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    try {
      const url = `ws://127.0.0.1:${this.port}/terminal/${this.sessionId}?token=${this.token}`;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.onStatusChange?.(true);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this._onData(new Uint8Array(event.data));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.onStatusChange?.(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };

      this.ws = ws;
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;
    const delay = RECONNECT_DELAYS[this.reconnectAttempt] ?? 1600;
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  set onData(cb: (bytes: Uint8Array) => void) {
    this._onData = cb;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.encoder.encode(data));
    }
  }

  sendResize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
