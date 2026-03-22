import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PlayerAvatar from '@/components/PlayerAvatar';
import CountryFlag from '@/components/CountryFlag';
import { AIDifficulty, BoardTheme, BoardSize, PieceColor, User } from '@/types/game';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Crown, Search, LogOut, Monitor, Users, Settings, Cpu, Swords,
  Palette, History, UserCircle, Trophy, Award, Bell,
} from 'lucide-react';
import boardClassic from '@/assets/board-classic.jpg';
import boardWooden from '@/assets/board-wooden.jpg';
import boardMetal from '@/assets/board-metal.jpg';

const boardThemeImages: Record<BoardTheme, string> = {
  classic: boardClassic,
  wooden: boardWooden,
  metal: boardMetal,
};

interface GameInvite {
  id: string;
  matchId: string | null;
  roomName: string | null;
  fromUserId: string;
  toUserId: string;
  boardSize: BoardSize;
  boardTheme: BoardTheme;
  inviterColor: PieceColor;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  fromUsername: string;
  fromAvatar: string | null;
  fromCountry: string;
  fromCountryCode: string;
  toUsername: string;
  toAvatar: string | null;
  toCountry: string;
  toCountryCode: string;
  createdAt: string;
}

interface InvitesResponse {
  incoming: GameInvite[];
  outgoing: GameInvite[];
}

interface ActiveMatch {
  id: string;
  roomName: string | null;
  boardSize: BoardSize;
  boardTheme: BoardTheme;
  myColor: PieceColor;
  opponentId: string;
  opponentUsername: string;
  opponentAvatar: string | null;
  opponentCountry: string;
  opponentCountryCode: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [showGameSetup, setShowGameSetup] = useState<'ai' | 'multi' | null>(null);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('moderate');
  const [selectedColor, setSelectedColor] = useState<PieceColor>('white');
  const [selectedTheme, setSelectedTheme] = useState<BoardTheme>('classic');
  const [selectedSize, setSelectedSize] = useState<BoardSize>(12);
  const [roomName, setRoomName] = useState('');
  const [players, setPlayers] = useState<User[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<User | null>(null);
  const [incomingInvites, setIncomingInvites] = useState<GameInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<GameInvite[]>([]);
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const seenIncomingInviteIds = useRef<Set<string>>(new Set());
  const handledAcceptedOutgoing = useRef<Set<string>>(new Set());

  const fetchPlayers = useCallback(async (): Promise<User[]> => {
    try {
      const data = await apiFetch<{ users: User[] }>('/users');
      const filteredPlayers = data.users.filter(p => p.id !== user?.id);
      setPlayers(filteredPlayers);
      return filteredPlayers;
    } catch {
      // Ignore transient network errors in dashboard polling
      return [];
    }
  }, [user?.id]);

  const fetchInvites = useCallback(async () => {
    if (!user) return;

    try {
      const data = await apiFetch<InvitesResponse>('/invites');
      const pendingIncoming = data.incoming.filter(invite => invite.status === 'pending');
      setIncomingInvites(pendingIncoming);
      setOutgoingInvites(data.outgoing);

      const acceptedOutgoing = data.outgoing.filter(invite => invite.status === 'accepted' && invite.matchId);
      for (const invite of acceptedOutgoing) {
        if (!handledAcceptedOutgoing.current.has(invite.id)) {
          handledAcceptedOutgoing.current.add(invite.id);
          toast({
            title: 'Invite accepted',
            description: `${invite.toUsername} accepted your challenge. Resume it from Active Matches.`,
            duration: 3500,
          });
        }
      }

      const incomingIds = new Set(pendingIncoming.map(invite => invite.id));
      const previous = seenIncomingInviteIds.current;
      for (const invite of pendingIncoming) {
        if (!previous.has(invite.id)) {
          toast({
            title: 'New match invite',
            description: `${invite.fromUsername} challenged you to a match.`,
            duration: 3500,
          });
        }
      }
      seenIncomingInviteIds.current = incomingIds;
    } catch {
      // Ignore transient network errors in dashboard polling
    }
  }, [toast, user]);

  const fetchActiveMatches = useCallback(async () => {
    if (!user) return;

    try {
      const data = await apiFetch<{ matches?: ActiveMatch[]; match?: ActiveMatch | null }>('/matches/active');
      if (Array.isArray(data.matches)) {
        setActiveMatches(data.matches);
      } else if (data.match) {
        setActiveMatches([data.match]);
      } else {
        setActiveMatches([]);
      }
    } catch {
      // Ignore transient network errors in dashboard polling
    }
  }, [user]);

  // Fetch all users from the DB (excluding self)
  useEffect(() => {
    fetchPlayers();
    fetchInvites();
    fetchActiveMatches();

    const interval = setInterval(() => {
      fetchPlayers();
      fetchInvites();
      fetchActiveMatches();
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchActiveMatches, fetchInvites, fetchPlayers]);

  if (!user) return null;

  const otherPlayers = players.filter(p => p.id !== user.id);

  const filtered = otherPlayers.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const multiFiltered = otherPlayers.filter(p =>
    p.username.toLowerCase().includes(playerSearch.toLowerCase())
  );

  const startAIGame = () => {
    navigate('/game', {
      state: { gameType: 'ai', aiDifficulty, playerColor: selectedColor, boardTheme: selectedTheme, boardSize: selectedSize },
    });
  };

  const startMultiplayerGame = async () => {
    if (!selectedOpponent) return;

    try {
      const trimmedRoomName = roomName.trim();
      await apiFetch('/invites', {
        method: 'POST',
        body: JSON.stringify({
          toUserId: selectedOpponent.id,
          ...(trimmedRoomName ? { roomName: trimmedRoomName } : {}),
          boardSize: selectedSize,
          boardTheme: selectedTheme,
          inviterColor: selectedColor,
        }),
      });

      toast({
        title: 'Invite sent',
        description: `Waiting for ${selectedOpponent.username} to accept or decline.`,
        duration: 3000,
      });
      fetchInvites();
    } catch (err: unknown) {
      toast({
        title: 'Failed to send invite',
        description: err instanceof Error ? err.message : 'Please try again.',
        duration: 3500,
      });
    }
  };

  const acceptInvite = useCallback(async (invite: GameInvite) => {
    try {
      const response = await apiFetch<{ invite: GameInvite }>(`/invites/${invite.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'accepted' }),
      });
      const acceptedInvite = response.invite;

      let opponentFromList = players.find(p => p.id === invite.fromUserId) ?? null;
      if (!opponentFromList) {
        toast({
          title: 'Player list is outdated',
          description: 'Refreshing players before opening the game.',
          duration: 2500,
        });
        const refreshedPlayers = await fetchPlayers();
        opponentFromList = refreshedPlayers.find(p => p.id === invite.fromUserId) ?? null;
      }

      if (!opponentFromList) {
        toast({
          title: 'Could not start match',
          description: 'Opponent data is unavailable. Try again in a moment.',
          duration: 3500,
        });
        fetchInvites();
        return;
      }

      navigate('/game', {
        state: {
          gameType: 'multiplayer',
          playerColor: invite.inviterColor === 'white' ? 'black' : 'white',
          boardTheme: invite.boardTheme,
          boardSize: invite.boardSize,
          matchId: acceptedInvite.matchId,
          opponent: opponentFromList,
        },
      });
    } catch (err: unknown) {
      toast({
        title: 'Failed to accept invite',
        description: err instanceof Error ? err.message : 'Please try again.',
        duration: 3500,
      });
    }
  }, [fetchInvites, fetchPlayers, navigate, players, toast]);

  const declineInvite = useCallback(async (invite: GameInvite) => {
    try {
      await apiFetch(`/invites/${invite.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'declined' }),
      });
      toast({
        title: 'Invite declined',
        description: `You declined ${invite.fromUsername}'s challenge.`,
        duration: 2500,
      });
      fetchInvites();
    } catch (err: unknown) {
      toast({
        title: 'Failed to decline invite',
        description: err instanceof Error ? err.message : 'Please try again.',
        duration: 3500,
      });
    }
  }, [fetchInvites, toast]);

  const userCountryCode = user.countryCode;

  const resumeActiveMatch = useCallback((match: ActiveMatch) => {
    const opponent = players.find(p => p.id === match.opponentId) ?? null;
    navigate('/game', {
      state: {
        gameType: 'multiplayer',
        playerColor: match.myColor,
        boardTheme: match.boardTheme,
        boardSize: match.boardSize,
        matchId: match.id,
        opponent: opponent ?? undefined,
      },
    });
  }, [navigate, players]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground tracking-tight">Checkers Arena</span>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto min-w-0">
            <div className="flex items-center gap-2">
              <PlayerAvatar username={user.username} src={user.avatar} size={32} />
              <span className="text-sm font-medium text-foreground max-w-28 truncate hidden sm:inline">{user.username}</span>
              <CountryFlag code={userCountryCode} className="h-4 w-6" title={user.country} />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/profile')}>
                <UserCircle className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/leaderboard')}>
                <Trophy className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/achievements')}>
                <Award className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/history')}>
                <History className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { logout().then(() => navigate('/')); }}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Play Options */}
          <div className="lg:col-span-2 space-y-6">
            {activeMatches.length > 0 && (
              <div className="surface-card border border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">Active multiplayer matches</div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {activeMatches.map(match => (
                    <div key={match.id} className="rounded-md border border-border bg-background/80 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{match.roomName ?? 'Arena Room'} · vs {match.opponentUsername}</div>
                        <div className="text-xs text-muted-foreground">
                          {match.boardSize}x{match.boardSize} · {match.boardTheme} · you play {match.myColor}
                        </div>
                      </div>
                      <Button size="sm" className="w-full sm:w-auto" onClick={() => resumeActiveMatch(match)}>Resume</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Played', value: user.stats.gamesPlayed },
                { label: 'Wins', value: user.stats.wins },
                { label: 'Losses', value: user.stats.losses },
                { label: 'Win Rate', value: `${user.stats.winRate}%` },
              ].map(s => (
                <div key={s.label} className="surface-card p-4 text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Play Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowGameSetup(prev => prev === 'ai' ? null : 'ai')}
                className={`surface-card p-6 text-left group transition-colors border-2 ${
                  showGameSetup === 'ai' ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/40'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                  showGameSetup === 'ai' ? 'bg-primary/20' : 'bg-primary/10 group-hover:bg-primary/20'
                }`}>
                  <Cpu className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Play vs Computer</h3>
                <p className="text-sm text-muted-foreground">Challenge the AI at Easy, Moderate, or Hard</p>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowGameSetup(prev => prev === 'multi' ? null : 'multi')}
                className={`surface-card p-6 text-left group transition-colors border-2 ${
                  showGameSetup === 'multi' ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/40'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                  showGameSetup === 'multi' ? 'bg-primary/20' : 'bg-primary/10 group-hover:bg-primary/20'
                }`}>
                  <Swords className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Play vs Player</h3>
                <p className="text-sm text-muted-foreground">Challenge online opponents in real time</p>
              </motion.button>
            </div>

            {/* AI Game Setup Panel */}
            {showGameSetup === 'ai' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="surface-card p-6 space-y-5"
              >
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> Game Setup
                </h3>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Difficulty</label>
                  <div className="flex gap-2">
                    {(['easy', 'moderate', 'hard'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setAiDifficulty(d)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          aiDifficulty === d
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                      >
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Board Size</label>
                  <div className="flex gap-2">
                    {([{ size: 8 as const, label: '8 × 8' }, { size: 12 as const, label: '12 × 12' }]).map(b => (
                      <button
                        key={b.size}
                        onClick={() => setSelectedSize(b.size)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          selectedSize === b.size
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Your Color</label>
                  <div className="flex gap-2">
                    {(['white', 'black'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          selectedColor === c
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${c === 'white' ? 'bg-foreground' : 'bg-background border border-border'}`} />
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Board Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: 'classic' as const, label: 'Classic' },
                      { id: 'wooden' as const, label: 'Wooden' },
                      { id: 'metal' as const, label: 'Metal' },
                    ]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTheme(t.id)}
                        className={`rounded-lg overflow-hidden transition-all border-2 ${
                          selectedTheme === t.id
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <img
                          src={boardThemeImages[t.id]}
                          alt={`${t.label} board`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className={`py-1.5 text-xs font-medium text-center transition-colors ${
                          selectedTheme === t.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}>
                          {t.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button onClick={startAIGame} className="flex-1">
                    Start Game
                  </Button>
                  <Button variant="outline" onClick={() => setShowGameSetup(null)}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Multiplayer Setup Panel */}
            {showGameSetup === 'multi' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="surface-card p-6 space-y-5"
              >
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Swords className="w-4 h-4 text-primary" /> Game Setup
                </h3>

                {/* Board Size */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Board Size</label>
                  <div className="flex gap-2">
                    {([{ size: 8 as const, label: '8 × 8' }, { size: 12 as const, label: '12 × 12' }]).map(b => (
                      <button
                        key={b.size}
                        onClick={() => setSelectedSize(b.size)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          selectedSize === b.size
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Your Color */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Your Color</label>
                  <div className="flex gap-2">
                    {(['white', 'black'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          selectedColor === c
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${c === 'white' ? 'bg-foreground' : 'bg-background border border-border'}`} />
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Board Theme */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Board Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: 'classic' as const, label: 'Classic' },
                      { id: 'wooden' as const, label: 'Wooden' },
                      { id: 'metal' as const, label: 'Metal' },
                    ]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTheme(t.id)}
                        className={`rounded-lg overflow-hidden transition-all border-2 ${
                          selectedTheme === t.id
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <img
                          src={boardThemeImages[t.id]}
                          alt={`${t.label} board`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className={`py-1.5 text-xs font-medium text-center transition-colors ${
                          selectedTheme === t.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}>
                          {t.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Find Opponent */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Find an Opponent</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by username..."
                      value={playerSearch}
                      onChange={e => setPlayerSearch(e.target.value)}
                      className="pl-9 bg-secondary border-border text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Room Name (optional)</label>
                  <Input
                    placeholder="Example: Evening Falcon Arena"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    className="bg-secondary border-border text-foreground"
                    maxLength={80}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to auto-generate a unique animal room name.
                  </p>
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-md p-1">
                  {multiFiltered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {players.length === 0 ? 'No other registered players yet' : 'No players found'}
                    </p>
                  ) : (
                    multiFiltered.map(player => (
                      <div
                        key={player.id}
                        onClick={() => setSelectedOpponent(prev => prev?.id === player.id ? null : player)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer border-2 ${
                          selectedOpponent?.id === player.id
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:bg-accent'
                        }`}
                      >
                        <div className="relative">
                          <PlayerAvatar username={player.username} src={player.avatar} size={36} />
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                              player.isOnline ? 'bg-online pulse-online' : 'bg-offline'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">{player.username}</span>
                            <CountryFlag code={player.countryCode} className="h-3 w-5" title={player.country} />
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              player.isOnline
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {player.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {player.stats.wins}W {player.stats.losses}L · {player.stats.winRate}%
                          </div>
                        </div>
                        {selectedOpponent?.id === player.id && (
                          <span className="text-xs font-medium text-primary">Selected</span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    onClick={startMultiplayerGame}
                    className="flex-1"
                    disabled={!selectedOpponent}
                  >
                    {selectedOpponent ? `Create Room vs ${selectedOpponent.username}` : 'Select an Opponent'}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowGameSetup(null); setSelectedOpponent(null); setRoomName(''); }}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Online Players */}
          <div className="surface-card p-4 h-fit">
            {incomingInvites.length > 0 && (
              <div className="mb-4 border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Bell className="w-4 h-4 text-primary" />
                  Match Invitations ({incomingInvites.length})
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {incomingInvites.map(invite => (
                  <div key={invite.id} className="rounded-md bg-background/80 border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{invite.roomName ?? 'Arena Room'}</div>
                        <div className="text-xs text-muted-foreground truncate">from {invite.fromUsername}</div>
                        <div className="text-xs text-muted-foreground">
                          {invite.boardSize}x{invite.boardSize} · {invite.boardTheme} · you play {invite.inviterColor === 'white' ? 'black' : 'white'}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => void acceptInvite(invite)}>
                        Join
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => void declineInvite(invite)}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Live Arena
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.filter(p => p.isOnline).length} online
              </span>
            </div>

            {outgoingInvites.some(invite => invite.status === 'pending') && (
              <div className="mb-3 text-xs text-muted-foreground bg-secondary/60 border border-border rounded-md px-3 py-2">
                Pending invites: {outgoingInvites.filter(invite => invite.status === 'pending').length}
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search player..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-secondary border-border text-foreground"
              />
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {players.length === 0 ? 'No other players yet' : 'No results'}
                </p>
              ) : filtered.map(player => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors cursor-pointer group"
                >
                  <div className="relative">
                    <PlayerAvatar username={player.username} src={player.avatar} size={36} />
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                        player.isOnline ? 'bg-online pulse-online' : 'bg-offline'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{player.username}</span>
                      <CountryFlag code={player.countryCode} className="h-4 w-6" title={player.country} />
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {player.stats.wins}W {player.stats.losses}L · {player.stats.winRate}%
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    onClick={() => {
                      setSelectedOpponent(player);
                      setShowGameSetup('multi');
                    }}
                  >
                    Challenge
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
