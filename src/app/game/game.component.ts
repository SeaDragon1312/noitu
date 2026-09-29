import { Component, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef, inject, PLATFORM_ID, HostListener } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SocketService } from '../services/socket.service';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
})
export class GameComponent implements OnInit, OnDestroy, AfterViewChecked {
  // ===== GAME STATE =====
  mode: 'classic' | 'blitz' = 'classic';
  currentInput = '';
  requiredSyllable = '';
  promptWord = '';
  chain: any[] = [];
  extraCols = [
  'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ',
  'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW', 'BX', 'BY', 'BZ',
  'CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI', 'CJ', 'CK', 'CL', 'CM', 'CN', 'CO', 'CP', 'CQ', 'CR', 'CS', 'CT', 'CU', 'CV'
  ];
  
  bossExtraCols = [
  'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ',
  'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW', 'BX', 'BY', 'BZ',
  'CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI', 'CJ', 'CK', 'CL', 'CM', 'CN', 'CO', 'CP', 'CQ', 'CR', 'CS', 'CT', 'CU', 'CV'
  ];

  isMyTurn = false;
  myName = 'Bạn';
  currentTurnName = '';
  timeLeft = 20;
  wrongAttempts = 0;
  eliminated = false;
  gameOver = false;
  winnerName = '';
  blitzLeaderboard: any[] = [];
  blitzRound = 0;

  // Hiện BXH Blitz giữa các lượt
  showBlitzLeaderboard = false;

  // ===== LOGIN / ROOM =====
  playerName = '';
  roomCodeInput = '';
  roomCode = '';
  inRoom = false;
  gameStarted = false;
  playerCount = 0;

  // ===== BOSS KEY =====
  bossMode = false;
  bossData: any[] = [];

  // ===== TOAST =====
  toastVisible = false;
  toastMessage = '';
  toastType: 'info' | 'error' | 'success' = 'info';
  private toastTimeout: any;

  // ===== TIMER =====
  private lastChainLength = 0;
  private timerInterval: any;
  private platformId = inject(PLATFORM_ID);
  

  // ===== READY / ROUND OVER =====
  waitingForReady = false;
  isReady = false;
  readyCount = 0;
  totalPlayers = 0;
  roundNumber = 1;
  roundMessage = '';
  roundLeaderboard: any[] = [];
  roundWinner: any = null;

  // ===== SCOREBOARD (real-time) =====
  scoreboard: { id: string; name: string; score: number; alive?: boolean }[] = [];

  currentTurnPlayerId = '';
  // ===== ELIMINATION BANNER (góc dưới trái) =====
  eliminationMessage: string | null = null;
  private eliminationTimeout: any;

  // ===== WRONG FLASH (chỉ Classic) =====
  wrongFlash: { playerName: string; playerId: string; phrase: string } | null = null;
  private wrongFlashTimeout: any;

  // ===== SPECTATOR =====
  isSpectating = false;

  blitzFakeRows: { stt: number; content: string; staff: string; note: string }[] = [];
  openRooms: { code: string; mode: string; status: string; playerCount: number }[] = [];
  blitzAnswered = false;
  totalBlitzRounds = 10;
  blitzRoundsInput = 10;
  targetWinsInput = 5;
  targetWins = 5;
  blitzSampleAnswer = '';
  nextRoundCountdown = 0;
  private nextRoundInterval: any;

  // ===== CHAT =====
  chatMessages: { playerId: string; playerName: string; message: string; time: number }[] = [];
  chatInput = '';
  chatOpen = false;
  unreadChat = 0;
  chatPreview: { playerName: string; message: string } | null = null;
  private chatPreviewTimeout: any;


  @ViewChild('chatMessagesEl') chatMessagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('wordInputEl') wordInputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('chatInputEl') chatInputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('gridContainerEl') gridContainerEl?: ElementRef<HTMLDivElement>;

  constructor(private socketService: SocketService) {}

  // ===== BOSS KEY: Escape để toggle =====
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.toggleBossMode();
    } else if (event.key === 'Enter') {
      // Ngăn Enter kích hoạt lại các phần tử đang được focus (ví dụ: button cũ)
      event.preventDefault(); 

      if (this.waitingForReady && !this.isReady) {
        this.onReadyClick();
      }
    }
  }



  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const socket = this.socketService.socket;
    if (!socket) return;

    // ===== ROOM EVENTS =====
    socket.on('roomCreated', (data: any) => {
      this.roomCode = data.code;
      this.inRoom = true;
      this.gameStarted = false;
      this.showToast(`Phòng đã tạo: ${data.code}`, 'success');
    });

    socket.on('joinedRoom', (data: any) => {
      this.roomCode = data.code;
      this.inRoom = true;
      this.gameStarted = false;
      this.isSpectating = !!data.spectating;
      this.showToast(
        data.spectating ? `Đã vào phòng ${data.code} — đang xem, sẽ được chơi từ lượt tiếp theo` : `Đã tham gia phòng: ${data.code}`,
        data.spectating ? 'info' : 'success'
      );
    });

    socket.on('roomList', (list: any[]) => {
      this.openRooms = list;
    });

    socket.emit('getRoomList');

    socket.on('player:promoted', () => {
      this.isSpectating = false;
      this.showToast('🎮 Bạn đã được vào chơi!', 'success');
    });

    socket.on('spectating:info', (data: any) => {
      this.showToast(data.message, 'info');
    });

    socket.on('players', (players: any[]) => {
      this.playerCount = players.length;
      this.totalPlayers = players.length;
    });

    socket.on('gameStarted', (data: any) => {
      this.gameStarted = true;
      this.mode = data.mode;
      this.totalBlitzRounds = data.totalBlitzRounds || 10;
      this.targetWins = data.targetWins || 5; // thêm dòng này
      this.waitingForReady = false;
      this.gameOver = false;
      this.showBlitzLeaderboard = false;
      this.showToast('Game bắt đầu!', 'success');
    });

    socket.on('error', (msg: string) => {
      this.showToast(msg, 'error');
    });

    // ===== CLASSIC =====
    socket.on('classic:seed', (data: any) => {
      this.chain = data.chain;
    });

    socket.on('classic:turn', (data: any) => {
      this.isMyTurn = data.playerId === this.socketService.myId;
      this.currentTurnName = data.playerName;
      this.currentTurnPlayerId = data.playerId;
      this.requiredSyllable = data.requiredSyllable;
      this.chain = data.chain;
      this.wrongAttempts = 0;
      this.startTimer(data.deadline);

      if (this.isMyTurn) {
        this.showToast('🎯 Đến lượt bạn!', 'success');
        this.focusWordInput(this.requiredSyllable + ' ');
      }
    });

    socket.on('classic:wrong', (data: any) => {
      this.wrongAttempts = 3 - data.attemptsLeft;
      const reason = data.reason ? ` (${data.reason})` : '';
      this.showToast(`Sai! Còn ${data.attemptsLeft} lượt${reason}`, 'error');
      if (this.isMyTurn) {
        this.focusWordInput(this.requiredSyllable + ' ');
      }
    });

    socket.on('classic:rescue', (data: any) => {
      this.chain = data.chain;
      this.showToast(`🆘 Hệ thống thêm từ mới: "${data.seed}"`, 'info');
    });

    socket.on('classic:accepted', (data: any) => {
      this.chain = data.chain;
      this.currentInput = '';
    });

    socket.on('classic:wrongFlash', (data: any) => {
      if (this.mode !== 'classic') return;
      this.wrongFlash = { playerName: data.playerName, playerId: data.playerId, phrase: data.phrase };
      clearTimeout(this.wrongFlashTimeout);
      this.wrongFlashTimeout = setTimeout(() => (this.wrongFlash = null), 2000);
    });

    socket.on('player:eliminated', (data: any) => {
      if (data.playerId === this.socketService.myId) {
        this.eliminated = true;
      }
      this.eliminationMessage =
        data.playerId === this.socketService.myId
          ? `Bạn bị loại: ${data.reason}`
          : `${data.name} bị loại: ${data.reason}`;
      clearTimeout(this.eliminationTimeout);
      this.eliminationTimeout = setTimeout(() => (this.eliminationMessage = null), 4000);
    });

    // ===== BLITZ =====
    socket.on('blitz:roundStart', (data: any) => {
      this.promptWord = data.prompt;
      this.requiredSyllable = data.requiredSyllable;
      this.blitzRound = data.round;
      this.blitzAnswered = false;
      this.showBlitzLeaderboard = false;
      clearInterval(this.nextRoundInterval); // thêm
      this.startTimer(data.deadline);
      this.focusWordInput(data.requiredSyllable + ' ');
    });

    socket.on('blitz:playerAnswered', (data: any) => {
      this.blitzAnswered = true;
      this.currentInput = data.phrase; // giữ cố định từ vừa nhập đúng trong ô
      this.showToast(`Bạn đã trả lời đúng! +${data.pointsEarned}đ`, 'success');
    });

    socket.on('blitz:wrong', (data: any) => {
      this.showToast(data.message, 'error');
      if (this.mode === 'blitz') {
        this.focusWordInput(this.requiredSyllable + ' ');
      }
    });

    socket.on('blitz:leaderboard', (data: any) => {
      this.blitzLeaderboard = data.leaderboard;
      this.blitzSampleAnswer = data.sampleAnswer || ''; // thêm

      clearInterval(this.nextRoundInterval);
      if (data.nextRoundAt) {
        this.updateNextRoundCountdown(data.nextRoundAt);
        this.nextRoundInterval = setInterval(() => this.updateNextRoundCountdown(data.nextRoundAt), 200);
      } else {
        this.nextRoundCountdown = 0;
      }

      this.showBlitzLeaderboard = true;
    });

    // ===== ROUND OVER =====
    socket.on('round:over', (data: any) => {
      this.gameOver = false;
      this.waitingForReady = true;
      this.showBlitzLeaderboard = false;
      this.roundWinner = data.winner;
      this.roundMessage = data.message;
      this.roundNumber = data.round;
      this.roundLeaderboard = data.leaderboard || [];
      this.isReady = false;
      this.eliminated = false;
      clearInterval(this.timerInterval);

      if (data.winner) {
        this.showToast(`🎉 ${data.message}`, 'success');
      } else {
        this.showToast(data.message, 'info');
      }
    });

    socket.on('player:readyChanged', (data: any) => {
      this.readyCount = data.readyCount;
      this.totalPlayers = data.totalPlayers;
    });

    socket.on('waiting:ready', (data: any) => {
      this.waitingForReady = true;
      this.readyCount = data.readyCount;
      this.totalPlayers = data.totalPlayers;
      this.isReady = false;
      this.currentTurnPlayerId = '';
    });

    socket.on('round:starting', (data: any) => {
      this.waitingForReady = false;
      this.gameOver = false;
      this.gameStarted = true;
      this.isSpectating = false;
      this.currentTurnPlayerId = '';
      this.roundNumber = data.round;
      this.eliminated = false;
      this.wrongAttempts = 0;
      this.currentInput = '';
      this.chain = [];
      this.lastChainLength = 0; // thêm dòng này
      this.blitzSampleAnswer = '';
      this.blitzRound = 0;
      this.blitzLeaderboard = data.players || [];
      this.showToast(`Vòng ${data.round} bắt đầu!`, 'success');
      setTimeout(() => this.scrollGridToTop(), 0); // thêm dòng này
    });

    socket.on('game:over', (data: any) => {
      this.gameOver = true;
      this.waitingForReady = false;
      this.showBlitzLeaderboard = false;
      this.winnerName = data.winner?.name || data.winner || '';
      this.blitzLeaderboard = data.leaderboard || [];
    });

    // ===== SCOREBOARD =====
    socket.on('scoreboard:update', (data: any) => {
      this.scoreboard = data;
    });

    // ===== CHAT =====
    socket.on('chat:message', (data: any) => {
      this.chatMessages.push(data);
      if (this.chatMessages.length > 100) this.chatMessages.shift();

      if (!this.chatOpen) {
        this.unreadChat++;
        this.showChatPreview(data);
      }

      setTimeout(() => this.scrollChatToBottom(), 0);
    });

    this.generateBossData();
    this.generateBlitzFakeData();
  }

  ngAfterViewChecked() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.mode === 'classic' && this.chain.length !== this.lastChainLength) {
      this.lastChainLength = this.chain.length;
      this.scrollGridToBottom();
    }
  }

  private scrollGridToBottom() {
    const container = this.gridContainerEl?.nativeElement;
    if (!container) return;
    const rows = container.querySelectorAll('tbody tr');
    const targetRow = rows[Math.max(0, this.chain.length - 1)] as HTMLElement | undefined;
    if (targetRow) targetRow.scrollIntoView({ block: 'end', inline: 'nearest' });
  }

  private scrollGridToTop() {
    const container = this.gridContainerEl?.nativeElement;
    if (container) container.scrollTop = 0;
  }

  // ===== ACTIONS =====
  joinOrCreateRoom() {
    if (!this.playerName.trim()) {
      this.showToast('Vui lòng nhập tên!', 'error');
      return;
    }

    if (this.roomCodeInput.trim()) {
      this.socketService.joinRoom(this.roomCodeInput.trim(), this.playerName.trim());
    } else {
      this.socketService.createRoom(this.playerName.trim(), this.mode, this.blitzRoundsInput, this.targetWinsInput);
    }
  }

  submitWord() {
    if (!this.currentInput.trim()) return;

    if (this.mode === 'classic' && this.isMyTurn) {
      this.socketService.submitClassic(this.currentInput);
    } else if (this.mode === 'blitz') {
      this.socketService.submitBlitz(this.currentInput);
    }
  }

  startGame() {
    if (this.playerCount >= 2) {
      this.socketService.startGame();
    }
  }

  quickJoinRoom(code: string) {
    if (!this.playerName.trim()) {
      this.showToast('Vui lòng nhập tên trước!', 'error');
      return;
    }
    this.socketService.joinRoom(code, this.playerName.trim());
  }

  roomStatusLabel(r: { status: string; playerCount: number }): string {
    if (r.playerCount >= 10) return 'Đầy';
    if (r.status === 'waiting') return 'Đang chờ';
    return 'Đang chơi - Xem';
  }

  onReadyClick() {
    this.socketService.socket?.emit('player:ready');
    this.isReady = true;
  }

  onNotReadyClick() {
    this.socketService.socket?.emit('player:notReady');
    this.isReady = false;
  }

  // ===== CHAT ACTIONS =====
  sendChatMessage() {
    if (!this.chatInput.trim()) return;
    this.socketService.sendChat(this.chatInput.trim());
    this.chatInput = '';
  }
  isMyMessage(playerId: string): boolean {
    return playerId === this.socketService.myId;
  }

  private scrollChatToBottom() {
    const el = this.chatMessagesEl?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private showChatPreview(data: { playerName: string; message: string }) {
    this.chatPreview = { playerName: data.playerName, message: data.message };
    clearTimeout(this.chatPreviewTimeout);
    this.chatPreviewTimeout = setTimeout(() => (this.chatPreview = null), 3000);
  }

  toggleChat() {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) {
      this.unreadChat = 0;
      this.chatPreview = null;
      setTimeout(() => {
        this.scrollChatToBottom();
        this.chatInputEl?.nativeElement.focus();
      }, 0);
    }
  }

  newGame() {
    this.gameOver = false;
    this.gameStarted = false;
    this.isSpectating = false;
    this.chatPreview = null;
    this.inRoom = false;
    this.roomCode = '';
    this.chain = [];
    this.eliminated = false;
    this.winnerName = '';
    this.blitzLeaderboard = [];
    this.currentInput = '';
    this.requiredSyllable = '';
    this.isMyTurn = false;
    this.currentTurnName = '';
    this.wrongAttempts = 0;
    this.blitzRound = 0;
    this.timeLeft = 20;
    this.waitingForReady = false;
    this.isReady = false;
    this.readyCount = 0;
    this.roundNumber = 1;
    this.roundMessage = '';
    this.roundLeaderboard = [];
    this.roundWinner = null;
    this.showBlitzLeaderboard = false;
    this.scoreboard = [];
    this.wrongFlash = null;
    this.chatMessages = [];
    this.chatInput = '';
    this.chatOpen = false;
    this.unreadChat = 0;
    this.currentTurnPlayerId = '';
    this.eliminationMessage = null;
    this.blitzAnswered = false;
    this.lastChainLength = 0;
    this.blitzSampleAnswer = '';
    this.nextRoundCountdown = 0;
    clearInterval(this.nextRoundInterval);
  }

  // ===== HELPERS =====
  get cellRef(): string {
    if (this.mode === 'classic' && this.isMyTurn) return 'B' + (this.chain.length + 1);
    if (this.mode === 'blitz') return 'B' + (this.blitzRound + 1);
    return 'A1';
  }

  get inputPlaceholder(): string {
    if (this.mode === 'classic' && this.isMyTurn) {
      return `Nối từ bắt đầu bằng: "${this.requiredSyllable}"...`;
    }
    if (this.mode === 'blitz') {
      return `Nối từ với: "${this.requiredSyllable}"...`;
    }
    return 'Nhập từ tiếng Việt tại đây...';
  }

  get gridRowCount(): number {
    if (this.mode === 'blitz') return Math.max(this.blitzFakeRows.length, 100);
    return Math.max(this.chain.length + 1, 100);
  }

  get bossRowIndexes(): number[] {
    return Array.from({ length: Math.max(this.bossData.length, 100) }, (_, i) => i);
  }

  get gridRowIndexes(): number[] {
    return Array.from({ length: this.gridRowCount }, (_, i) => i);
  }

  get canInput(): boolean {
    if (this.isSpectating) return false;
    if (this.waitingForReady) return false;
    if (this.showBlitzLeaderboard) return false;
    if (this.mode === 'classic') return this.isMyTurn && !this.eliminated && !this.gameOver;
    if (this.mode === 'blitz') return this.gameStarted && !this.gameOver && !this.blitzAnswered;
    return false;
  }

  get roomStatus(): string {
    if (this.waitingForReady) return `Chờ ready: ${this.readyCount}/${this.totalPlayers}`;
    if (this.showBlitzLeaderboard) return `⚡ BXH Lượt ${this.blitzRound}/${this.totalBlitzRounds}`;
    if (this.gameOver) return 'Game Over';
    if (this.gameStarted) {
      return this.mode === 'classic'
        ? `Vòng ${this.roundNumber} - Playing... (Mục tiêu: ${this.targetWins} thắng)`
        : `Vòng ${this.roundNumber} - Playing...`;
    }
    if (this.playerCount < 2) return `Đang chờ người chơi (${this.playerCount}/2)...`;
    return 'Sẵn sàng bắt đầu!';
  }

  get turnIndicatorText(): string {
    if (this.isSpectating) return '🔭 Đang xem — sắp được chơi';
    if (this.waitingForReady) return `⏳ Chờ ready: ${this.readyCount}/${this.totalPlayers}`;
    if (this.showBlitzLeaderboard) return `📊 BXH Lượt ${this.blitzRound}/${this.totalBlitzRounds}`;
    if (this.gameOver) return '';
    if (this.mode === 'blitz') return `⚡ Round ${this.blitzRound}/${this.totalBlitzRounds}`;
    return '';
  }

  getLastSyllable(phrase: string): string {
    if (!phrase) return '';
    const parts = phrase.trim().split(/\s+/);
    return parts[parts.length - 1] || '';
  }

  playAgain() {
    this.gameOver = false;
    this.waitingForReady = true;
    this.isReady = false;
    this.readyCount = 0;
    this.roundNumber = 0;
    this.chain = [];
    this.lastChainLength = 0;
  }

  private focusWordInput(prefill: string) {
    this.currentInput = prefill;
    setTimeout(() => {
      const el = this.wordInputEl?.nativeElement;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }

  private updateNextRoundCountdown(deadlineMs: number) {
    this.nextRoundCountdown = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    if (this.nextRoundCountdown <= 0) clearInterval(this.nextRoundInterval);
  }

  // ===== TIMER =====
  private startTimer(deadlineMs: number) {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      if (this.timeLeft <= 0) clearInterval(this.timerInterval);
    }, 100);
  }

  // ===== TOAST =====
  private showToast(message: string, type: 'info' | 'error' | 'success' = 'info') {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }

  // ===== BOSS KEY =====
  toggleBossMode() {
    this.bossMode = !this.bossMode;
  }

  private generateBlitzFakeData() {
    const items = ['Cập nhật số liệu', 'Kiểm tra công thức', 'Đối chiếu dữ liệu', 'Tổng hợp báo cáo', 'Rà soát sai lệch', 'Xuất file PDF', 'Gửi email xác nhận', 'Lưu trữ hồ sơ', 'Nhập liệu bổ sung', 'Duyệt số liệu'];
    const staff = ['Ánh', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hùng', 'Khánh', 'Linh', 'Minh', 'Ngọc'];
    const notes = ['Đã xong', 'Đang xử lý', 'Chờ duyệt', 'Cần kiểm tra lại', 'Hoàn tất'];
    this.blitzFakeRows = Array.from({ length: 100 }, (_, i) => ({
      stt: i + 1,
      content: items[i % items.length],
      staff: staff[i % staff.length],
      note: notes[i % notes.length],
    }));
  }

  private generateBossData() {
    const names = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Minh C', 'Phạm Thu D', 'Hoàng Văn E'];
    const items = ['Lương tháng 6', 'Thưởng Q2', 'Chi phí vận chuyển', 'Phí dịch vụ', 'Thuế GTGT'];
    this.bossData = names.map((name, i) => ({
      a: name,
      b: (Math.random() * 50000000 + 10000000).toFixed(0),
      c: items[i % items.length],
      d: (Math.random() * 5000000 + 500000).toFixed(0),
      e: ['Đã thanh toán', 'Chờ duyệt', 'Đã thanh toán', 'Chờ duyệt', 'Đã thanh toán'][i % 5],
    }));
  }

  // ===== CLEANUP =====
  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      clearInterval(this.timerInterval);
      clearTimeout(this.toastTimeout);
      clearTimeout(this.wrongFlashTimeout);
      clearTimeout(this.chatPreviewTimeout);
      clearTimeout(this.eliminationTimeout);
      clearInterval(this.nextRoundInterval);
    }
  }
}