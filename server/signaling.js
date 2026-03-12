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
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
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
        io.to(code).emit("busy:error", {
          message: "Transfer session expired.",
        });
        io.in(code).socketsLeave(code);
        destroyRoom(code);
      }
    }, ROOM_TTL_MS);
  }

  // ─── LAN Share rooms (separate namespace, lan:* events) ──────────────────
  /** @type {Map<string, {senderId:string, receiverId:string|null, timer:NodeJS.Timeout}>} */
  const lanRooms = new Map();

  function destroyLANRoom(code) {
    const room = lanRooms.get(code);
    if (!room) return;
    clearTimeout(room.timer);
    lanRooms.delete(code);
  }

  function resetLANTimer(code) {
    const room = lanRooms.get(code);
    if (!room) return;
    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      const r = lanRooms.get(code);
      if (r) {
        // Use prefixed socket.io room name to avoid collision with BusyShare rooms
        io.to(`lan-${code}`).emit("lan:error", {
          message: "Transfer session expired.",
        });
        io.in(`lan-${code}`).socketsLeave(`lan-${code}`);
        destroyLANRoom(code);
      }
    }, ROOM_TTL_MS);
  }

  io.on("connection", (socket) => {
    let myCode = null; // the BusyShare room this socket is in
    let myLANCode = null; // the LAN Share room this socket is in

    // ── Sender: create a new room ────────────────────────────────────
    socket.on("busy:create", (cb) => {
      // Generate a unique code
      let code;
      let attempts = 0;
      do {
        code = genCode();
        attempts++;
      } while (rooms.has(code) && attempts < 20);

      if (rooms.has(code)) {
        return cb?.({ error: "Server busy. Please try again." });
      }

      myCode = code;
      socket.join(code);

      const timer = setTimeout(() => {
        io.to(code).emit("busy:error", {
          message: "Transfer session expired.",
        });
        io.in(code).socketsLeave(code);
        destroyRoom(code);
      }, ROOM_TTL_MS);

      rooms.set(code, { senderId: socket.id, receiverId: null, timer });
      cb?.({ code });
      console.log(`[BusyShare] Room created: ${code}`);
    });

    // ── Receiver: join an existing room ─────────────────────────────
    socket.on("busy:join", (code, cb) => {
      const room = rooms.get(code);

      if (!room) {
        return cb?.({ error: "No transfer found with this code." });
      }
      if (room.receiverId) {
        return cb?.({ error: "This transfer code is already in use." });
      }

      myCode = code;
      room.receiverId = socket.id;
      socket.join(code);
      resetTimer(code);

      // Notify sender
      socket.to(code).emit("busy:receiver-joined");
      cb?.({ ok: true });
      console.log(`[BusyShare] Receiver joined room: ${code}`);
    });

    // ── WebRTC SDP / ICE relay ───────────────────────────────────────
    socket.on("busy:offer", (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit("busy:offer", payload);
    });

    socket.on("busy:answer", (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit("busy:answer", payload);
    });

    socket.on("busy:ice", (payload) => {
      if (!myCode) return;
      socket.to(myCode).emit("busy:ice", payload);
    });

    // ── Cancel / disconnect ──────────────────────────────────────────
    socket.on("busy:cancel", () => {
      if (!myCode) return;
      socket.to(myCode).emit("busy:cancelled");
      io.in(myCode).socketsLeave(myCode);
      destroyRoom(myCode);
      myCode = null;
      console.log("[BusyShare] Transfer cancelled");
    });

    // ═══════════════════════════════════════════════════════════════
    //  LAN Share Signaling (lan:* events — separate from BusyShare)
    //  Socket.io rooms are prefixed with "lan-" to avoid collisions.
    // ═══════════════════════════════════════════════════════════════

    // Sender: create a new LAN room
    socket.on("lan:create", (cb) => {
      let code;
      let attempts = 0;
      do {
        code = genCode();
        attempts++;
      } while (lanRooms.has(code) && attempts < 20);

      if (lanRooms.has(code)) {
        return cb?.({ error: "Server busy. Please try again." });
      }

      myLANCode = code;
      socket.join(`lan-${code}`);

      const timer = setTimeout(() => {
        io.to(`lan-${code}`).emit("lan:error", {
          message: "Transfer session expired.",
        });
        io.in(`lan-${code}`).socketsLeave(`lan-${code}`);
        destroyLANRoom(code);
      }, ROOM_TTL_MS);

      lanRooms.set(code, { senderId: socket.id, receiverId: null, timer });
      cb?.({ code });
      console.log(`[LANShare] Room created: ${code}`);
    });

    // Receiver: join an existing LAN room
    socket.on("lan:join", (code, cb) => {
      const room = lanRooms.get(code);
      if (!room) return cb?.({ error: "No transfer found with this code." });
      if (room.receiverId)
        return cb?.({ error: "This transfer code is already in use." });

      myLANCode = code;
      room.receiverId = socket.id;
      socket.join(`lan-${code}`);
      resetLANTimer(code);

      socket.to(`lan-${code}`).emit("lan:receiver-joined");
      cb?.({ ok: true });
      console.log(`[LANShare] Receiver joined room: ${code}`);
    });

    // WebRTC SDP / ICE relay for LAN
    socket.on("lan:offer", (payload) => {
      if (myLANCode) socket.to(`lan-${myLANCode}`).emit("lan:offer", payload);
    });
    socket.on("lan:answer", (payload) => {
      if (myLANCode) socket.to(`lan-${myLANCode}`).emit("lan:answer", payload);
    });
    socket.on("lan:ice", (payload) => {
      if (myLANCode) socket.to(`lan-${myLANCode}`).emit("lan:ice", payload);
    });

    // LAN detection: peer tells us their local-IP status
    socket.on("lan:local-ip", ({ isLocal }) => {
      if (!myLANCode) return;
      // Relay to the other peer as "peer-local-ip"
      socket.to(`lan-${myLANCode}`).emit("lan:peer-local-ip", { isLocal });
    });

    // Cancel LAN transfer
    socket.on("lan:cancel", () => {
      if (!myLANCode) return;
      socket.to(`lan-${myLANCode}`).emit("lan:cancelled");
      io.in(`lan-${myLANCode}`).socketsLeave(`lan-${myLANCode}`);
      destroyLANRoom(myLANCode);
      myLANCode = null;
      console.log("[LANShare] Transfer cancelled");
    });

    socket.on("disconnect", () => {
      // BusyShare cleanup
      if (myCode) {
        const room = rooms.get(myCode);
        if (room) {
          socket.to(myCode).emit("busy:peer-disconnected");
          destroyRoom(myCode);
          console.log(
            `[BusyShare] Peer disconnected, room ${myCode} destroyed`,
          );
        }
        myCode = null;
      }
      // LAN Share cleanup
      if (myLANCode) {
        const lanRoom = lanRooms.get(myLANCode);
        if (lanRoom) {
          socket.to(`lan-${myLANCode}`).emit("lan:peer-disconnected");
          destroyLANRoom(myLANCode);
          console.log(
            `[LANShare] Peer disconnected, room ${myLANCode} destroyed`,
          );
        }
        myLANCode = null;
      }
    });
  });
}
