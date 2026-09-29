import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  socket: Socket | null = null;
  myId: string = '';
  roomCode: string = '';

  private platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const host = window.location.hostname;
      const port = 3010;
      const socketUrl = `http://${host}:${port}`;

      console.log('Connecting to:', socketUrl);

      this.socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.myId = this.socket?.id ?? '';
        console.log('Connected to server, id:', this.myId);
      });

      this.socket.on('connect_error', (err: any) => {
        console.error('Socket connect error:', err.message);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });
    }
  }

  createRoom(playerName: string, mode: 'classic' | 'blitz' = 'classic', blitzRounds?: number, targetWins?: number) {
    this.socket?.emit('createRoom', { playerName, mode, blitzRounds, targetWins });
  }

  joinRoom(code: string, playerName: string) {
    this.socket?.emit('joinRoom', { code, playerName });
  }

  startGame() {
    this.socket?.emit('startGame');
  }

  submitClassic(word: string) {
    this.socket?.emit('classic:submit', { word });
  }

  submitBlitz(word: string) {
    this.socket?.emit('blitz:submit', { word });
  }

  sendChat(message: string) {
    this.socket?.emit('chat:message', { message });
  }
}