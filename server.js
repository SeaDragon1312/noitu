const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const Dictionary = require('./dictionary');
const GameRoom = require('./game-room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname)));

// Load dictionary
let dictData = {};
try {
  dictData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'dictionary.json'), 'utf8')
  );
} catch (e) {
  console.warn('Warning: dictionary.json not found, using empty dictionary');
}
const dictionary = new Dictionary(dictData);

// Room management: roomCode -> { room: GameRoom, hostId: string }
const rooms = new Map();

function genRoomCode() {
  const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const parts = [];
  for (let p = 0; p < 3; p++) {
    let s = '';
    for (let i = 0; i < 3; i++) s += ch[Math.floor(Math.random() * ch.length)];
    parts.push(s);
  }
  return parts.join('-');
}

function getRoomList() {
  const list = [];
  for (const [code, entry] of rooms) {
    list.push({
      code,
      mode: entry.room.mode,
      status: entry.room.status, // 'waiting' | 'playing' | 'roundOver'
      playerCount: entry.room.players.length,
    });
  }
  return list;
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

function findRoomBySocketId(socketId) {
  for (const [code, entry] of rooms) {
    if (entry.room.players.find((p) => p.id === socketId)) {
      return { code, room: entry.room };
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.emit('roomList', getRoomList());

  socket.on('getRoomList', () => {
    socket.emit('roomList', getRoomList());
  });

  // ---- Create room ----
  socket.on('createRoom', ({ playerName, mode = 'classic', blitzRounds, targetWins }) => {
    const code = genRoomCode();

    let totalBlitzRounds = parseInt(blitzRounds, 10);
    if (!Number.isFinite(totalBlitzRounds) || totalBlitzRounds < 1) totalBlitzRounds = 10;
    if (totalBlitzRounds > 50) totalBlitzRounds = 50;

    let winsNeeded = parseInt(targetWins, 10);
    if (!Number.isFinite(winsNeeded) || winsNeeded < 1) winsNeeded = 5;
    if (winsNeeded > 50) winsNeeded = 50;

    const room = new GameRoom(code, mode, dictionary, io, {
      blitzRounds: totalBlitzRounds,
      targetWins: winsNeeded,
    });
    room.addPlayer(socket.id, playerName);
    rooms.set(code, { room, hostId: socket.id });
    socket.join(code);

    socket.roomCode = code;

    socket.emit('roomCreated', { code, playerId: socket.id, mode });
    io.to(code).emit('players', room.players);
    broadcastRoomList();
  });

  // ---- Join room ----
  socket.on('joinRoom', ({ code, playerName }) => {
    const entry = rooms.get(code);
    if (!entry) {
      socket.emit('error', 'Không tìm thấy phòng');
      return;
    }
    if (entry.room.players.length >= 10) {
      socket.emit('error', 'Phòng đã đầy (tối đa 10 người)');
      return;
    }
    if (entry.room.players.find((p) => p.name === playerName)) {
      socket.emit('error', 'Tên đã được sử dụng');
      return;
    }

    const wasPlaying = entry.room.status === 'playing';
    entry.room.addPlayer(socket.id, playerName);
    socket.join(code);
    socket.roomCode = code;

    socket.emit('joinedRoom', { code, playerId: socket.id, spectating: wasPlaying });
    io.to(code).emit('players', entry.room.players);
    broadcastRoomList();

    // Nếu ván đang chạy, đồng bộ trạng thái hiện tại cho người mới để họ xem trực tiếp
    if (wasPlaying) {
      const room = entry.room;
      socket.emit('gameStarted', {
        mode: room.mode,
        totalBlitzRounds: room.totalBlitzRounds,
        targetWins: room.targetWins,
      });
      if (room.mode === 'classic') {
        socket.emit('classic:seed', { seed: room.chain[0]?.phrase, chain: room.chain });
        const currentPlayer = room.players[room.currentTurnIndex];
        if (currentPlayer && room.chain.length) {
          socket.emit('classic:turn', {
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            requiredSyllable: room.dictionary.lastSyllable(room.chain[room.chain.length - 1].phrase),
            deadline: room.roundDeadline,
            chain: room.chain,
          });
        }
      } else {
        socket.emit('blitz:roundStart', {
          prompt: room.currentPrompt,
          requiredSyllable: room.dictionary.lastSyllable(room.currentPrompt),
          deadline: room.roundDeadline,
          round: room.roundCount,
        });
      }

      socket.emit('spectating:info', {
        message: 'Ván đang diễn ra — bạn đang xem, bạn sẽ được chơi ngay từ lượt tiếp theo!',
      });
    }
  });

  // ---- Start game ----
  socket.on('startGame', () => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;

    const { code, room } = found;
    if (room.players.length < 2) {
      socket.emit('error', 'Cần ít nhất 2 người chơi');
      return;
    }

    room.start();
    io.to(code).emit('gameStarted', {
      mode: room.mode,
      totalBlitzRounds: room.totalBlitzRounds,
      targetWins: room.targetWins,
    });
    broadcastRoomList();
  });

  // ---- Classic submit ----
  socket.on('classic:submit', ({ word }) => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    found.room.submitClassic(socket.id, word);
  });

  // ---- Blitz submit ----
  socket.on('blitz:submit', ({ word }) => {
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    found.room.submitBlitz(socket.id, word);
  });

  // ---- Ready / Not Ready ----
  socket.on('player:ready', () => {
    const entry = rooms.get(socket.roomCode);
    if (!entry) return;
    entry.room.setReady(socket.id, true);
  });

  socket.on('player:notReady', () => {
    const entry = rooms.get(socket.roomCode);
    if (!entry) return;
    entry.room.setReady(socket.id, false);
  });

  // ---- Chat ----
  socket.on('chat:message', ({ message }) => {
    const entry = rooms.get(socket.roomCode);
    if (!entry) return;
    const player = entry.room.getPlayer(socket.id);
    if (!player || !message || !message.trim()) return;

    io.to(socket.roomCode).emit('chat:message', {
      playerId: socket.id,
      playerName: player.name,
      message: message.trim().slice(0, 200),
      time: Date.now(),
    });
  });

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    const found = findRoomBySocketId(socket.id);
    if (!found) return;

    const { code, room } = found;
    room.removePlayer(socket.id);

    if (room.players.length === 0) {
      room.destroy();
      rooms.delete(code);
      console.log('Room deleted:', code);
    } else {
      io.to(code).emit('players', room.players);
      io.to(code).emit('player:left', { playerId: socket.id });
    }
    broadcastRoomList();
  });
});

server.listen(3010, () => {
  console.log('🎮 Nối Từ Tiếng Việt server running on http://localhost:3010');
});