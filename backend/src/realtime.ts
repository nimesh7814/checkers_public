import type { Server as SocketIOServer } from 'socket.io';

let ioRef: SocketIOServer | null = null;

export function setRealtimeServer(io: SocketIOServer): void {
  ioRef = io;
}

export function emitMatchState(matchId: string, payload: Record<string, unknown>): void {
  ioRef?.to(`match:${matchId}`).emit('match_state', payload);
}

export function emitMatchMeta(matchId: string, payload: Record<string, unknown>): void {
  ioRef?.to(`match:${matchId}`).emit('match_meta', payload);
}
