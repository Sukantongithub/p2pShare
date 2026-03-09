/**
 * Busy Share — Socket.io Signaling Server
 *
 * Rooms live in memory: Map<code, RoomEntry>
 * Server only relays SDP + ICE — zero file bytes handled here.
 */

const ROOM_TTL_MS = 10 * 60 * 1000; // auto-expire rooms after 10 min

/**
 * Generate a random 6-digit numeric code (with leading zeros).
 */
function genCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export function attachSignaling(io) {
  /** @type {Map<string, {senderId:string, receiverId:string|null, timer:NodeJS.Timeout}>} */
  const rooms = new Map();

  function destroyRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    clearTimeout(room.timer);
    rooms.delete(code);
  }

  function resetTimer(code) {
    const room = rooms.get(code);
    if (!room) return;
    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      const r = rooms.get(code);
      if (r) {
        io.to(code).emit('busy:error', { message: 'Transfer session expired.' });
        io.in(code).socketsLeave(code);
        destroyRoom(code);
      }
    }, ROOM_TTL_MS);
  }

  io.on('connection', (socket) => {
    let myCode = null; // the room this socket is currently in

    // ── Sender: create a new room ────────────────────────────────────
    socket.on('busy:create', (cb) => {
      // Generate a unique code
      let code;
      let attempts = 0;
      do {
        code = genCode();
        attempts++;
      } while (rooms.has(code) && attempts < 20);

      if (rooms.has(code)) {
        return cb?.({ error: 'Server busy. Please try again.' });
      }

      myCode = code;
      socket.join(code);

      const timer = setTimeout(() => {
        io.to(code).emit('busy:error', { message: 'Transfer session expired.' });
        io.in(code).socketsLeave(code);
        destroyRoom(code);
      }, ROOM_TTL_MS);

      rooms.set(code, { senderId: socket.id, receiverId: null, timer });
      cb?.({ code });
      console.log(`[BusyShare] Room created: ${code}`);
    });

    // ── Receiver: join an existing room ─────────────────────────────
    socket.on('busy:join', (code, cb) => {
      const room = rooms.get(code);

      if (!room) {
        return cb?.({ error: 'No transfer found with this code.' });
      }
      if (room.receiverId) {
        return cb?.({ error: 'This transfer code is already in use.' });
      }

      myCode = code;
      room.receiverId = socket.id;
      socket.join(code);
      resetTimer(code);

      // Notify sender
      socket.to(code).emit('busy:receiver-joined');
      cb?.({ ok: true });
      console.log(`[BusyShare] Receiver joined room: ${code}`);
    });

    // ── WebRTC SDP / ICE relay ───────────────────────────────────────
    socket.on('busy:offer', (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit('busy:offer', payload);
    });

    socket.on('busy:answer', (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit('busy:answer', payload);
    });

    socket.on('busy:ice', (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit('busy:ice', payload);
    });

    // ── Cancel / disconnect ──────────────────────────────────────────
    socket.on('busy:cancel', () => {
      if (!myCode) return;
      socket.to(myCode).emit('busy:cancelled');
      io.in(myCode).socketsLeave(myCode);
      destroyRoom(myCode);
      myCode = null;
      console.log('[BusyShare] Transfer cancelled');
    });

    socket.on('disconnect', () => {
      if (!myCode) return;
      const room = rooms.get(myCode);
      if (room) {
        socket.to(myCode).emit('busy:peer-disconnected');
        destroyRoom(myCode);
        console.log(`[BusyShare] Peer disconnected, room ${myCode} destroyed`);
      }
    });
  });
}
