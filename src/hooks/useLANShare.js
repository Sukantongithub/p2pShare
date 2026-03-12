/**
 * useLANShare — LAN Turbo Mode WebRTC P2P file transfer hook
 *
 * How it differs from useBusyShare:
 *  - Detects local network via ICE host candidates (192.168.x.x / 10.x.x.x / 172.16–31.x.x)
 *  - LAN mode  → 6 parallel data channels, 512 KB chunks, 16 MB buffer high-water mark
 *  - WAN mode  → 4 parallel data channels, adaptive chunks (128 KB default), 8 MB buffer
 *  - Multi-channel reassembly: every binary chunk is prefixed with a 4-byte seq number
 *  - Uses separate "lan:*" socket events — does NOT touch BusyShare at all
 *
 * Transfer protocol
 * ─────────────────
 *  Channel 0 (control, ordered):
 *    TX → { type: 'meta', name, size, mimeType }
 *    TX → { type: 'done', totalChunks }
 *  Any channel (binary):
 *    TX → [4 bytes big-endian seq] + [raw chunk bytes]
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io as socketIO } from "socket.io-client";
import { useAuth } from "./useAuth";

// ── Channel configuration ─────────────────────────────────────────────────
const LAN_CHANNEL_COUNT = 6; // active channels in LAN mode
const WAN_CHANNEL_COUNT = 4; // active channels in internet/WAN mode
const TOTAL_CHANNELS = LAN_CHANNEL_COUNT; // always create max

// ── Chunk sizes ───────────────────────────────────────────────────────────
const LAN_CHUNK_SIZE = 512 * 1024; // 512 KB — fixed for LAN
const WAN_CHUNK_MIN = 32 * 1024; //  32 KB — adaptive floor
const WAN_CHUNK_DEFAULT = 128 * 1024; // 128 KB — adaptive default
const WAN_CHUNK_MAX = 512 * 1024; // 512 KB — adaptive ceiling

// ── Buffer thresholds ─────────────────────────────────────────────────────
const LAN_BUFFER_HIGH = 16 * 1024 * 1024; // 16 MB — LAN high-water mark
const LAN_BUFFER_LOW = 2 * 1024 * 1024; //  2 MB — drain target
const WAN_BUFFER_HIGH = 8 * 1024 * 1024; //  8 MB — WAN high-water mark
const WAN_BUFFER_LOW = 1 * 1024 * 1024; //  1 MB — drain target

const SPEED_MS = 500; // speed sample window (ms)

const GUEST_MAX = 500 * 1024 * 1024; // 500 MB
const FREE_MAX = 5 * 1024 ** 3; //   5 GB

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";

// ── LAN detection helpers ─────────────────────────────────────────────────

/**
 * Returns true if `ip` belongs to a private/local network range:
 *   10.0.0.0/8 · 172.16.0.0/12 · 192.168.0.0/16
 */
export function isLocalIP(ip) {
  if (!ip) return false;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  return false;
}

/**
 * Extracts the first IPv4 address from an ICE candidate string.
 * e.g. "candidate:0 1 UDP 2122252543 192.168.1.5 54326 typ host" → "192.168.1.5"
 */
export function extractIPFromCandidate(candidateStr) {
  if (!candidateStr) return null;
  const match = candidateStr.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match ? match[1] : null;
}

// ── Multi-channel chunk codec ──────────────────────────────────────────────

/** Prepend a 4-byte big-endian sequence number to a chunk ArrayBuffer. */
function packChunk(seq, data) {
  const out = new ArrayBuffer(4 + data.byteLength);
  new DataView(out).setUint32(0, seq, false);
  new Uint8Array(out, 4).set(new Uint8Array(data));
  return out;
}

/** Decode a packed chunk → { seq, data }. */
function unpackChunk(buf) {
  return {
    seq: new DataView(buf).getUint32(0, false),
    data: buf.slice(4),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export function useLANShare() {
  const { user } = useAuth();
  const isGuest = !user;
  const maxBytes = isGuest ? GUEST_MAX : FREE_MAX;

  // ── Reactive state ──────────────────────────────────────────────────────
  const [state, setState] = useState("idle");
  const [code, setCode] = useState("");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [eta, setEta] = useState(null);
  const [error, setError] = useState("");
  const [fileMeta, setFileMeta] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);
  const [isLANMode, setIsLANMode] = useState(false); // true when both peers on LAN

  // ── Internal refs ────────────────────────────────────────────────────────
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const channelsRef = useRef([]); // array of DataChannel objects (up to 6)
  const abortedRef = useRef(false);

  // LAN detection
  const myHasLANRef = useRef(false); // we detected our own local IP
  const peerHasLANRef = useRef(false); // peer confirmed their local IP
  const isLANRef = useRef(false); // both flags set → LAN mode active

  // Speed / chunk tracking
  const chunkSizeRef = useRef(WAN_CHUNK_DEFAULT);
  const sentRef = useRef(0); // cumulative bytes transferred
  const windowRef = useRef(0); // bytes in current speed window
  const speedTimer = useRef(null);

  // Receiver assembly
  const rxMap = useRef(new Map()); // Map<seq, ArrayBuffer>
  const rxMeta = useRef(null);
  const rxBytesRef = useRef(0);

  // ── Socket ───────────────────────────────────────────────────────────────
  function getSocket() {
    if (!socketRef.current || socketRef.current.disconnected) {
      const url = import.meta.env.DEV
        ? "http://localhost:3001"
        : API_BASE || window.location.origin;

      socketRef.current = socketIO(url, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        timeout: 15000,
        reconnectionAttempts: 5,
      });
    }
    return socketRef.current;
  }

  // ── Full teardown ────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    abortedRef.current = true;
    clearInterval(speedTimer.current);
    speedTimer.current = null;

    for (const ch of channelsRef.current) {
      try {
        ch.close();
      } catch {
        /* ignore */
      }
    }
    channelsRef.current = [];

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    sentRef.current = 0;
    windowRef.current = 0;
    rxMap.current = new Map();
    rxMeta.current = null;
    rxBytesRef.current = 0;
    myHasLANRef.current = false;
    peerHasLANRef.current = false;
    isLANRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // ── LAN mode activation ──────────────────────────────────────────────────
  function checkAndActivateLAN() {
    if (myHasLANRef.current && peerHasLANRef.current && !isLANRef.current) {
      isLANRef.current = true;
      setIsLANMode(true);
      chunkSizeRef.current = LAN_CHUNK_SIZE;
      // Raise buffer thresholds on all open channels
      for (const ch of channelsRef.current) {
        try {
          ch.bufferedAmountLowThreshold = LAN_BUFFER_LOW;
        } catch {
          /* ignore */
        }
      }
      console.log("[LANShare] ⚡ LAN Turbo Mode activated");
    }
  }

  // ── Speed / ETA / progress tracker ──────────────────────────────────────
  function startSpeedTracker(totalBytes) {
    clearInterval(speedTimer.current);
    sentRef.current = 0;
    windowRef.current = 0;
    chunkSizeRef.current = isLANRef.current
      ? LAN_CHUNK_SIZE
      : WAN_CHUNK_DEFAULT;

    speedTimer.current = setInterval(() => {
      const bps = (windowRef.current / SPEED_MS) * 1000;
      windowRef.current = 0;
      setSpeed(bps);

      const done = sentRef.current;
      setProgress(Math.min((done / totalBytes) * 100, 99));
      if (bps > 0) setEta(Math.ceil((totalBytes - done) / bps));

      // Adaptive chunk size — only in WAN mode (LAN uses fixed 512 KB)
      if (!isLANRef.current) {
        if (bps < 4_000_000) chunkSizeRef.current = WAN_CHUNK_MIN;
        else if (bps > 24_000_000) chunkSizeRef.current = WAN_CHUNK_MAX;
        else chunkSizeRef.current = WAN_CHUNK_DEFAULT;
      }
    }, SPEED_MS);
  }

  // ── Buffer drain (event-driven + poll fallback for mobile) ───────────────
  function waitForBufferDrain(dc) {
    const threshold = isLANRef.current ? LAN_BUFFER_LOW : WAN_BUFFER_LOW;
    return new Promise((resolve) => {
      if (dc.readyState !== "open" || dc.bufferedAmount < threshold) {
        resolve();
        return;
      }

      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const prev = dc.onbufferedamountlow;
      dc.onbufferedamountlow = () => {
        dc.onbufferedamountlow = prev;
        done();
      };

      // Poll fallback — some mobile browsers don't fire the event
      const poll = setInterval(() => {
        if (dc.readyState !== "open" || dc.bufferedAmount < threshold) {
          clearInterval(poll);
          dc.onbufferedamountlow = prev;
          done();
        }
      }, 50);
    });
  }

  // ── Common socket event wiring ───────────────────────────────────────────
  function attachSocketEvents(socket) {
    socket.on("lan:cancelled", () => {
      cleanup();
      setState("cancelled");
    });
    socket.on("lan:peer-disconnected", () => {
      cleanup();
      setState("error");
      setError("Peer disconnected.");
    });
    socket.on("lan:error", ({ message }) => {
      cleanup();
      setState("error");
      setError(message);
    });

    // Forward remote ICE candidates to our PeerConnection
    socket.on("lan:ice", async (candidate) => {
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    });

    // Peer's LAN status (relayed from server)
    socket.on("lan:peer-local-ip", ({ isLocal }) => {
      peerHasLANRef.current = isLocal;
      if (isLocal) checkAndActivateLAN();
    });
  }

  // ── ICE candidate inspection for LAN detection ───────────────────────────
  function onIceCandidate(socket, candidate) {
    if (!candidate?.candidate) return;
    socket.emit("lan:ice", candidate); // relay to peer
    // Only inspect "host" type candidates — they reveal local IPs
    if (candidate.candidate.includes("typ host") && !myHasLANRef.current) {
      const ip = extractIPFromCandidate(candidate.candidate);
      if (ip && isLocalIP(ip)) {
        myHasLANRef.current = true;
        socket.emit("lan:local-ip", { isLocal: true });
        checkAndActivateLAN();
        console.log(`[LANShare] Local IP detected: ${ip}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SENDER
  // ═══════════════════════════════════════════════════════════════════════════
  const startTransfer = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > maxBytes) {
        setError(`File too large. Max is ${isGuest ? "500 MB" : "5 GB"}.`);
        setState("error");
        return;
      }

      // Reset all state
      abortedRef.current = false;
      myHasLANRef.current = false;
      peerHasLANRef.current = false;
      isLANRef.current = false;
      setIsLANMode(false);
      setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
      setState("waiting");
      setProgress(0);
      setSpeed(0);
      setEta(null);
      setError("");
      setCode("");

      const socket = getSocket();
      attachSocketEvents(socket);

      socket.emit("lan:create", (res) => {
        if (res?.error) {
          setError(res.error);
          setState("error");
          return;
        }
        setCode(res.code);
      });

      socket.once("lan:receiver-joined", async () => {
        if (abortedRef.current) return;
        setState("connecting");

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Always create TOTAL_CHANNELS data channels up front.
        // The active count (4 WAN / 6 LAN) is chosen later in the pipeline.
        const channels = [];
        for (let i = 0; i < TOTAL_CHANNELS; i++) {
          const dc = pc.createDataChannel(`lan-${i}`, { ordered: true });
          dc.binaryType = "arraybuffer";
          dc.bufferedAmountLowThreshold = WAN_BUFFER_LOW;
          channels.push(dc);
        }
        channelsRef.current = channels;

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) onIceCandidate(socket, candidate);
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            setError("WebRTC connection failed. Try again.");
            setState("error");
          }
        };

        // Wait until ALL channels are open before starting the pipeline
        let openCount = 0;
        for (const dc of channels) {
          dc.onopen = () => {
            openCount++;
            if (openCount === TOTAL_CHANNELS) {
              // Apply LAN buffer thresholds if already detected
              if (isLANRef.current) {
                for (const ch of channels)
                  ch.bufferedAmountLowThreshold = LAN_BUFFER_LOW;
              }
              pipeline(file, channels);
            }
          };
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("lan:offer", offer);

        socket.once("lan:answer", async (answer) => {
          if (abortedRef.current) return;
          try {
            await pc.setRemoteDescription(answer);
          } catch (e) {
            setError("Connection setup failed: " + e.message);
            setState("error");
          }
        });
      });
    },
    [cleanup, isGuest, maxBytes],
  );

  // ── Streaming pipeline (sender) ──────────────────────────────────────────
  async function pipeline(file, channels) {
    if (abortedRef.current) return;
    setState("transferring");
    startSpeedTracker(file.size);

    const isLAN = isLANRef.current;
    const activeCount = isLAN ? LAN_CHANNEL_COUNT : WAN_CHANNEL_COUNT;
    const activeChannels = channels.slice(0, activeCount);
    const bufHigh = isLAN ? LAN_BUFFER_HIGH : WAN_BUFFER_HIGH;

    // Send file metadata on channel 0
    channels[0].send(
      JSON.stringify({
        type: "meta",
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
      }),
    );

    let offset = 0;
    let seq = 0;
    const total = file.size;

    while (offset < total && !abortedRef.current) {
      // Pick the active channel with the lowest bufferedAmount (greedy load-balance)
      let bestCh = activeChannels[0];
      for (const ch of activeChannels) {
        if (ch.readyState !== "open") {
          setError("Connection lost. Please try again.");
          setState("error");
          return;
        }
        if (ch.bufferedAmount < bestCh.bufferedAmount) bestCh = ch;
      }

      // Back-pressure: wait if chosen channel's buffer is full
      if (bestCh.bufferedAmount >= bufHigh) {
        await waitForBufferDrain(bestCh);
      }
      if (abortedRef.current) break;
      // Re-validate after waitForBufferDrain (channel may have closed during drain)
      if (bestCh.readyState !== "open") {
        setError("Connection lost. Please try again.");
        setState("error");
        return;
      }

      const cs = chunkSizeRef.current;
      const end = Math.min(offset + cs, total);
      const buf = await file.slice(offset, end).arrayBuffer();

      if (abortedRef.current) break;
      // Re-validate after arrayBuffer() await — channel may have closed while reading
      if (bestCh.readyState !== "open") {
        setError("Connection lost. Please try again.");
        setState("error");
        return;
      }

      bestCh.send(packChunk(seq++, buf));

      const sent = end - offset;
      sentRef.current += sent;
      windowRef.current += sent;
      offset = end;
    }

    if (!abortedRef.current) {
      // Guard: channel 0 must still be open to deliver the done signal
      if (channels[0].readyState === "open") {
        channels[0].send(JSON.stringify({ type: "done", totalChunks: seq }));
      }
      clearInterval(speedTimer.current);
      setProgress(100);
      setSpeed(0);
      setEta(0);
      setState("done");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECEIVER
  // ═══════════════════════════════════════════════════════════════════════════
  const joinTransfer = useCallback(
    async (transferCode) => {
      if (!transferCode || transferCode.length !== 6) return;

      abortedRef.current = false;
      myHasLANRef.current = false;
      peerHasLANRef.current = false;
      isLANRef.current = false;
      rxMap.current = new Map();
      rxMeta.current = null;
      rxBytesRef.current = 0;
      setIsLANMode(false);
      setState("connecting");
      setProgress(0);
      setSpeed(0);
      setEta(null);
      setError("");
      setReceivedFile(null);

      const socket = getSocket();
      attachSocketEvents(socket);

      socket.emit("lan:join", transferCode, async (res) => {
        if (res?.error) {
          setError(res.error);
          setState("error");
          return;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) onIceCandidate(socket, candidate);
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            setError("WebRTC connection failed. Try again.");
            setState("error");
          }
        };

        // Accept all data channels from the sender
        pc.ondatachannel = ({ channel }) => {
          channel.binaryType = "arraybuffer";
          channelsRef.current.push(channel);

          // Apply LAN threshold if already detected
          if (isLANRef.current) {
            try {
              channel.bufferedAmountLowThreshold = LAN_BUFFER_LOW;
            } catch {
              /* ignore */
            }
          }

          channel.onmessage = ({ data }) => {
            if (abortedRef.current) return;

            if (typeof data === "string") {
              let msg;
              try {
                msg = JSON.parse(data);
              } catch {
                return;
              }

              if (msg.type === "meta") {
                rxMeta.current = msg;
                rxMap.current = new Map();
                rxBytesRef.current = 0;
                sentRef.current = 0;
                windowRef.current = 0;
                setFileMeta({
                  name: msg.name,
                  size: msg.size,
                  mimeType: msg.mimeType,
                });
                setState("transferring");
                startSpeedTracker(msg.size);
              }

              if (msg.type === "done") {
                clearInterval(speedTimer.current);
                const meta = rxMeta.current;
                const totalChunks = msg.totalChunks;

                // Reassemble chunks in seq order
                const ordered = [];
                for (let i = 0; i < totalChunks; i++) {
                  const chunk = rxMap.current.get(i);
                  if (chunk) ordered.push(chunk);
                }

                const blob = new Blob(ordered, {
                  type: meta?.mimeType || "application/octet-stream",
                });
                rxMap.current = new Map(); // free memory

                setReceivedFile({
                  name: meta?.name || "download",
                  size: meta?.size || blob.size,
                  url: URL.createObjectURL(blob),
                });
                setProgress(100);
                setSpeed(0);
                setEta(0);
                setState("done");
              }
              return;
            }

            // Binary chunk — skip if meta not yet received
            if (data instanceof ArrayBuffer && rxMeta.current) {
              const { seq, data: chunk } = unpackChunk(data);
              rxMap.current.set(seq, chunk);
              sentRef.current += chunk.byteLength;
              windowRef.current += chunk.byteLength;
            }
          };

          channel.onerror = (e) => {
            console.error("[LANShare] channel error:", e);
            setError("Data channel error. Try again.");
            setState("error");
          };
        };

        // Receive offer → create answer
        socket.once("lan:offer", async (offer) => {
          if (abortedRef.current) return;
          try {
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("lan:answer", answer);
          } catch (e) {
            setError("Handshake failed: " + e.message);
            setState("error");
          }
        });
      });
    },
    [cleanup],
  );

  // ── Cancel / Reset ───────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    socketRef.current?.emit("lan:cancel");
    cleanup();
    setState("cancelled");
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    abortedRef.current = false;
    setState("idle");
    setCode("");
    setProgress(0);
    setSpeed(0);
    setEta(null);
    setError("");
    setReceivedFile(null);
    setFileMeta(null);
    setIsLANMode(false);
  }, [cleanup]);

  return {
    state,
    code,
    progress,
    speed,
    eta,
    error,
    fileMeta,
    receivedFile,
    isLANMode,
    maxBytes,
    isGuest,
    startTransfer,
    joinTransfer,
    cancel,
    reset,
  };
}
