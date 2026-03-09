/**
 * useBusyShare — WebRTC high-speed P2P file transfer hook
 *
 * Architecture:
 *  - 4 parallel RTCDataChannels (ordered, each streams its own slice)
 *  - Adaptive chunk size: 64 KB → 256 KB → 512 KB based on measured speed
 *  - BufferedAmount flow control: pause when channel exceeds 8 MB
 *  - Binary-only transfers (metadata as JSON string, chunks as ArrayBuffer)
 *  - Socket.io for SDP / ICE signaling only
 *
 * PARALLEL STRATEGY
 *  Each channel is responsible for a fixed stripe of the file:
 *    ch0 → bytes [0, stripe), ch1 → [stripe, 2*stripe), ...
 *  All 4 channels send concurrently using separate async loops.
 *  Receiver writes each chunk at the exact byte offset encoded in a
 *  4-byte header prefix, so arrival order doesn't matter.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from './useAuth';

// ── Constants ────────────────────────────────────────────────────────────────
const NUM_CHANNELS   = 4;
const CHUNK_MIN      = 64  * 1024;        // 64 KB
const CHUNK_DEFAULT  = 256 * 1024;        // 256 KB
const CHUNK_MAX      = 512 * 1024;        // 512 KB
const BUFFER_LIMIT   = 8  * 1024 * 1024; // 8 MB per channel — pause threshold
const SPEED_INTERVAL = 500;              // measure speed every 500 ms
const GUEST_MAX      = 500 * 1024 * 1024; // 500 MB
const FREE_MAX       = 5  * 1024 ** 3;    // 5 GB

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL || '';

// Wait until a DataChannel is open
function waitForOpen(dc) {
  return new Promise((resolve, reject) => {
    if (dc.readyState === 'open') { resolve(); return; }
    dc.addEventListener('open', resolve, { once: true });
    dc.addEventListener('error', reject, { once: true });
  });
}

// Sleep helper for flow control
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
export function useBusyShare() {
  const { user } = useAuth();
  const isGuest = !user;
  const maxBytes = isGuest ? GUEST_MAX : FREE_MAX;

  // ── State ─────────────────────────────────────────────────────────────────
  const [state, setState]               = useState('idle');
  const [code, setCode]                 = useState('');
  const [progress, setProgress]         = useState(0);
  const [speed, setSpeed]               = useState(0);
  const [eta, setEta]                   = useState(null);
  const [error, setError]               = useState('');
  const [receivedFile, setReceivedFile] = useState(null);
  const [fileMeta, setFileMeta]         = useState(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const socketRef        = useRef(null);
  const pcRef            = useRef(null);
  const channelsRef      = useRef([]);
  const transferAborted  = useRef(false);

  // Sender
  const chunkSizeRef     = useRef(CHUNK_DEFAULT);
  const bytesSentRef     = useRef(0);
  const speedBytesRef    = useRef(0);
  const speedTimerRef    = useRef(null);

  // Receiver — shared mutable state for all channel handlers
  const receiveBufferRef = useRef(null);  // Uint8Array — full file
  const receivedBytesRef = useRef(0);     // total bytes written so far
  const rxSpeedBytesRef  = useRef(0);
  const rxSpeedTimerRef  = useRef(null);
  const receivedMetaRef  = useRef(null);
  const doneCountRef     = useRef(0);     // how many channels sent "done"

  // ── Socket helper ─────────────────────────────────────────────────────────
  function getSocket() {
    if (!socketRef.current || socketRef.current.disconnected) {
      socketRef.current = socketIO(API_BASE || window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });
    }
    return socketRef.current;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    transferAborted.current = true;
    clearInterval(speedTimerRef.current);
    clearInterval(rxSpeedTimerRef.current);
    channelsRef.current.forEach(dc => { try { dc.close(); } catch {} });
    channelsRef.current = [];
    if (pcRef.current) { try { pcRef.current.close(); } catch {}; pcRef.current = null; }
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    bytesSentRef.current     = 0;
    speedBytesRef.current    = 0;
    receiveBufferRef.current = null;
    receivedBytesRef.current = 0;
    rxSpeedBytesRef.current  = 0;
    doneCountRef.current     = 0;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // ── Speed / progress tracker ──────────────────────────────────────────────
  function startSpeedTracker(totalBytes, isSender) {
    const rawRef  = isSender ? speedBytesRef  : rxSpeedBytesRef;
    const doneRef = isSender ? bytesSentRef   : receivedBytesRef;

    const timer = setInterval(() => {
      const bps = (rawRef.current / SPEED_INTERVAL) * 1000;
      rawRef.current = 0;
      setSpeed(bps);
      const remaining = totalBytes - doneRef.current;
      if (bps > 0) setEta(Math.ceil(remaining / bps));
      setProgress(Math.min((doneRef.current / totalBytes) * 100, 99));

      if (isSender) {
        if      (bps < 5_000_000)  chunkSizeRef.current = CHUNK_MIN;
        else if (bps > 50_000_000) chunkSizeRef.current = CHUNK_MAX;
        else                        chunkSizeRef.current = CHUNK_DEFAULT;
      }
    }, SPEED_INTERVAL);

    if (isSender) speedTimerRef.current   = timer;
    else          rxSpeedTimerRef.current = timer;
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

    transferAborted.current = false;
    chunkSizeRef.current    = CHUNK_DEFAULT;
    bytesSentRef.current    = 0;
    speedBytesRef.current   = 0;
    setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
    setState('waiting');
    setProgress(0); setSpeed(0); setEta(null); setError('');

    const socket = getSocket();

    // Create signaling room
    socket.emit('busy:create', (res) => {
      if (res?.error) { setError(res.error); setState('error'); return; }
      setCode(res.code);
    });

    // When receiver joins → WebRTC handshake
    socket.once('busy:receiver-joined', async () => {
      if (transferAborted.current) return;
      setState('connecting');

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      // Create NUM_CHANNELS ordered data channels
      const channels = Array.from({ length: NUM_CHANNELS }, (_, i) => {
        const dc = pc.createDataChannel(`busy-${i}`, {
          ordered: true,   // ordered per-channel; channels run in parallel
        });
        dc.binaryType = 'arraybuffer';
        return dc;
      });
      channelsRef.current = channels;

      // ICE relay
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('busy:ice', candidate);
      };

      // Create & send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('busy:offer', offer);

      // Wait for answer
      socket.once('busy:answer', async (answer) => {
        if (transferAborted.current) return;
        await pc.setRemoteDescription(answer);
        // Wait for all channels to open, then start streaming
        await Promise.all(channels.map(waitForOpen));
        if (!transferAborted.current) sendFile(file, channels);
      });
    });

    socket.on('busy:ice', async (c) => { try { await pcRef.current?.addIceCandidate(c); } catch {} });
    socket.on('busy:cancelled',         () => { cleanup(); setState('cancelled'); });
    socket.on('busy:peer-disconnected', () => { cleanup(); setState('error'); setError('Receiver disconnected.'); });
    socket.on('busy:error',             ({ message }) => { cleanup(); setState('error'); setError(message); });
  }, [cleanup, isGuest, maxBytes]);

  // ── Send a channel's stripe of the file ───────────────────────────────────
  async function sendStripe(dc, buffer, start, end, totalSize) {
    let offset = start;

    while (offset < end && !transferAborted.current) {
      // Flow control: wait if channel buffer is saturated
      while (dc.bufferedAmount > BUFFER_LIMIT && !transferAborted.current) {
        await sleep(5);
      }
      if (transferAborted.current) break;

      const cs         = chunkSizeRef.current;
      const chunkEnd   = Math.min(offset + cs, end);
      const chunkBytes = buffer.slice(offset, chunkEnd);

      // Pack: [8 bytes: file offset as BigUint64][chunk bytes]
      // Using file offset so receiver can write at exact position
      const packed = new ArrayBuffer(8 + chunkBytes.byteLength);
      const dv     = new DataView(packed);
      dv.setBigUint64(0, BigInt(offset), false); // big-endian absolute offset
      new Uint8Array(packed, 8).set(new Uint8Array(chunkBytes));

      dc.send(packed);

      const sent = chunkEnd - offset;
      bytesSentRef.current  += sent;
      speedBytesRef.current += sent;
      offset = chunkEnd;
    }

    // Send per-channel done marker
    if (!transferAborted.current) {
      dc.send(JSON.stringify({ type: 'stripe-done' }));
    }
  }

  async function sendFile(file, channels) {
    setState('transferring');
    startSpeedTracker(file.size, true);

    const buffer    = await file.arrayBuffer();
    const totalSize = file.size;

    // Send metadata on channel 0 first
    const meta = JSON.stringify({
      type: 'meta',
      name: file.name,
      size: totalSize,
      mimeType: file.type || 'application/octet-stream',
      numChannels: NUM_CHANNELS,
    });
    channels[0].send(meta);

    // Stripe the file across channels: each channel gets a contiguous slice
    const stripeSize = Math.ceil(totalSize / NUM_CHANNELS);
    await Promise.all(
      channels.map((dc, i) => {
        const start = i * stripeSize;
        const end   = Math.min(start + stripeSize, totalSize);
        return sendStripe(dc, buffer, start, end, totalSize);
      })
    );

    if (!transferAborted.current) {
      clearInterval(speedTimerRef.current);
      setProgress(100); setSpeed(0); setEta(0);
      setState('done');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RECEIVER
  // ─────────────────────────────────────────────────────────────────────────
  const joinTransfer = useCallback(async (transferCode) => {
    if (!transferCode || transferCode.length !== 6) return;

    transferAborted.current  = false;
    doneCountRef.current     = 0;
    receivedBytesRef.current = 0;
    rxSpeedBytesRef.current  = 0;
    receiveBufferRef.current = null;

    setState('connecting');
    setProgress(0); setSpeed(0); setEta(null); setError(''); setReceivedFile(null);

    const socket = getSocket();

    socket.emit('busy:join', transferCode, async (res) => {
      if (res?.error) { setError(res.error); setState('error'); return; }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      let metaReceived = false;

      pc.ondatachannel = ({ channel }) => {
        channel.binaryType = 'arraybuffer';
        channelsRef.current = [...channelsRef.current, channel];

        channel.onmessage = ({ data }) => {
          if (transferAborted.current) return;

          if (typeof data === 'string') {
            const msg = JSON.parse(data);

            if (msg.type === 'meta' && !metaReceived) {
              metaReceived = true;
              receivedMetaRef.current  = msg;
              receivedBytesRef.current = 0;
              rxSpeedBytesRef.current  = 0;
              doneCountRef.current     = 0;
              receiveBufferRef.current = new Uint8Array(msg.size);
              setFileMeta({ name: msg.name, size: msg.size, mimeType: msg.mimeType });
              setState('transferring');
              startSpeedTracker(msg.size, false);
            }

            if (msg.type === 'stripe-done') {
              doneCountRef.current++;
              if (doneCountRef.current === NUM_CHANNELS) {
                // All stripes received → assemble
                clearInterval(rxSpeedTimerRef.current);
                const meta = receivedMetaRef.current;
                const arr  = receiveBufferRef.current;
                const blob = new Blob([arr], { type: meta?.mimeType || 'application/octet-stream' });
                const url  = URL.createObjectURL(blob);
                setReceivedFile({ name: meta?.name || 'download', size: meta?.size || blob.size, mimeType: meta?.mimeType, blob, url });
                setProgress(100); setSpeed(0); setEta(0);
                setState('done');
              }
            }
            return;
          }

          // Binary chunk: [8 bytes absolute offset][data]
          if (data instanceof ArrayBuffer && receiveBufferRef.current) {
            const dv        = new DataView(data);
            const offset    = Number(dv.getBigUint64(0, false));
            const chunkData = new Uint8Array(data, 8);

            receiveBufferRef.current.set(chunkData, offset);

            receivedBytesRef.current += chunkData.byteLength;
            rxSpeedBytesRef.current  += chunkData.byteLength;
          }
        };
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('busy:ice', candidate);
      };

      socket.once('busy:offer', async (offer) => {
        if (transferAborted.current) return;
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('busy:answer', answer);
      });

      socket.on('busy:ice', async (c) => { try { await pc.addIceCandidate(c); } catch {} });
      socket.on('busy:cancelled',         () => { cleanup(); setState('cancelled'); });
      socket.on('busy:peer-disconnected', () => { cleanup(); setState('error'); setError('Sender disconnected.'); });
      socket.on('busy:error',             ({ message }) => { cleanup(); setState('error'); setError(message); });
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
    setCode(''); setProgress(0); setSpeed(0); setEta(null);
    setError(''); setReceivedFile(null); setFileMeta(null);
    transferAborted.current = false;
  }, [cleanup]);

  return {
    state, code, progress, speed, eta, error, fileMeta, receivedFile,
    maxBytes, isGuest,
    startTransfer, joinTransfer, cancel, reset,
  };
}
