import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import CheckerBoard from '@/components/CheckerBoard';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { apiFetch, getToken } from '@/lib/api';
import {
  createInitialBoard, getAllValidMoves, getMovesForPiece, getCaptureMovesForPiece,
  executeMove, checkGameOver, moveToNotation, getAIMove, getAIMoveFromMoves,
} from '@/lib/checkers';
import { saveMatch } from '@/lib/matchHistory';
import { Piece, Position, Move, PieceColor, BoardTheme, BoardSize, AIDifficulty, MoveRecord, MatchRecord, User } from '@/types/game';
import CountryFlag from '@/components/CountryFlag';
import { Crown, Flag, ArrowLeft, Handshake, RotateCcw } from 'lucide-react';
import { playMoveSound, playCaptureSound, playKingSound, playGameOverSound, setSoundEnabled } from '@/lib/sounds';
import { useToast } from '@/hooks/use-toast';

interface MultiplayerMatchState {
  id: string;
  status: 'active' | 'finished' | 'cancelled';
  winnerColor: PieceColor | null;
  winnerReason: 'timeout' | 'resign' | 'completed' | null;
  opponentDisconnectedAt: string | null;
  opponentDisconnectDeadlineAt: string | null;
}

interface SyncedGameState {
  board: (Piece | null)[][];
  currentTurn: PieceColor;
  moveHistory: string[];
  capturedWhite: number;
  capturedBlack: number;
  timer: {
    white: number;
    black: number;
  };
  gameOver: boolean;
  winner: PieceColor | 'draw' | null;
  forcedContinuationPiece: Position | null;
}

const INITIAL_COUNTDOWN_SECONDS = 600;

function createInitialTimer(isMultiplayer: boolean) {
  return isMultiplayer
    ? { white: 0, black: 0 }
    : { white: INITIAL_COUNTDOWN_SECONDS, black: INITIAL_COUNTDOWN_SECONDS };
}

const GamePage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as {
    gameType: 'ai' | 'multiplayer';
    aiDifficulty?: AIDifficulty;
    playerColor: PieceColor;
    boardTheme: BoardTheme;
    boardSize?: BoardSize;
    matchId?: string;
    opponent?: User;
  } | null;

  const gameType = state?.gameType ?? 'multiplayer';
  const aiDifficulty = state?.aiDifficulty ?? 'moderate';
  const playerColor = state?.playerColor ?? 'white';
  const boardTheme = state?.boardTheme ?? 'classic';
  const boardSize: BoardSize = state?.boardSize ?? 12;
  const matchId = state?.matchId ?? null;
  const opponent = state?.opponent ?? null;
  const isMultiplayer = gameType === 'multiplayer';
  const aiColor: PieceColor = playerColor === 'white' ? 'black' : 'white';

  const [board, setBoard] = useState(() => createInitialBoard(boardSize));
  const [currentTurn, setCurrentTurn] = useState<PieceColor>('white');
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [capturedWhite, setCapturedWhite] = useState(0);
  const [capturedBlack, setCapturedBlack] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<PieceColor | 'draw' | null>(null);
  const [timer, setTimer] = useState(() => createInitialTimer(isMultiplayer));
  const [forcedContinuationPiece, setForcedContinuationPiece] = useState<Position | null>(null);
  const [opponentDisconnectedAt, setOpponentDisconnectedAt] = useState<string | null>(null);
  const [opponentDisconnectDeadlineAt, setOpponentDisconnectDeadlineAt] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [matchSaved, setMatchSaved] = useState(false);
  const gameStartTime = useRef(Date.now());
  const timeoutWinnerAppliedRef = useRef(false);
  const disconnectSentRef = useRef(false);
  const lastOpponentDisconnectedAtRef = useRef<string | null>(null);
  const syncRevisionRef = useRef(0);
  const hasLoadedRemoteStateRef = useRef(false);
  const skipNextSyncPushRef = useRef(false);
  const timerRef = useRef(timer);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  const applySyncedGameState = useCallback((nextState: SyncedGameState) => {
    skipNextSyncPushRef.current = true;
    setBoard(nextState.board);
    setCurrentTurn(nextState.currentTurn);
    setMoveHistory(nextState.moveHistory);
    setCapturedWhite(nextState.capturedWhite);
    setCapturedBlack(nextState.capturedBlack);
    setTimer(nextState.timer ?? createInitialTimer(true));
    setGameOver(nextState.gameOver);
    setWinner(nextState.winner);
    setForcedContinuationPiece(nextState.forcedContinuationPiece);
    setSelectedPiece(null);
    setValidMoves([]);
  }, []);

  // Sync sound preference
  useEffect(() => {
    setSoundEnabled(user?.preferences?.soundEnabled ?? true);
  }, [user?.preferences?.soundEnabled]);

  useEffect(() => {
    if (!state || !user) {
      setRedirecting(true);
      navigate('/dashboard');
      return;
    }

    if (isMultiplayer && !matchId) {
      setRedirecting(true);
      toast({
        title: 'Match is unavailable',
        description: 'Open or resume multiplayer matches from the dashboard.',
        duration: 3500,
      });
      navigate('/dashboard');
    }
  }, [isMultiplayer, matchId, navigate, state, toast, user]);

  const applyServerMatchState = useCallback((serverMatch: MultiplayerMatchState) => {
    setOpponentDisconnectedAt(serverMatch.opponentDisconnectedAt);
    setOpponentDisconnectDeadlineAt(serverMatch.opponentDisconnectDeadlineAt);

    if (serverMatch.status === 'finished' && serverMatch.winnerColor && !timeoutWinnerAppliedRef.current) {
      timeoutWinnerAppliedRef.current = true;
      setGameOver(true);
      setWinner(serverMatch.winnerColor);

      if (serverMatch.winnerReason === 'timeout') {
        toast({
          title: serverMatch.winnerColor === playerColor ? 'You win by timeout' : 'You lost by timeout',
          description: serverMatch.winnerColor === playerColor
            ? 'Opponent did not return within 10 minutes.'
            : 'You did not return within 10 minutes.',
          duration: 4500,
        });
      }
      return;
    }

    const opponentDisconnectedAt = serverMatch.opponentDisconnectedAt;
    if (opponentDisconnectedAt && opponentDisconnectedAt !== lastOpponentDisconnectedAtRef.current) {
      lastOpponentDisconnectedAtRef.current = opponentDisconnectedAt;
      toast({
        title: 'Opponent disconnected',
        description: 'If they do not rejoin within 10 minutes, you win automatically.',
        duration: 4000,
      });
      return;
    }

    if (!opponentDisconnectedAt) {
      lastOpponentDisconnectedAtRef.current = null;
    }
  }, [playerColor, toast]);

  useEffect(() => {
    if (!user || !isMultiplayer || !matchId) {
      return;
    }

    disconnectSentRef.current = false;
    timeoutWinnerAppliedRef.current = false;

    let active = true;
    const syncMatchState = async () => {
      try {
        const { match } = await apiFetch<{ match: MultiplayerMatchState }>(`/matches/${matchId}`);
        if (!active) return;
        applyServerMatchState(match);

        const stateData = await apiFetch<{
          stateRevision: number;
          gameState: SyncedGameState | null;
        }>(`/matches/${matchId}/state`);
        if (!active) return;

        if (stateData.stateRevision > syncRevisionRef.current) {
          syncRevisionRef.current = stateData.stateRevision;
          if (stateData.gameState) {
            applySyncedGameState(stateData.gameState);
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    };

    apiFetch<{ match: MultiplayerMatchState }>(`/matches/${matchId}/rejoin`, { method: 'POST' })
      .then(({ match }) => {
        if (!active) return;
        applyServerMatchState(match);

        void apiFetch<{
          stateRevision: number;
          gameState: SyncedGameState | null;
        }>(`/matches/${matchId}/state`)
          .then(stateData => {
            if (!active) return;
            syncRevisionRef.current = stateData.stateRevision;
            hasLoadedRemoteStateRef.current = true;
            if (stateData.gameState) {
              applySyncedGameState(stateData.gameState);
            }
          })
          .catch(() => {
            hasLoadedRemoteStateRef.current = true;
          });
      })
      .catch(() => {
        if (!active) return;
        toast({
          title: 'Could not join match',
          description: 'This match may no longer be active.',
          duration: 3500,
        });
        setRedirecting(true);
        navigate('/dashboard');
      });

    const interval = setInterval(() => {
      void syncMatchState();
    }, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [applyServerMatchState, isMultiplayer, matchId, navigate, toast, user]);

  useEffect(() => {
    if (!user || !isMultiplayer || !matchId) {
      return;
    }

    const token = getToken();
    if (!token) {
      return;
    }

    const socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit('join_match', matchId);
    };

    socket.on('connect', joinRoom);
    if (socket.connected) {
      joinRoom();
    }

    socket.on('match_state', (payload: { stateRevision?: number; gameState?: SyncedGameState | null }) => {
      if (typeof payload.stateRevision !== 'number') {
        return;
      }

      if (payload.stateRevision <= syncRevisionRef.current) {
        return;
      }

      syncRevisionRef.current = payload.stateRevision;
      if (payload.gameState) {
        applySyncedGameState(payload.gameState);
      }
    });

    socket.on('match_meta', () => {
      void apiFetch<{ match: MultiplayerMatchState }>(`/matches/${matchId}`)
        .then(({ match }) => {
          applyServerMatchState(match);
        })
        .catch(() => {
          // Ignore transient realtime metadata fetch errors.
        });
    });

    return () => {
      socket.emit('leave_match', matchId);
      socket.off('connect', joinRoom);
      socket.removeAllListeners('match_state');
      socket.removeAllListeners('match_meta');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyServerMatchState, applySyncedGameState, isMultiplayer, matchId, user]);

  useEffect(() => {
    if (!user || !isMultiplayer || !matchId || !hasLoadedRemoteStateRef.current) {
      return;
    }

    if (skipNextSyncPushRef.current) {
      skipNextSyncPushRef.current = false;
      return;
    }

    const statePayload: SyncedGameState = {
      board,
      currentTurn,
      moveHistory,
      capturedWhite,
      capturedBlack,
      timer: timerRef.current,
      gameOver,
      winner,
      forcedContinuationPiece,
    };

    void apiFetch<{ stateRevision: number }>(`/matches/${matchId}/state`, {
      method: 'PUT',
      body: JSON.stringify({
        state: statePayload,
        expectedRevision: syncRevisionRef.current,
      }),
    })
      .then(data => {
        syncRevisionRef.current = data.stateRevision;
      })
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.message.includes('State out of sync')) {
          try {
            const latest = await apiFetch<{
              stateRevision: number;
              gameState: SyncedGameState | null;
            }>(`/matches/${matchId}/state`);
            syncRevisionRef.current = latest.stateRevision;
            if (latest.gameState) {
              applySyncedGameState(latest.gameState);
            }
          } catch {
            // Ignore transient reconciliation failures; polling will eventually recover.
          }
          return;
        }

        // Ignore transient sync write failures; polling cycle will reconcile.
      });
  }, [
    applySyncedGameState,
    board,
    capturedBlack,
    capturedWhite,
    currentTurn,
    forcedContinuationPiece,
    gameOver,
    isMultiplayer,
    matchId,
    moveHistory,
    user,
    winner,
  ]);

  useEffect(() => {
    if (!user || !isMultiplayer || !matchId) {
      return;
    }

    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
    const sendDisconnectKeepalive = () => {
      if (gameOver || disconnectSentRef.current) {
        return;
      }

      const token = getToken();
      if (!token) {
        return;
      }

      disconnectSentRef.current = true;
      void fetch(`${baseUrl}/matches/${matchId}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      });
    };

    window.addEventListener('beforeunload', sendDisconnectKeepalive);

    return () => {
      window.removeEventListener('beforeunload', sendDisconnectKeepalive);
      if (!gameOver && !disconnectSentRef.current) {
        disconnectSentRef.current = true;
        void apiFetch(`/matches/${matchId}/disconnect`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [gameOver, isMultiplayer, matchId, user]);

  // Timer
  useEffect(() => {
    if (gameOver) return;

    const interval = setInterval(() => {
      setTimer(prev => {
        if (isMultiplayer) {
          return { ...prev, [currentTurn]: prev[currentTurn] + 1 };
        }

        const updated = { ...prev, [currentTurn]: prev[currentTurn] - 1 };
        if (updated[currentTurn] <= 0) {
          setGameOver(true);
          setWinner(currentTurn === 'white' ? 'black' : 'white');
        }

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentTurn, gameOver, isMultiplayer]);

  // Save match when game ends
  useEffect(() => {
    if (gameOver && !matchSaved && user) {
      setMatchSaved(true);
      const duration = Math.round((Date.now() - gameStartTime.current) / 1000);
      const playerCaptured = playerColor === 'white' ? capturedBlack : capturedWhite;
      const opponentCaptured = playerColor === 'white' ? capturedWhite : capturedBlack;
      const result: 'win' | 'loss' | 'draw' = winner === 'draw' ? 'draw' : winner === playerColor ? 'win' : 'loss';
      const opponentName = gameType === 'ai'
        ? `AI (${aiDifficulty})`
        : opponent?.username ?? 'Opponent';
      const match: MatchRecord = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        gameType,
        boardTheme,
        playerColor,
        playerUsername: user.username,
        opponentName,
        aiDifficulty: gameType === 'ai' ? aiDifficulty : undefined,
        moves: moveHistory,
        result,
        winner,
        duration,
        capturedByPlayer: playerCaptured,
        capturedByOpponent: opponentCaptured,
      };
      saveMatch(user.id, match);

      // Persist updated stats to PostgreSQL
      const newStats = {
        gamesPlayed: user.stats.gamesPlayed + 1,
        wins:   user.stats.wins   + (result === 'win'  ? 1 : 0),
        losses: user.stats.losses + (result === 'loss' ? 1 : 0),
        draws:  user.stats.draws  + (result === 'draw' ? 1 : 0),
      };
      const winRate = newStats.gamesPlayed > 0
        ? Math.round((newStats.wins / newStats.gamesPlayed) * 100)
        : 0;
      updateProfile({ stats: { ...newStats, winRate } }).catch(console.error);
    }
  }, [gameOver, matchSaved, user, winner, opponent]);

  const applyMove = useCallback((move: Move) => {
    const newBoard = executeMove(board, move);
    setBoard(newBoard);

    // Check if piece got promoted to king
    const landedPiece = newBoard[move.to.row]?.[move.to.col];
    const wasPromoted = landedPiece?.isKing && !move.piece.isKing;

    if (move.captures.length > 0) {
      if (move.piece.color === 'white') {
        setCapturedBlack(prev => prev + move.captures.length);
      } else {
        setCapturedWhite(prev => prev + move.captures.length);
      }
    }

    // Play sound effects
    if (wasPromoted) {
      playKingSound();
    } else if (move.captures.length > 0) {
      playCaptureSound();
    } else {
      playMoveSound();
    }

    setMoveHistory(prev => [...prev, moveToNotation(move, boardSize)]);

    if (move.captures.length > 0 && landedPiece) {
      const followUpMoves = getCaptureMovesForPiece(newBoard, landedPiece);

      if (followUpMoves.length > 0) {
        const nextPosition = { row: landedPiece.row, col: landedPiece.col };
        setForcedContinuationPiece(nextPosition);
        setSelectedPiece(nextPosition);
        setValidMoves(followUpMoves);
        return;
      }
    }

    setForcedContinuationPiece(null);
    setSelectedPiece(null);
    setValidMoves([]);

    const nextTurn = currentTurn === 'white' ? 'black' : 'white';
    const result = checkGameOver(newBoard, nextTurn);
    if (result) {
      setGameOver(true);
      setWinner(result);
      setTimeout(() => {
        playGameOverSound(result === playerColor);
      }, 300);
    } else {
      setCurrentTurn(nextTurn);
    }
  }, [board, boardSize, currentTurn, playerColor]);

  const allCurrentTurnMoves = useMemo((): Move[] => {
    if (gameOver) return [];
    if (forcedContinuationPiece) {
      const continuedPiece = board[forcedContinuationPiece.row]?.[forcedContinuationPiece.col];
      if (!continuedPiece || continuedPiece.color !== currentTurn) {
        return [];
      }

      return getCaptureMovesForPiece(board, continuedPiece);
    }
    return getAllValidMoves(board, currentTurn);
  }, [board, currentTurn, forcedContinuationPiece, gameOver]);

  // AI move
  useEffect(() => {
    if (gameType === 'ai' && currentTurn === aiColor && !gameOver) {
      const timeout = setTimeout(() => {
        const move = forcedContinuationPiece
          ? getAIMoveFromMoves(board, aiColor, aiDifficulty, allCurrentTurnMoves)
          : getAIMove(board, aiColor, aiDifficulty);

        if (move) {
          const firstStep = move.sequence?.[0];
          if (firstStep && move.captures.length > 0) {
            applyMove({
              from: move.from,
              to: firstStep.to,
              captures: [firstStep.capture],
              piece: move.piece,
              sequence: [firstStep],
            });
            return;
          }

          applyMove(move);
        }
      }, 500 + Math.random() * 500);
      return () => clearTimeout(timeout);
    }
  }, [aiColor, aiDifficulty, allCurrentTurnMoves, applyMove, board, currentTurn, forcedContinuationPiece, gameOver, gameType]);

  // Compute which pieces can move (for visual hints)
  const movablePieces = useMemo((): Position[] => {
    const positions = new Map<string, Position>();
    for (const move of allCurrentTurnMoves) {
      const key = `${move.from.row},${move.from.col}`;
      if (!positions.has(key)) {
        positions.set(key, { row: move.from.row, col: move.from.col });
      }
    }
    return Array.from(positions.values());
  }, [allCurrentTurnMoves]);

  const captureMoves = useMemo(() => {
    return allCurrentTurnMoves.filter(move => move.captures.length > 0);
  }, [allCurrentTurnMoves]);

  const hasMandatoryCapture = captureMoves.length > 0;

  const forcedCapturePieces = useMemo((): Position[] => {
    const positions = new Map<string, Position>();

    for (const move of captureMoves) {
      const key = `${move.from.row},${move.from.col}`;
      if (!positions.has(key)) {
        positions.set(key, { row: move.from.row, col: move.from.col });
      }
    }

    return Array.from(positions.values());
  }, [captureMoves]);

  // Green target dots: show all valid moves for the selected piece
  const boardHintMoves = useMemo(() => {
    if (!selectedPiece) return [];

    if (validMoves.some(move => move.captures.length > 0)) {
      const firstStepTargets = new Map<string, Move>();

      for (const move of validMoves) {
        const firstStep = move.sequence?.[0];
        if (!firstStep) continue;

        const key = `${firstStep.to.row},${firstStep.to.col}`;
        if (!firstStepTargets.has(key)) {
          firstStepTargets.set(key, {
            from: move.from,
            to: firstStep.to,
            captures: [firstStep.capture],
            piece: move.piece,
            sequence: [firstStep],
          });
        }
      }

      return Array.from(firstStepTargets.values());
    }

    return validMoves;
  }, [selectedPiece, validMoves]);

  // Before selection, only the pieces that must capture are highlighted
  const visibleMovablePieces = useMemo(() => {
    if (selectedPiece || !hasMandatoryCapture) return [];
    return forcedCapturePieces;
  }, [selectedPiece, hasMandatoryCapture, forcedCapturePieces]);

  const trySelectPiece = useCallback((piece: Piece) => {
    const moves = getMovesForPiece(board, piece);
    if (moves.length === 0) return false;

    setSelectedPiece({ row: piece.row, col: piece.col });
    setValidMoves(moves);
    return true;
  }, [board]);

  const revealMandatoryCapture = useCallback(() => {
    if (forcedCapturePieces.length === 0) return;

    if (forcedCapturePieces.length === 1) {
      const forcedPos = forcedCapturePieces[0];
      const forcedPiece = board[forcedPos.row]?.[forcedPos.col];
      if (!forcedPiece) return;

      trySelectPiece(forcedPiece);
      toast({
        title: 'Capture required',
        description: 'Pick a green landing square to complete the capture sequence.',
        duration: 2400,
      });
      return;
    }

    setSelectedPiece(null);
    setValidMoves([]);
    toast({
      title: 'Capture required',
      description: 'Select one of the highlighted pieces first.',
      duration: 2400,
    });
  }, [forcedCapturePieces, board, trySelectPiece, toast]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameOver) return;
    if (gameType === 'ai' && currentTurn === aiColor) return;
    if (isMultiplayer && currentTurn !== playerColor) return;

    const piece = board[row][col];

    if (selectedPiece) {
      const hasCaptureSequence = validMoves.some(move => move.captures.length > 0);
      const move = hasCaptureSequence
        ? (() => {
            const candidate = validMoves.find(candidateMove => {
              const firstStep = candidateMove.sequence?.[0];
              return firstStep?.to.row === row && firstStep.to.col === col;
            });

            const firstStep = candidate?.sequence?.[0];
            if (!candidate || !firstStep) {
              return undefined;
            }

            return {
              from: candidate.from,
              to: firstStep.to,
              captures: [firstStep.capture],
              piece: candidate.piece,
              sequence: [firstStep],
            } satisfies Move;
          })()
        : validMoves.find(m => m.to.row === row && m.to.col === col);

      if (move) {
        applyMove(move);
        return;
      }

      if (piece && piece.color === currentTurn) {
        if (!trySelectPiece(piece)) {
          if (hasMandatoryCapture) {
            revealMandatoryCapture();
          } else {
            setSelectedPiece(null);
            setValidMoves([]);
          }
        }
        return;
      }

      if (hasMandatoryCapture) {
        revealMandatoryCapture();
        return;
      }

      setSelectedPiece(null);
      setValidMoves([]);
      return;
    }

    if (piece && piece.color === currentTurn) {
      if (!trySelectPiece(piece) && hasMandatoryCapture) {
        revealMandatoryCapture();
      }
      return;
    }

    if (hasMandatoryCapture) {
      revealMandatoryCapture();
    }
  }, [board, selectedPiece, validMoves, currentTurn, gameOver, gameType, aiColor, applyMove, hasMandatoryCapture, revealMandatoryCapture, trySelectPiece, isMultiplayer, playerColor]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const resign = () => {
    setGameOver(true);
    setWinner(playerColor === 'white' ? 'black' : 'white');
  };

  const resetGame = () => {
    setBoard(createInitialBoard(boardSize));
    setCurrentTurn('white');
    setSelectedPiece(null);
    setValidMoves([]);
    setForcedContinuationPiece(null);
    setMoveHistory([]);
    setCapturedWhite(0);
    setCapturedBlack(0);
    setGameOver(false);
    setWinner(null);
    setTimer(createInitialTimer(isMultiplayer));
  };

  if (redirecting || !user || !state) return null;

  const userCountryCode = user.countryCode;
  const isFlipped = playerColor === 'black';
  const disconnectElapsedSeconds = opponentDisconnectedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(opponentDisconnectedAt).getTime()) / 1000))
    : null;
  const disconnectRemainingSeconds = opponentDisconnectedAt
    ? Math.max(
      0,
      opponentDisconnectDeadlineAt
        ? Math.floor((new Date(opponentDisconnectDeadlineAt).getTime() - Date.now()) / 1000)
        : 600 - (disconnectElapsedSeconds ?? 0),
    )
    : null;

  const PlayerCard: React.FC<{
    name: string; flag: React.ReactNode; avatar: string | null; color: PieceColor;
    timeValue: number; captured: number; isCurrentTurn: boolean;
    showDisconnectStatus?: boolean;
    disconnectElapsedSeconds?: number | null;
    disconnectRemainingSeconds?: number | null;
  }> = ({
    name,
    flag,
    avatar,
    color,
    timeValue,
    captured,
    isCurrentTurn,
    showDisconnectStatus = false,
    disconnectElapsedSeconds = null,
    disconnectRemainingSeconds = null,
  }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shrink-0 ${
      isCurrentTurn ? 'bg-accent border border-primary/30' : 'bg-card'
    }`}>
      <PlayerAvatar username={name} src={avatar} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          <span>{flag}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2.5 h-2.5 rounded-full ${color === 'white' ? 'bg-neutral-200' : 'bg-neutral-800 border border-border'}`} />
          <span>Captured: {captured}</span>
        </div>
        {showDisconnectStatus && disconnectElapsedSeconds !== null && disconnectRemainingSeconds !== null && (
          <div className="text-[11px] text-amber-700 leading-tight mt-1">
            Disconnected: {formatTime(disconnectElapsedSeconds)} elapsed, {formatTime(disconnectRemainingSeconds)} left
          </div>
        )}
      </div>
      <div className={`font-mono text-base tabular-nums font-bold ${
        !isMultiplayer && timeValue <= 30 ? 'text-destructive' : 'text-foreground'
      }`}>
        {formatTime(timeValue)}
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-card px-2 sm:px-3 py-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Crown className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-foreground truncate">
            {gameType === 'ai' ? `vs AI (${aiDifficulty})` : 'vs Player'}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="capitalize">{boardTheme}</span>
            <span>·</span>
            <span>{currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}</span>
          </div>
        </div>
        <div className="sm:hidden mt-1 text-[11px] text-muted-foreground">
          <span className="capitalize">{boardTheme}</span>
          <span className="mx-1">·</span>
          <span>{currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* LEFT: Board section */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto lg:overflow-hidden">
          {/* Opponent card - visible on mobile above board */}
          <div className="p-2 shrink-0 lg:hidden">
            <PlayerCard
              name={gameType === 'ai' ? `AI (${aiDifficulty})` : (opponent?.username ?? 'Player 2')}
              flag={gameType === 'ai' ? '🤖' : opponent
                ? <CountryFlag code={opponent.countryCode} className="h-4 w-6" title={opponent.country} />
                : '🌍'}
              avatar={gameType === 'ai' ? null : (opponent?.avatar ?? null)}
              color={aiColor}
              timeValue={timer[aiColor]}
              captured={aiColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === aiColor}
              showDisconnectStatus={isMultiplayer && !!opponentDisconnectedAt}
              disconnectElapsedSeconds={disconnectElapsedSeconds}
              disconnectRemainingSeconds={disconnectRemainingSeconds}
            />
          </div>

          {/* Board */}
          <div className="shrink-0 lg:flex-1 lg:min-h-0 flex items-center justify-center p-2 lg:p-4">
            <CheckerBoard
              board={board}
              theme={boardTheme}
              boardSize={boardSize}
              selectedPiece={selectedPiece}
              validMoves={boardHintMoves}
              movablePieces={visibleMovablePieces}
              onSquareClick={handleSquareClick}
              flipped={isFlipped}
            />
          </div>

          {/* Player card - visible on mobile below board */}
          <div className="p-2 shrink-0 lg:hidden">
            <PlayerCard
              name={user.username}
              flag={<CountryFlag code={userCountryCode} className="h-4 w-6" title={user.country} />}
              avatar={user.avatar}
              color={playerColor}
              timeValue={timer[playerColor]}
              captured={playerColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === playerColor}
            />
          </div>

          {/* Panels below board on mobile */}
          <div className="lg:hidden shrink-0 space-y-0 border-t border-border">
            {/* Game Over */}
            {gameOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="m-2 p-3 text-center border border-primary/30 rounded-lg bg-primary/5"
              >
                <Crown className="w-6 h-6 text-primary mx-auto mb-1" />
                <h3 className="font-bold text-foreground">
                  {winner === 'draw' ? 'Draw!' : winner === playerColor ? 'You Win!' : 'You Lose!'}
                </h3>
                <Button onClick={resetGame} className="mt-2 w-full" size="sm">
                  <RotateCcw className="w-3 h-3 mr-1" /> Play Again
                </Button>
              </motion.div>
            )}

            <div className="p-3 border-b border-border">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Game Info</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <span className="text-muted-foreground block">Mode</span>
                  <span className="text-foreground font-medium">{gameType === 'ai' ? `AI (${aiDifficulty})` : 'Player'}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted-foreground block">Theme</span>
                  <span className="text-foreground font-medium capitalize">{boardTheme}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted-foreground block">Turn</span>
                  <span className={`font-medium ${currentTurn === playerColor ? 'text-primary' : 'text-foreground'}`}>
                    {currentTurn === playerColor ? 'Yours' : 'Opponent'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 border-b border-border">
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={resign} disabled={gameOver}>
                  <Flag className="w-3 h-3 mr-1" /> Resign
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" disabled={gameOver}>
                  <Handshake className="w-3 h-3 mr-1" /> Draw
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => navigate('/dashboard')}>
                  <ArrowLeft className="w-3 h-3 mr-1" /> Back
                </Button>
              </div>
            </div>

            <div className="p-3">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Move History</h4>
              <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-xs">
                {moveHistory.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No moves yet</p>
                ) : (
                  moveHistory.map((move, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                      <span className="text-foreground">{move}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT sidebar - only visible on lg+ */}
        <div className="hidden lg:flex lg:w-72 xl:w-80 shrink-0 border-l border-border bg-card/50 flex-col min-h-0 overflow-y-auto">
          {/* Opponent Player Card */}
          <div className="p-2 border-b border-border">
            <PlayerCard
              name={gameType === 'ai' ? `AI (${aiDifficulty})` : (opponent?.username ?? 'Player 2')}
              flag={gameType === 'ai' ? '🤖' : opponent
                ? <CountryFlag code={opponent.countryCode} className="h-4 w-6" title={opponent.country} />
                : '🌍'}
              avatar={gameType === 'ai' ? null : (opponent?.avatar ?? null)}
              color={aiColor}
              timeValue={timer[aiColor]}
              captured={aiColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === aiColor}
              showDisconnectStatus={isMultiplayer && !!opponentDisconnectedAt}
              disconnectElapsedSeconds={disconnectElapsedSeconds}
              disconnectRemainingSeconds={disconnectRemainingSeconds}
            />
          </div>

          {/* Your Player Card */}
          <div className="p-2 border-b border-border">
            <PlayerCard
              name={user.username}
              flag={<CountryFlag code={userCountryCode} className="h-4 w-6" title={user.country} />}
              avatar={user.avatar}
              color={playerColor}
              timeValue={timer[playerColor]}
              captured={playerColor === 'white' ? capturedBlack : capturedWhite}
              isCurrentTurn={currentTurn === playerColor}
            />
          </div>

          {/* Game Over */}
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="m-2 p-3 text-center border border-primary/30 rounded-lg bg-primary/5"
            >
              <Crown className="w-6 h-6 text-primary mx-auto mb-1" />
              <h3 className="font-bold text-foreground">
                {winner === 'draw' ? 'Draw!' : winner === playerColor ? 'You Win!' : 'You Lose!'}
              </h3>
              <Button onClick={resetGame} className="mt-2 w-full" size="sm">
                <RotateCcw className="w-3 h-3 mr-1" /> Play Again
              </Button>
            </motion.div>
          )}

          {/* Game Info */}
          <div className="p-3 border-b border-border">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Game Info</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="text-foreground font-medium">{gameType === 'ai' ? `vs AI (${aiDifficulty})` : 'vs Player'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theme</span>
                <span className="text-foreground font-medium capitalize">{boardTheme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Turn</span>
                <span className={`font-medium ${currentTurn === playerColor ? 'text-primary' : 'text-foreground'}`}>
                  {currentTurn === playerColor ? 'Your Turn' : "Opponent's Turn"}
                </span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="p-3 border-b border-border space-y-1.5">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Controls</h4>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={resign} disabled={gameOver}>
                <Flag className="w-3 h-3 mr-1" /> Resign
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-8" disabled={gameOver}>
                <Handshake className="w-3 h-3 mr-1" /> Draw
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to Dashboard
            </Button>
          </div>

          {/* Move History */}
          <div className="p-3 flex-1 min-h-0">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Move History</h4>
            <div className="space-y-0.5 overflow-y-auto max-h-none font-mono text-xs">
              {moveHistory.length === 0 ? (
                <p className="text-muted-foreground text-xs">No moves yet</p>
              ) : (
                moveHistory.map((move, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                    <span className="text-foreground">{move}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamePage;
