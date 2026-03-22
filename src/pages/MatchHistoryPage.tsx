import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getMatchHistory } from '@/lib/matchHistory';
import { createInitialBoard, executeMove, getAllValidMoves } from '@/lib/checkers';
import CheckerBoard from '@/components/CheckerBoard';
import { Button } from '@/components/ui/button';
import { MatchRecord, Piece, Move, BoardTheme } from '@/types/game';
import {
  ArrowLeft, Crown, Cpu, Trophy, XCircle, Minus,
  ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause,
} from 'lucide-react';

const MatchHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedMatch, setSelectedMatch] = useState<MatchRecord | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);

  const matches = useMemo(() => user ? getMatchHistory(user.id) : [], [user?.id]);

  // Auto-play timer
  React.useEffect(() => {
    if (!autoPlaying || !selectedMatch) return;
    if (replayStep >= selectedMatch.moves.length) {
      setAutoPlaying(false);
      return;
    }
    const timer = setTimeout(() => setReplayStep(s => s + 1), 1000);
    return () => clearTimeout(timer);
  }, [autoPlaying, replayStep, selectedMatch]);

  if (!user) { navigate('/'); return null; }

  // Replay board reconstruction — we rebuild move-by-move from notation
  // Since we stored notation strings, we replay by re-parsing.
  // For a robust replay, we store the actual Move objects. But for now,
  // we show the board at each step by replaying recorded moves.
  // We'll use a simplified approach: store full board snapshots isn't practical,
  // so we'll show the move list and let users step through.

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const resultIcon = (result: string) => {
    switch (result) {
      case 'win': return <Trophy className="w-4 h-4 text-primary" />;
      case 'loss': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'draw': return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const resultLabel = (result: string) => {
    switch (result) {
      case 'win': return 'Victory';
      case 'loss': return 'Defeat';
      case 'draw': return 'Draw';
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Crown className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-foreground">Match History</h1>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">{matches.length} games</span>
      </header>

      <div className="max-w-5xl mx-auto p-4">
        {selectedMatch ? (
          <ReplayView
            match={selectedMatch}
            step={replayStep}
            setStep={setReplayStep}
            autoPlaying={autoPlaying}
            setAutoPlaying={setAutoPlaying}
            onBack={() => { setSelectedMatch(null); setReplayStep(0); setAutoPlaying(false); }}
            formatDuration={formatDuration}
          />
        ) : (
          <>
            {matches.length === 0 ? (
              <div className="text-center py-16">
                <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h2 className="text-lg font-medium text-foreground mb-2">No matches yet</h2>
                <p className="text-sm text-muted-foreground mb-4">Complete a game to see it here</p>
                <Button onClick={() => navigate('/dashboard')}>Play Now</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {matches.map((match, idx) => (
                  <motion.button
                    key={match.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => { setSelectedMatch(match); setReplayStep(0); }}
                    className="w-full surface-card p-4 flex items-center gap-4 hover:bg-accent/50 transition-colors text-left"
                  >
                    {/* Result icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      match.result === 'win' ? 'bg-primary/15' :
                      match.result === 'loss' ? 'bg-destructive/15' : 'bg-muted'
                    }`}>
                      {resultIcon(match.result)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${
                          match.result === 'win' ? 'text-primary' :
                          match.result === 'loss' ? 'text-destructive' : 'text-foreground'
                        }`}>
                          {resultLabel(match.result)}
                        </span>
                        <span className="text-xs text-muted-foreground">vs {match.opponentName}</span>
                        {match.gameType === 'ai' && (
                          <span className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                            {match.aiDifficulty}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                        <span>{formatDate(match.date)}</span>
                        <span className="tabular-nums">{match.moves.length} moves</span>
                        <span className="tabular-nums">{formatDuration(match.duration)}</span>
                        <span className="capitalize">{match.boardTheme}</span>
                      </div>
                    </div>

                    {/* Captures */}
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-muted-foreground">
                        Captured {match.capturedByPlayer} · Lost {match.capturedByOpponent}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </motion.button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Replay sub-component
const ReplayView: React.FC<{
  match: MatchRecord;
  step: number;
  setStep: (s: number | ((p: number) => number)) => void;
  autoPlaying: boolean;
  setAutoPlaying: (v: boolean) => void;
  onBack: () => void;
  formatDuration: (s: number) => string;
}> = ({ match, step, setStep, autoPlaying, setAutoPlaying, onBack, formatDuration }) => {
  const totalMoves = match.moves.length;

  const resultLabel = match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw';
  const resultColor = match.result === 'win' ? 'text-primary' : match.result === 'loss' ? 'text-destructive' : 'text-foreground';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <span className={resultColor}>{resultLabel}</span>
            <span className="text-muted-foreground font-normal">vs {match.opponentName}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {totalMoves} moves · {formatDuration(match.duration)} · {match.boardTheme}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Board placeholder — shows initial state only in replay */}
        <div className="flex-1">
          <div className="surface-card p-4 rounded-lg">
            <div className="w-full max-w-[min(90vh,500px)] aspect-square mx-auto bg-secondary rounded-md flex items-center justify-center">
              <div className="text-center">
                <Crown className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">Board replay</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Step {step} / {totalMoves}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Move list & controls */}
        <div className="lg:w-72 space-y-3">
          {/* Playback controls */}
          <div className="surface-card p-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Playback</h4>
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost" size="icon"
                onClick={() => { setStep(0); setAutoPlaying(false); }}
                disabled={step === 0}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline" size="icon"
                onClick={() => setAutoPlaying(!autoPlaying)}
              >
                {autoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => setStep(s => Math.min(totalMoves, s + 1))}
                disabled={step >= totalMoves}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => { setStep(totalMoves); setAutoPlaying(false); }}
                disabled={step >= totalMoves}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
            <div className="mt-2 w-full bg-secondary rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${totalMoves > 0 ? (step / totalMoves) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-1 tabular-nums">
              Move {step} of {totalMoves}
            </p>
          </div>

          {/* Move list */}
          <div className="surface-card p-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Move History</h4>
            <div className="space-y-0.5 max-h-72 overflow-y-auto font-mono text-xs">
              {match.moves.map((move, i) => (
                <button
                  key={i}
                  onClick={() => { setStep(i + 1); setAutoPlaying(false); }}
                  className={`w-full flex items-center gap-2 py-1 px-2 rounded text-left transition-colors ${
                    i < step
                      ? 'text-foreground'
                      : i === step
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground'
                  } ${i + 1 === step ? 'bg-accent' : 'hover:bg-accent/50'}`}
                >
                  <span className="text-muted-foreground w-6 text-right tabular-nums">{i + 1}.</span>
                  <span>{move}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Match info */}
          <div className="surface-card p-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Details</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {match.gameType === 'ai' ? `AI (${match.aiDifficulty})` : 'Player'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your Color</span>
                <span className="text-foreground capitalize">{match.playerColor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Board</span>
                <span className="text-foreground capitalize">{match.boardTheme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Captured</span>
                <span className="text-foreground tabular-nums">{match.capturedByPlayer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lost</span>
                <span className="text-foreground tabular-nums">{match.capturedByOpponent}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchHistoryPage;
