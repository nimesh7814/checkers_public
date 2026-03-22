import React from 'react';
import { motion } from 'framer-motion';
import { BoardTheme, Piece as PieceType, Position, Move, BoardSize } from '@/types/game';

interface BoardProps {
  board: (PieceType | null)[][];
  theme: BoardTheme;
  boardSize: BoardSize;
  selectedPiece: Position | null;
  validMoves: Move[];
  movablePieces?: Position[];
  onSquareClick: (row: number, col: number) => void;
  flipped?: boolean;
}

const themeColors: Record<BoardTheme, { dark: string; light: string }> = {
  classic: { dark: 'bg-zinc-700', light: 'bg-zinc-500' },
  wooden: { dark: 'bg-amber-900', light: 'bg-amber-300' },
  metal: { dark: 'bg-slate-700', light: 'bg-slate-500' },
};

const CheckerBoard: React.FC<BoardProps> = ({
  board, theme, boardSize, selectedPiece, validMoves, movablePieces = [], onSquareClick, flipped = false,
}) => {
  const colors = themeColors[theme];
  const SIZE = boardSize;

  const isSelected = (r: number, c: number) =>
    selectedPiece?.row === r && selectedPiece?.col === c;

  const isValidTarget = (r: number, c: number) =>
    validMoves.some(m => m.to.row === r && m.to.col === c);

  const isMovable = (r: number, c: number) =>
    movablePieces.some(p => p.row === r && p.col === c);

  const rows = Array.from({ length: SIZE }, (_, i) => (flipped ? SIZE - 1 - i : i));
  const cols = Array.from({ length: SIZE }, (_, i) => (flipped ? SIZE - 1 - i : i));

  const gridClass = SIZE === 8 ? 'grid-cols-8' : 'grid-cols-12';

  return (
    <div className="w-full max-w-[min(calc(100vw-16px),calc(100vh-100px),700px)] lg:max-w-[min(calc(100vh-80px),calc(100vw-320px),700px)] aspect-square mx-auto">
      {/* Column labels */}
      <div className={`grid ${gridClass} mb-1 px-1`}>
        {cols.map(c => (
          <div key={c} className="text-center text-[10px] text-muted-foreground font-mono">
            {String.fromCharCode(65 + c)}
          </div>
        ))}
      </div>

      <div className={`grid ${gridClass} rounded-md overflow-hidden shadow-2xl border border-border`}>
        {rows.map(r =>
          cols.map(c => {
            const isDark = (r + c) % 2 === 1;
            const piece = board[r][c];
            const selected = isSelected(r, c);
            const validTarget = isValidTarget(r, c);
            const canMove = !selected && piece && isMovable(r, c);

            return (
              <div
                key={`${r}-${c}`}
                className={`aspect-square relative cursor-pointer ${
                  isDark ? colors.dark : colors.light
                } ${selected ? 'ring-2 ring-inset ring-primary' : ''} ${canMove ? 'ring-2 ring-inset ring-primary/40' : ''}`}
                onClick={() => onSquareClick(r, c)}
              >
                {canMove && (
                  <div className="absolute inset-[14%] rounded-full border-2 border-primary/50 pointer-events-none" />
                )}

                {/* Valid move indicator */}
                {validTarget && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-1/3 h-1/3 rounded-full bg-primary/40 animate-pulse" />
                  </div>
                )}

                {/* Piece */}
                {piece && (
                  <motion.div
                    layout
                    layoutId={piece.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="absolute inset-[10%] flex items-center justify-center"
                  >
                    <div
                      className={`w-full h-full rounded-full flex items-center justify-center ${
                        piece.color === 'white'
                          ? 'bg-gradient-to-b from-neutral-100 to-neutral-300 shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),0_2px_8px_rgba(0,0,0,0.4)]'
                          : 'bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.6)]'
                      } ${selected ? 'ring-2 ring-primary glow-mint' : ''} ${canMove ? 'ring-2 ring-primary/50 animate-pulse' : ''}`}
                    >
                      {piece.isKing && (
                        <svg
                          viewBox="0 0 24 24"
                          className={`w-1/2 h-1/2 ${piece.color === 'white' ? 'text-amber-600' : 'text-amber-400'}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5z" />
                        </svg>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CheckerBoard;
