/**
 * BusyShare with LAN Turbo Mode
 * - Detects LAN via ICE host candidates
 * - Uses 4 data channels by default
 * - Upgrades to 6 channels + larger chunks/buffer on LAN
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io as socketIO } from "socket.io-client";
import { useAuth } from "./useAuth";

// ── Tuning constants ──────────────────────────────────────────────────────────
const DEFAULT_TUNING = {
  chunkSize: 256 * 1024,
  numChannels: 4,
  bufferLimit: 8 * 1024 * 1024,
};

const LAN_TUNING = {
  chunkSize: 512 * 1024,
  numChannels: 6,
  bufferLimit: 16 * 1024 * 1024,
};

const SPEED_MS = 500; // speed sample window

const GUEST_MAX = 500 * 1024 * 1024; // 500 MB
const FREE_MAX = 5 * 1024 ** 3; // 5 GB

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";

// ─────────────────────────────────────────────────────────────────────────────
export function useBusyShare() {
  const { user } = useAuth();
  const isGuest = !user;
  const maxBytes = isGuest ? GUEST_MAX : FREE_MAX;

  // ── Reactive state ────────────────────────────────────────────────────────
  const [state, setState] = useState("idle");
  const [code, setCode] = useState("");
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [eta, setEta] = useState(null); // seconds remaining
  const [error, setError] = useState("");
  const [fileMeta, setFileMeta] = useState(null); // { name, size, mimeType }
  const [receivedFile, setReceivedFile] = useState(null); // { name, size, url }
  const [isLANMode, setIsLANMode] = useState(false);

  // ── Internal refs (mutations don't cause re-render) ───────────────────────
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const controlDcRef = useRef(null);
  const dataChannelsRef = useRef([]);
  const abortedRef = useRef(false);
  const tuningRef = useRef({ ...DEFAULT_TUNING });
  const localCandidateRef = useRef(false);
  const remoteCandidateRef = useRef(false);

  // Speed tracking
  const sentRef = useRef(0); // bytes sent / received
  const windowRef = useRef(0); // bytes in current speed window
  const speedTimer = useRef(null);

  // Receiver assembly
  const rxChunks = useRef([]); // ArrayBuffer[] collected in order
  const rxMeta = useRef(null);
  const rxPendingMapRef = useRef(new Map());
  const rxNextIndexRef = useRef(0);
  const rxTotalChunksRef = useRef(null);

  function isLocalIP(ip) {
    if (!ip || ip.includes(":")) return false;

    if (/^192\.168\./.test(ip)) return true;
    if (/^10\./.test(ip)) return true;

    const m = ip.match(/^172\.(\d{1,3})\./);
    if (m) {
      const second = Number(m[1]);
      return second >= 16 && second <= 31;
    }

    return false;
  }

  function extractIpFromCandidate(candidateStr) {
    if (!candidateStr) return null;
    const parts = candidateStr.split(" ");
    if (parts.length < 5) return null;
    return parts[4] || null;
  }

  function maybeEnableLANMode() {
    if (localCandidateRef.current && remoteCandidateRef.current && !isLANMode) {
      setIsLANMode(true);
      tuningRef.current = { ...LAN_TUNING };
      console.log("LAN Turbo Mode Activated");
    }
  }

  function inspectCandidateForLan(candidateObj, isLocalSide) {
    const candidate = candidateObj?.candidate || "";
    if (!candidate.includes(" typ host")) return;
    const ip = extractIpFromCandidate(candidate);
    if (!isLocalIP(ip)) return;

    if (isLocalSide) {
      localCandidateRef.current = true;
    } else {
      remoteCandidateRef.current = true;
    }
    maybeEnableLANMode();
  }

  // ── Socket (created lazily, reused) ──────────────────────────────────────
  function getSocket() {
    if (!socketRef.current || socketRef.current.disconnected) {
      const socketUrl = import.meta.env.DEV
        ? "http://localhost:3001"
        : API_BASE || window.location.origin;

      socketRef.current = socketIO(socketUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        timeout: 15000,
        reconnectionAttempts: 5,
      });
    }
    return socketRef.current;
  }

  // ── Full teardown ─────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    abortedRef.current = true;
    clearInterval(speedTimer.current);
    speedTimer.current = null;

    if (controlDcRef.current) {
      try { controlDcRef.current.close(); } catch {}
      controlDcRef.current = null;
    }
    for (const ch of dataChannelsRef.current) {
      try { ch.close(); } catch {}
    }
    dataChannelsRef.current = [];

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    sentRef.current = 0;
    windowRef.current = 0;
    rxChunks.current = [];
    rxMeta.current = null;
    rxPendingMapRef.current = new Map();
    rxNextIndexRef.current = 0;
    rxTotalChunksRef.current = null;

    localCandidateRef.current = false;
    remoteCandidateRef.current = false;
    setIsLANMode(false);
    tuningRef.current = { ...DEFAULT_TUNING };
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // ── Speed / ETA / progress tracker ───────────────────────────────────────
  function startSpeedTracker(totalBytes) {
    clearInterval(speedTimer.current);
    sentRef.current = 0;
    windowRef.current = 0;

    speedTimer.current = setInterval(() => {
      const bps = (windowRef.current / SPEED_MS) * 1000;
      windowRef.current = 0;

      setSpeed(bps);
      const done = sentRef.current;
      setProgress(Math.min((done / totalBytes) * 100, 99));
      if (bps > 0) setEta(Math.ceil((totalBytes - done) / bps));
    }, SPEED_MS);
  }

  // ── Wait for channels buffer to drain ───────────────────────────────────
  function waitForChannelsDrain(channels, highLimit) {
    return new Promise((resolve) => {
      const lowLimit = Math.floor(highLimit / 2);

      const getTotalBuffered = () =>
        channels.reduce(
          (sum, ch) => sum + (ch?.readyState === "open" ? ch.bufferedAmount : 0),
          0,
        );

      if (getTotalBuffered() < lowLimit) {
        resolve();
        return;
      }

      const poll = setInterval(() => {
        if (getTotalBuffered() < lowLimit) {
          clearInterval(poll);
          resolve();
        }
      }, 25);
    });
  }

  // ── Attach common error/cancel socket listeners ───────────────────────────
  function attachSocketEvents(socket) {
    socket.on("busy:cancelled", () => {
      cleanup();
      setState("cancelled");
    });
    socket.on("busy:peer-disconnected", () => {
      cleanup();
      setState("error");
      setError("Peer disconnected.");
    });
    socket.on("busy:error", ({ message }) => {
      cleanup();
      setState("error");
      setError(message);
    });
    socket.on("busy:ice", async (c) => {
      inspectCandidateForLan(c, false);
      try {
        await pcRef.current?.addIceCandidate(c);
      } catch {}
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SENDER
  // ─────────────────────────────────────────────────────────────────────────
  const startTransfer = useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > maxBytes) {
        setError(`File too large. Max is ${isGuest ? "500 MB" : "5 GB"}.`);
        setState("error");
        return;
      }

      // Reset everything
      abortedRef.current = false;
      setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
      setState("waiting");
      setProgress(0);
      setSpeed(0);
      setEta(null);
      setError("");
      setCode("");
      setIsLANMode(false);
      tuningRef.current = { ...DEFAULT_TUNING };
      localCandidateRef.current = false;
      remoteCandidateRef.current = false;

      const socket = getSocket();
      attachSocketEvents(socket);

      socket.emit("busy:create", (res) => {
        if (res?.error) {
          setError(res.error);
          setState("error");
          return;
        }
        setCode(res.code);
      });

      socket.once("busy:receiver-joined", async () => {
        if (abortedRef.current) return;
        setState("connecting");

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Control channel + data channels
        const control = pc.createDataChannel("busy-control", { ordered: true });
        control.binaryType = "arraybuffer";
        controlDcRef.current = control;

        const numChannels = tuningRef.current.numChannels;
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
          const ch = pc.createDataChannel(`busy-data-${i}`, { ordered: true });
          ch.binaryType = "arraybuffer";
          channels.push(ch);
        }
        dataChannelsRef.current = channels;

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            inspectCandidateForLan(candidate, true);
            socket.emit("busy:ice", candidate);
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            setError("WebRTC connection failed. Try again.");
            setState("error");
          }
        };

        const allChannels = [control, ...channels];
        const waitOpen = allChannels.map(
          (ch) =>
            new Promise((resolve, reject) => {
              if (ch.readyState === "open") return resolve();
              ch.onopen = () => resolve();
              ch.onerror = () => reject(new Error("Data channel open failed"));
            }),
        );

        Promise.all(waitOpen)
          .then(() => pipeline(file, control, channels))
          .catch((err) => {
            setError(err.message || "Channel open failed");
            setState("error");
          });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("busy:offer", offer);

        socket.once("busy:answer", async (answer) => {
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

  // ── Streaming pipeline (sender) ───────────────────────────────────────────
  async function pipeline(file, control, channels) {
    if (abortedRef.current) return;
    setState("transferring");
    startSpeedTracker(file.size);

    const chunkSize = tuningRef.current.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);

    // 1. Send metadata
    control.send(
      JSON.stringify({
        type: "meta",
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        chunkSize,
        totalChunks,
      }),
    );

    // 2. Stream chunks using file.slice() — striped across channels
    let offset = 0;
    let chunkIndex = 0;
    const total = file.size;
    const encoder = new TextEncoder();

    while (offset < total && !abortedRef.current) {
      const openChannels = channels.filter((ch) => ch.readyState === "open");
      if (!openChannels.length) {
        setError("Connection lost. Please try again.");
        setState("error");
        return;
      }

      const totalBuffered = openChannels.reduce((s, ch) => s + ch.bufferedAmount, 0);
      if (totalBuffered >= tuningRef.current.bufferLimit) {
        await waitForChannelsDrain(openChannels, tuningRef.current.bufferLimit);
      }
      if (abortedRef.current) break;

      const end = Math.min(offset + chunkSize, total);
      const slice = file.slice(offset, end);
      const payload = await slice.arrayBuffer();

      if (abortedRef.current) break;

      // packet format: [4 bytes chunkIndex][payload]
      const packet = new Uint8Array(4 + payload.byteLength);
      const dv = new DataView(packet.buffer);
      dv.setUint32(0, chunkIndex);
      packet.set(new Uint8Array(payload), 4);

      const channel = openChannels[chunkIndex % openChannels.length];
      channel.send(packet.buffer);

      const sent = end - offset;
      sentRef.current += sent;
      windowRef.current += sent;
      offset = end;
      chunkIndex++;
    }

    // 3. Done signal
    if (!abortedRef.current) {
      control.send(
        JSON.stringify({
          type: "done",
          totalChunks,
        }),
      );
      clearInterval(speedTimer.current);
      setProgress(100);
      setSpeed(0);
      setEta(0);
      setState("done");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RECEIVER
  // ─────────────────────────────────────────────────────────────────────────
  const joinTransfer = useCallback(
    async (transferCode) => {
      if (!transferCode || transferCode.length !== 6) return;

      abortedRef.current = false;
      rxChunks.current = [];
      rxMeta.current = null;
      setState("connecting");
      setProgress(0);
      setSpeed(0);
      setEta(null);
      setError("");
      setReceivedFile(null);
      setIsLANMode(false);
      tuningRef.current = { ...DEFAULT_TUNING };
      localCandidateRef.current = false;
      remoteCandidateRef.current = false;

      const socket = getSocket();
      attachSocketEvents(socket);

      socket.emit("busy:join", transferCode, async (res) => {
        if (res?.error) {
          setError(res.error);
          setState("error");
          return;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            inspectCandidateForLan(candidate, true);
            socket.emit("busy:ice", candidate);
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            setError("WebRTC connection failed. Try again.");
            setState("error");
          }
        };

        pc.ondatachannel = ({ channel }) => {
          channel.binaryType = "arraybuffer";

          if (channel.label === "busy-control") {
            controlDcRef.current = channel;
            channel.onmessage = ({ data }) => {
              if (abortedRef.current || typeof data !== "string") return;
              const msg = JSON.parse(data);

              if (msg.type === "meta") {
                rxMeta.current = msg;
                rxChunks.current = [];
                rxPendingMapRef.current = new Map();
                rxNextIndexRef.current = 0;
                rxTotalChunksRef.current = msg.totalChunks ?? null;
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
                rxTotalChunksRef.current = msg.totalChunks ?? rxTotalChunksRef.current;

                const totalChunks = rxTotalChunksRef.current;
                if (totalChunks == null || rxChunks.current.length < totalChunks) return;

                clearInterval(speedTimer.current);
                const meta = rxMeta.current;
                const blob = new Blob(rxChunks.current, {
                  type: meta?.mimeType || "application/octet-stream",
                });
                const url = URL.createObjectURL(blob);
                rxChunks.current = [];
                rxPendingMapRef.current = new Map();
                setReceivedFile({
                  name: meta?.name || "download",
                  size: meta?.size || blob.size,
                  url,
                });
                setProgress(100);
                setSpeed(0);
                setEta(0);
                setState("done");
              }
            };
            return;
          }

          dataChannelsRef.current.push(channel);
          channel.onmessage = ({ data }) => {
            if (abortedRef.current || !(data instanceof ArrayBuffer)) return;
            if (data.byteLength < 5) return;

            const view = new DataView(data);
            const chunkIndex = view.getUint32(0);
            const payload = data.slice(4);
            rxPendingMapRef.current.set(chunkIndex, payload);

            while (rxPendingMapRef.current.has(rxNextIndexRef.current)) {
              const chunk = rxPendingMapRef.current.get(rxNextIndexRef.current);
              rxPendingMapRef.current.delete(rxNextIndexRef.current);
              rxChunks.current.push(chunk);
              sentRef.current += chunk.byteLength;
              windowRef.current += chunk.byteLength;
              rxNextIndexRef.current += 1;
            }
          };

          channel.onerror = (e) => {
            console.error("[BusyShare] channel error:", e);
            setError("Data channel error. Try again.");
            setState("error");
          };
        };

        // Handle offer → create answer
        socket.once("busy:offer", async (offer) => {
          if (abortedRef.current) return;
          try {
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("busy:answer", answer);
          } catch (e) {
            setError("Handshake failed: " + e.message);
            setState("error");
          }
        });
      });
    },
    [cleanup],
  );

  // ── Cancel / Reset ────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    socketRef.current?.emit("busy:cancel");
    cleanup();
    setState("cancelled");
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    abortedRef.current = false;
    setCode("");
    setProgress(0);
    setSpeed(0);
    setEta(null);
    setError("");
    setReceivedFile(null);
    setFileMeta(null);
    setIsLANMode(false);
    tuningRef.current = { ...DEFAULT_TUNING };
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
