export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  birthday?: string;
  avatar: string | null;
  country: string;
  countryCode: string;
  isOnline: boolean;
  stats: PlayerStats;
  preferences: UserPreferences;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface UserPreferences {
  boardTheme: BoardTheme;
  checkerColor: 'white' | 'black';
  soundEnabled: boolean;
  animationsEnabled: boolean;
}

export type BoardTheme = 'classic' | 'wooden' | 'metal';
export type BoardSize = 8 | 12;
export type AIDifficulty = 'easy' | 'moderate' | 'hard';
export type PieceColor = 'white' | 'black';

export interface Piece {
  id: string;
  color: PieceColor;
  isKing: boolean;
  row: number;
  col: number;
}

export interface Position {
  row: number;
  col: number;
}

export interface CaptureStep {
  to: Position;
  capture: Position;
}

export interface Move {
  from: Position;
  to: Position;
  captures: Position[];
  piece: Piece;
  sequence?: CaptureStep[];
}

export interface GameState {
  board: (Piece | null)[][];
  currentTurn: PieceColor;
  selectedPiece: Position | null;
  validMoves: Move[];
  moveHistory: MoveRecord[];
  capturedWhite: number;
  capturedBlack: number;
  gameOver: boolean;
  winner: PieceColor | 'draw' | null;
  gameType: 'ai' | 'multiplayer';
  aiDifficulty?: AIDifficulty;
  boardTheme: BoardTheme;
}

export interface MoveRecord {
  moveNumber: number;
  white?: string;
  black?: string;
}

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export interface MatchRecord {
  id: string;
  date: string;
  gameType: 'ai' | 'multiplayer';
  boardTheme: BoardTheme;
  playerColor: PieceColor;
  playerUsername: string;
  opponentName: string;
  aiDifficulty?: AIDifficulty;
  moves: string[];
  result: 'win' | 'loss' | 'draw';
  winner: PieceColor | 'draw' | null;
  duration: number; // seconds
  capturedByPlayer: number;
  capturedByOpponent: number;
}

