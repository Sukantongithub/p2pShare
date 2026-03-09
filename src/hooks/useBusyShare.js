/**
 * useBusyShare — Reliable WebRTC P2P file transfer hook
 *
 * Design decisions vs previous version:
 *  - SINGLE ordered DataChannel  →  eliminates race conditions with multi-channel
 *  - File.slice() per chunk       →  never loads entire file into RAM, no freeze
 *  - onbufferedamountlow event    →  event-driven backpressure, no busy-wait sleep
 *  - ArrayBuffer chunks only      →  no base64 overhead
 *  - Adaptive chunk size          →  64 KB → 512 KB based on measured throughput
 *
 * Transfer protocol:
 *   1. meta JSON   → { type:'meta', name, size, mimeType }
 *   2. N × binary  → raw ArrayBuffer chunk (no header needed; ordered channel)
 *   3. done JSON   → { type:'done' }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from './useAuth';

// ── Tuning constants ──────────────────────────────────────────────────────────
const CHUNK_MIN      = 64   * 1024;       // 64 KB — slow connections
const CHUNK_DEFAULT  = 256  * 1024;       // 256 KB — typical
const CHUNK_MAX      = 512  * 1024;       // 512 KB — fast local / LAN
const BUFFER_HIGH    = 16  * 1024 * 1024; // 16 MB — pause sending
const BUFFER_LOW     = 4   * 1024 * 1024; // 4 MB  — resume threshold
const SPEED_MS       = 500;               // speed sample window

const GUEST_MAX = 500 * 1024 * 1024;      // 500 MB
const FREE_MAX  = 5   * 1024 ** 3;        // 5 GB

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL || '';

// ─────────────────────────────────────────────────────────────────────────────
export function useBusyShare() {
  const { user }  = useAuth();
  const isGuest   = !user;
  const maxBytes  = isGuest ? GUEST_MAX : FREE_MAX;

  // ── Reactive state ────────────────────────────────────────────────────────
  const [state,        setState]        = useState('idle');
  const [code,         setCode]         = useState('');
  const [progress,     setProgress]     = useState(0);
  const [speed,        setSpeed]        = useState(0);      // bytes/sec
  const [eta,          setEta]          = useState(null);   // seconds remaining
  const [error,        setError]        = useState('');
  const [fileMeta,     setFileMeta]     = useState(null);   // { name, size, mimeType }
  const [receivedFile, setReceivedFile] = useState(null);   // { name, size, url }

  // ── Internal refs (mutations don't cause re-render) ───────────────────────
  const socketRef    = useRef(null);
  const pcRef        = useRef(null);
  const dcRef        = useRef(null);         // the one DataChannel
  const abortedRef   = useRef(false);

  // Speed tracking
  const chunkSizeRef = useRef(CHUNK_DEFAULT);
  const sentRef      = useRef(0);            // bytes sent / received
  const windowRef    = useRef(0);            // bytes in current speed window
  const speedTimer   = useRef(null);

  // Receiver assembly
  const rxChunks     = useRef([]);           // ArrayBuffer[] collected in order
  const rxMeta       = useRef(null);

  // ── Socket (created lazily, reused) ──────────────────────────────────────
  function getSocket() {
    if (!socketRef.current || socketRef.current.disconnected) {
      socketRef.current = socketIO(API_BASE || window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });
    }
    return socketRef.current;
  }

  // ── Full teardown ─────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    abortedRef.current = true;
    clearInterval(speedTimer.current);
    speedTimer.current = null;

    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    sentRef.current    = 0;
    windowRef.current  = 0;
    rxChunks.current   = [];
    rxMeta.current     = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // ── Speed / ETA / progress tracker ───────────────────────────────────────
  function startSpeedTracker(totalBytes) {
    clearInterval(speedTimer.current);
    sentRef.current   = 0;
    windowRef.current = 0;
    chunkSizeRef.current = CHUNK_DEFAULT;

    speedTimer.current = setInterval(() => {
      const bps = (windowRef.current / SPEED_MS) * 1000;
      windowRef.current = 0;

      setSpeed(bps);
      const done = sentRef.current;
      setProgress(Math.min((done / totalBytes) * 100, 99));
      if (bps > 0) setEta(Math.ceil((totalBytes - done) / bps));

      // Adaptive chunk size
      if      (bps < 5_000_000)  chunkSizeRef.current = CHUNK_MIN;
      else if (bps > 50_000_000) chunkSizeRef.current = CHUNK_MAX;
      else                        chunkSizeRef.current = CHUNK_DEFAULT;
    }, SPEED_MS);
  }

  // ── Wait for DC buffer to drain ───────────────────────────────────────────
  function waitForBufferDrain(dc) {
    return new Promise((resolve) => {
      // Already drained
      if (dc.bufferedAmount < BUFFER_LOW) { resolve(); return; }
      const prev = dc.onbufferedamountlow;
      dc.onbufferedamountlow = () => {
        dc.onbufferedamountlow = prev;
        resolve();
      };
    });
  }

  // ── Attach common error/cancel socket listeners ───────────────────────────
  function attachSocketEvents(socket) {
    socket.on('busy:cancelled',         () => { cleanup(); setState('cancelled'); });
    socket.on('busy:peer-disconnected', () => { cleanup(); setState('error'); setError('Peer disconnected.'); });
    socket.on('busy:error',             ({ message }) => { cleanup(); setState('error'); setError(message); });
    socket.on('busy:ice', async (c) => {
      try { await pcRef.current?.addIceCandidate(c); } catch {}
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SENDER
  // ─────────────────────────────────────────────────────────────────────────
  const startTransfer = useCallback(async (file) => {
    if (!file) return;
    if (file.size > maxBytes) {
      setError(`File too large. Max is ${isGuest ? '500 MB' : '5 GB'}.`);
      setState('error');
      return;
    }

    // Reset everything
    abortedRef.current = false;
    setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
    setState('waiting');
    setProgress(0); setSpeed(0); setEta(null); setError(''); setCode('');

    const socket = getSocket();
    attachSocketEvents(socket);

    socket.emit('busy:create', (res) => {
      if (res?.error) { setError(res.error); setState('error'); return; }
      setCode(res.code);
    });

    socket.once('busy:receiver-joined', async () => {
      if (abortedRef.current) return;
      setState('connecting');

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Single ordered DataChannel
      const dc = pc.createDataChannel('busy', { ordered: true });
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = BUFFER_LOW;
      dcRef.current = dc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('busy:ice', candidate);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setError('WebRTC connection failed. Try again.');
          setState('error');
        }
      };

      dc.onopen = () => pipeline(file, dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('busy:offer', offer);

      socket.once('busy:answer', async (answer) => {
        if (abortedRef.current) return;
        try { await pc.setRemoteDescription(answer); } catch (e) {
          setError('Connection setup failed: ' + e.message); setState('error');
        }
      });
    });
  }, [cleanup, isGuest, maxBytes]);

  // ── Streaming pipeline (sender) ───────────────────────────────────────────
  async function pipeline(file, dc) {
    if (abortedRef.current) return;
    setState('transferring');
    startSpeedTracker(file.size);

    // 1. Send metadata
    dc.send(JSON.stringify({
      type: 'meta',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
    }));

    // 2. Stream chunks using file.slice() — no full-file RAM load
    let offset = 0;
    const total = file.size;

    while (offset < total && !abortedRef.current) {
      // Pause if buffer is saturated → wait for drain event
      if (dc.bufferedAmount >= BUFFER_HIGH) {
        await waitForBufferDrain(dc);
      }
      if (abortedRef.current) break;

      const cs    = chunkSizeRef.current;
      const end   = Math.min(offset + cs, total);
      const slice = file.slice(offset, end);
      const buf   = await slice.arrayBuffer();

      if (abortedRef.current) break;

      dc.send(buf);

      const sent = end - offset;
      sentRef.current   += sent;
      windowRef.current += sent;
      offset = end;
    }

    // 3. Done signal
    if (!abortedRef.current) {
      dc.send(JSON.stringify({ type: 'done' }));
      clearInterval(speedTimer.current);
      setProgress(100); setSpeed(0); setEta(0);
      setState('done');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RECEIVER
  // ─────────────────────────────────────────────────────────────────────────
  const joinTransfer = useCallback(async (transferCode) => {
    if (!transferCode || transferCode.length !== 6) return;

    abortedRef.current = false;
    rxChunks.current   = [];
    rxMeta.current     = null;
    setState('connecting');
    setProgress(0); setSpeed(0); setEta(null); setError(''); setReceivedFile(null);

    const socket = getSocket();
    attachSocketEvents(socket);

    socket.emit('busy:join', transferCode, async (res) => {
      if (res?.error) { setError(res.error); setState('error'); return; }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('busy:ice', candidate);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setError('WebRTC connection failed. Try again.');
          setState('error');
        }
      };

      pc.ondatachannel = ({ channel }) => {
        channel.binaryType = 'arraybuffer';
        dcRef.current = channel;

        channel.onmessage = ({ data }) => {
          if (abortedRef.current) return;

          if (typeof data === 'string') {
            const msg = JSON.parse(data);

            if (msg.type === 'meta') {
              rxMeta.current = msg;
              rxChunks.current = [];
              sentRef.current  = 0;
              windowRef.current = 0;
              setFileMeta({ name: msg.name, size: msg.size, mimeType: msg.mimeType });
              setState('transferring');
              startSpeedTracker(msg.size);
            }

            if (msg.type === 'done') {
              clearInterval(speedTimer.current);
              const meta = rxMeta.current;
              const blob = new Blob(rxChunks.current, {
                type: meta?.mimeType || 'application/octet-stream',
              });
              const url = URL.createObjectURL(blob);
              rxChunks.current = []; // free memory
              setReceivedFile({
                name: meta?.name || 'download',
                size: meta?.size || blob.size,
                url,
              });
              setProgress(100); setSpeed(0); setEta(0);
              setState('done');
            }
            return;
          }

          // Binary chunk — push in order (channel is ordered)
          if (data instanceof ArrayBuffer) {
            rxChunks.current.push(data);
            sentRef.current   += data.byteLength;
            windowRef.current += data.byteLength;
          }
        };

        channel.onerror = (e) => {
          console.error('[BusyShare] channel error:', e);
          setError('Data channel error. Try again.'); setState('error');
        };
      };

      // Handle offer → create answer
      socket.once('busy:offer', async (offer) => {
        if (abortedRef.current) return;
        try {
          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('busy:answer', answer);
        } catch (e) {
          setError('Handshake failed: ' + e.message); setState('error');
        }
      });
    });
  }, [cleanup]);

  // ── Cancel / Reset ────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    socketRef.current?.emit('busy:cancel');
    cleanup();
    setState('cancelled');
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    abortedRef.current = false;
    setCode(''); setProgress(0); setSpeed(0); setEta(null);
    setError(''); setReceivedFile(null); setFileMeta(null);
  }, [cleanup]);

  return {
    state, code, progress, speed, eta, error, fileMeta, receivedFile,
    maxBytes, isGuest,
    startTransfer, joinTransfer, cancel, reset,
  };
}
