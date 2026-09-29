const TURN_SECONDS = 20;

class GameRoom {
  constructor(roomId, mode, dictionary, io, options) {
    this.roomId = roomId;
    this.mode = mode; // 'classic' | 'blitz'
    this.dictionary = dictionary;
    this.io = io;
    this.totalBlitzRounds = options.blitzRounds && options.blitzRounds > 0
      ? options.blitzRounds
      : 10;
    this.targetWins = options.targetWins && options.targetWins > 0
      ? options.targetWins
      : 5;

    this.players = []; // { id, name, alive, attempts, score, hasAnswered, ready }
    this.currentTurnIndex = -1;
    this.chain = [];
    this.usedPhrases = new Set();
    this.timer = null;
    this.roundDeadline = null;
    this.status = 'waiting'; // waiting | playing | roundOver
    this.currentPrompt = null;
    this.roundCount = 0;
    this.roundNumber = 0;
    this.lastWinner = null;
  }

  // ===================== HELPER =====================
  isTwoSyllableWord(phrase) {
    const trimmed = phrase.trim().toLowerCase();
    if (!trimmed) return false;
    if (trimmed.includes('-')) return false;
    const syllables = trimmed.split(/\s+/);
    return syllables.length === 2;
  }

  // ✅ Helper — map players thành leaderboard object sạch
  toLeaderboard() {
    return this.players
      .map(p => ({ id: p.id, name: p.name, score: p.score, alive: p.alive }))
      .sort((a, b) => b.score - a.score);
  }

  // ✅ Helper — bắn bảng điểm real-time cho cả phòng
  broadcastScoreboard() {
    this.io.to(this.roomId).emit('scoreboard:update', this.toLeaderboard());
  }

  // ✅ Helper — lấy random seed 2 âm tiết
  getRandomTwoSyllableWord() {
    let word;
    let attempts = 0;
    do {
      word = this.dictionary.getRandomWord(); // sửa: random đều thay vì random theo key
      attempts++;
    } while (!this.isTwoSyllableWord(word) && attempts < 50);

    if (!this.isTwoSyllableWord(word)) word = 'biển cả';
    return word;
  }

  // Helper — khởi tạo chain Classic
  startClassicChain() {
    const seed = this.getRandomTwoSyllableWord(); // sửa: dùng seed 2 âm tiết đầy đủ
    this.chain.push({ phrase: seed, by: 'Hệ thống' });
    this.usedPhrases.add(this.dictionary.normalize(seed));
    this.io.to(this.roomId).emit('classic:seed', { seed, chain: this.chain });
    this.nextTurn();
  }

  getRandomSeedSyllable() {
    const fullWord = this.getRandomTwoSyllableWord();
    return fullWord.trim().split(/\s+/)[0];
  }

  // ===================== PLAYER MGMT =====================
  addPlayer(id, name) {
    const spectating = this.status === 'playing';
    this.players.push({
      id, name,
      alive: !spectating,       // spectator không nằm trong vòng lượt hiện tại
      attempts: 0,
      score: 0,
      hasAnswered: spectating,  // để không cản check "mọi người đã trả lời" ở Blitz
      ready: false,
      spectating,
    });
    this.broadcastScoreboard();
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    this.broadcastScoreboard();
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  // Đánh dấu sẵn sàng
  setReady(playerId, isReady) {
    const player = this.getPlayer(playerId);
    if (!player) return;

    player.ready = isReady;

    this.io.to(this.roomId).emit('player:readyChanged', {
      playerId,
      name: player.name,
      ready: player.ready,
      readyCount: this.players.filter(p => p.ready).length,
      totalPlayers: this.players.length,
    });

    if (this.status === 'roundOver' && this.allReady()) {
      this.startNextRound();
    }
  }

  allReady() {
    return this.players.length >= 2 && this.players.every(p => p.ready);
  }

  // ===================== START =====================
  start() {
    if (this.players.length < 2) return;
    this.roundNumber = 1;
    this.startRound();
  }

  // Bắt đầu vòng mới (giữ nguyên điểm + người chơi)
  startNextRound() {
    if (this.players.length < 2) return;

    this.roundNumber++;

    this.players.forEach(p => {
      p.alive = true;
      p.attempts = 0;
      p.hasAnswered = false;
      p.ready = false;
      p.spectating = false;
      if (this.mode === 'blitz') p.score = 0;
    });

    this.chain = [];
    this.usedPhrases.clear();
    this.status = 'playing';

    this.io.to(this.roomId).emit('round:starting', {
      round: this.roundNumber,
      players: this.players.map(p => ({
        id: p.id, name: p.name, score: p.score,
      })),
    });

    if (this.mode === 'classic') {
      this.startClassicChain();
    } else {
      this.roundCount = 0;
      this.nextBlitzRound();
    }
    this.broadcastScoreboard();
  }

  insertRescueWord() {
    const seed = this.getRandomTwoSyllableWord(); // sửa: dùng seed 2 âm tiết đầy đủ
    this.chain.push({ phrase: seed, by: 'Hệ thống' });
    this.usedPhrases.add(this.dictionary.normalize(seed));
    this.io.to(this.roomId).emit('classic:rescue', { seed, chain: this.chain });
  }

  // Lần đầu gọi startRound = start()
  startRound() {
    this.players.forEach(p => {
      p.alive = true;
      p.attempts = 0;
      p.hasAnswered = false;
      p.ready = false;
      p.spectating = false;
    });

    this.chain = [];
    this.usedPhrases.clear();
    this.status = 'playing';

    this.io.to(this.roomId).emit('round:starting', {
      round: this.roundNumber,
      players: this.players.map(p => ({
        id: p.id, name: p.name, score: p.score,
      })),
    });

    if (this.mode === 'classic') {
      this.startClassicChain();
    } else {
      this.roundCount = 0;
      this.nextBlitzRound();
    }
    this.broadcastScoreboard();
  }

  // ===================== CLASSIC =====================
  nextTurn() {
    clearTimeout(this.timer);

    this.players.forEach(p => {
      if (p.spectating) {
        p.spectating = false;
        p.alive = true;
        p.hasAnswered = false;
        this.io.to(p.id).emit('player:promoted');
      }
    });

    const activePlayers = this.players.filter(p => p.alive);
    if (activePlayers.length <= 1) {
      this.endRound(activePlayers[0] || null);
      return;
    }

    do {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    } while (!this.players[this.currentTurnIndex].alive);

    const currentPlayer = this.players[this.currentTurnIndex];
    currentPlayer.attempts = 0;

    const requiredSyllable = this.dictionary.lastSyllable(
      this.chain[this.chain.length - 1].phrase
    );

    this.roundDeadline = Date.now() + TURN_SECONDS * 1000;

    this.io.to(this.roomId).emit('classic:turn', {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      requiredSyllable,
      deadline: this.roundDeadline,
      chain: this.chain,
    });

    this.timer = setTimeout(() => {
      this.eliminatePlayer(currentPlayer, 'Hết thời gian');
      this.insertRescueWord();
      this.nextTurn();
    }, TURN_SECONDS * 1000);
  }

  submitClassic(playerId, phrase) {
    if (this.status !== 'playing') return;
    const player = this.getPlayer(playerId);
    if (!player || !player.alive) return;
    if (this.players[this.currentTurnIndex]?.id !== playerId) return;

    if (!this.isTwoSyllableWord(phrase)) {
      player.attempts++;
      this.io.to(this.roomId).emit('classic:wrongFlash', {
        playerId: player.id,
        playerName: player.name,
        phrase,
      });
      if (player.attempts >= 3) {
        clearTimeout(this.timer);
        this.eliminatePlayer(player, 'Sai quá 3 lần');
        this.insertRescueWord();
        this.nextTurn();
      } else {
        this.io.to(playerId).emit('classic:wrong', {
          attemptsLeft: 3 - player.attempts,
          reason: 'Từ phải có đúng 2 âm tiết, không chứa dấu "-"',
        });
      }
      return;
    }

    const requiredSyllable = this.dictionary.lastSyllable(
      this.chain[this.chain.length - 1].phrase
    );

    if (this.dictionary.isValid(requiredSyllable, phrase, this.usedPhrases)) {
      clearTimeout(this.timer);
      this.chain.push({ phrase, by: player.name });
      this.usedPhrases.add(this.dictionary.normalize(phrase));

      this.io.to(this.roomId).emit('classic:accepted', {
        playerId,
        playerName: player.name,
        phrase,
        chain: this.chain,
      });

      this.nextTurn();
    } else {
      player.attempts++;
      this.io.to(this.roomId).emit('classic:wrongFlash', {
        playerId: player.id,
        playerName: player.name,
        phrase,
      });
      if (player.attempts >= 3) {
        clearTimeout(this.timer);
        this.eliminatePlayer(player, 'Sai quá 3 lần');
        this.insertRescueWord();
        this.nextTurn();
      } else {
        this.io.to(playerId).emit('classic:wrong', {
          attemptsLeft: 3 - player.attempts,
        });
      }
    }
  }

  eliminatePlayer(player, reason) {
    player.alive = false;
    this.broadcastScoreboard(); // thêm dòng này để chip đổi màu ngay lập tức
    this.io.to(this.roomId).emit('player:eliminated', {
      playerId: player.id,
      name: player.name,
      reason,
    });
  }

  // ===================== BLITZ =====================
  nextBlitzRound() {
    clearTimeout(this.timer);
    this.players.forEach(p => {
      if (p.spectating) {
        p.spectating = false;
        this.io.to(p.id).emit('player:promoted');
      }
      p.hasAnswered = false;
    });

    const { seed, answer } = this.dictionary.getRandomSeedWithAnswer(); // sửa
    this.currentPrompt = seed;
    this.currentAnswer = answer; // thêm — lưu lại để hiện đáp án khi hết lượt
    const requiredSyllable = seed;
    this.roundDeadline = Date.now() + TURN_SECONDS * 1000;
    this.roundCount++;

    this.io.to(this.roomId).emit('blitz:roundStart', {
      prompt: this.currentPrompt,
      requiredSyllable,
      deadline: this.roundDeadline,
      round: this.roundCount,
    });

    this.timer = setTimeout(() => this.endBlitzRound(), TURN_SECONDS * 1000);
  }

  submitBlitz(playerId, phrase) {
    if (this.status !== 'playing') return;
    const player = this.getPlayer(playerId);
    if (!player || player.hasAnswered || player.spectating) return;

    if (!this.isTwoSyllableWord(phrase)) {
      this.io.to(playerId).emit('blitz:wrong', {
        message: 'Từ phải có đúng 2 âm tiết, không chứa dấu "-"',
      });
      return;
    }

    const requiredSyllable = this.dictionary.lastSyllable(this.currentPrompt);

    if (this.dictionary.isValid(requiredSyllable, phrase, new Set())) {
      player.hasAnswered = true;
      const timeLeft = Math.max(
        0,
        Math.floor((this.roundDeadline - Date.now()) / 1000)
      );
      player.score += timeLeft;
      this.broadcastScoreboard();

      // Chỉ gửi riêng cho người vừa trả lời — không broadcast cho cả phòng
      this.io.to(playerId).emit('blitz:playerAnswered', {
        phrase,
        pointsEarned: timeLeft, // điểm của vòng này, không phải tổng
      });

      if (this.players.every(p => p.hasAnswered)) {
        clearTimeout(this.timer);
        this.endBlitzRound();
      }
    } else {
      this.io.to(playerId).emit('blitz:wrong', { message: 'Từ không hợp lệ' });
    }
  }

  // endBlitzRound — gửi BXH sạch + đúng định dạng
  endBlitzRound() {
    const leaderboard = this.toLeaderboard();
    const isLastRound = this.roundCount >= this.totalBlitzRounds;
    const nextRoundAt = isLastRound ? null : Date.now() + 4000;

    this.io.to(this.roomId).emit('blitz:leaderboard', {
      leaderboard,
      round: this.roundCount,
      sampleAnswer: this.currentAnswer, // thêm — đáp án mẫu
      nextRoundAt, // thêm — mốc thời gian bắt đầu lượt kế (null nếu là lượt cuối)
    });

    if (isLastRound) {
      const winner = leaderboard[0]
        ? this.getPlayer(leaderboard[0].id)
        : null;
      this.endRound(winner);
    } else {
      setTimeout(() => this.nextBlitzRound(), 4000);
    }
  }

  // ===================== END ROUND =====================
  endRound(winner) {
    clearTimeout(this.timer);
    this.status = 'roundOver';
    this.lastWinner = winner;

    if (winner) {
      winner.score += 1;
    }

    // ===== Kiểm tra thắng chung cuộc (chỉ áp dụng chế độ Classic) =====
    if (this.mode === 'classic' && winner && winner.score >= this.targetWins) {
      this.broadcastScoreboard();

      this.io.to(this.roomId).emit('game:over', {
        winner: { id: winner.id, name: winner.name, score: winner.score },
        chain: this.chain,
        leaderboard: this.toLeaderboard(),
        message: winner.name + ' đã thắng ' + this.targetWins + ' ván và giành chiến thắng chung cuộc!',
      });

      // Reset điểm để chơi tiếp ván mới ngay trong phòng
      this.players.forEach(p => {
        p.score = 0;
        p.ready = false;
      });
      this.roundNumber = 0;
      // status vẫn giữ 'roundOver' để nút "Sẵn sàng" hoạt động cho ván tiếp theo
      this.broadcastScoreboard();
      return;
    }

    this.broadcastScoreboard();

    if (winner) {
      this.io.to(this.roomId).emit('round:over', {
        winner: { id: winner.id, name: winner.name, score: winner.score },
        round: this.roundNumber,
        chain: this.chain,
        leaderboard: this.toLeaderboard(),
        message: winner.name + ' thắng vòng ' + this.roundNumber + '! +1 điểm',
      });
    } else {
      this.io.to(this.roomId).emit('round:over', {
        winner: null,
        round: this.roundNumber,
        chain: this.chain,
        leaderboard: this.toLeaderboard(),
        message: 'Hòa! Không ai thắng vòng ' + this.roundNumber + '.',
      });
    }

    this.players.forEach(p => (p.ready = false));

    this.io.to(this.roomId).emit('waiting:ready', {
      message: 'Nhấn "Sẵn sàng" để bắt đầu vòng tiếp theo',
      readyCount: 0,
      totalPlayers: this.players.length,
    });
}

  // ===================== CLEANUP =====================
  destroy() {
    clearTimeout(this.timer);
  }
}

module.exports = GameRoom;