import { describe, expect, it } from 'vitest';

import { executeMove, getCaptureMovesForPiece, getMovesForPiece } from '@/lib/checkers';
import { Move, Piece } from '@/types/game';

function createBoard(size = 8): (Piece | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

describe('checkers chained captures', () => {
  it('keeps the same piece active until the capture sequence is complete', () => {
    const board = createBoard();
    const whitePiece: Piece = { id: 'w1', color: 'white', isKing: false, row: 5, col: 0 };
    const firstBlackPiece: Piece = { id: 'b1', color: 'black', isKing: false, row: 4, col: 1 };
    const secondBlackPiece: Piece = { id: 'b2', color: 'black', isKing: false, row: 2, col: 3 };

    board[5][0] = whitePiece;
    board[4][1] = firstBlackPiece;
    board[2][3] = secondBlackPiece;

    const openingMoves = getMovesForPiece(board, whitePiece);

    expect(openingMoves).toHaveLength(1);
    expect(openingMoves[0].captures).toEqual([
      { row: 4, col: 1 },
      { row: 2, col: 3 },
    ]);
    expect(openingMoves[0].sequence).toEqual([
      { to: { row: 3, col: 2 }, capture: { row: 4, col: 1 } },
      { to: { row: 1, col: 4 }, capture: { row: 2, col: 3 } },
    ]);

    const firstStep = openingMoves[0].sequence?.[0];
    expect(firstStep).toBeDefined();

    const firstStepMove: Move = {
      from: openingMoves[0].from,
      to: firstStep!.to,
      captures: [firstStep!.capture],
      piece: whitePiece,
      sequence: [firstStep!],
    };

    const boardAfterFirstCapture = executeMove(board, firstStepMove);
    const continuedPiece = boardAfterFirstCapture[3][2];

    expect(continuedPiece).toMatchObject({ color: 'white', row: 3, col: 2 });

    const followUpMoves = getCaptureMovesForPiece(boardAfterFirstCapture, continuedPiece!);

    expect(followUpMoves).toHaveLength(1);
    expect(followUpMoves[0].from).toEqual({ row: 3, col: 2 });
    expect(followUpMoves[0].sequence).toEqual([
      { to: { row: 1, col: 4 }, capture: { row: 2, col: 3 } },
    ]);
  });

  it('allows a newly crowned piece to continue capturing as a king', () => {
    const board = createBoard();
    const whitePiece: Piece = { id: 'w1', color: 'white', isKing: false, row: 2, col: 1 };
    const firstBlackPiece: Piece = { id: 'b1', color: 'black', isKing: false, row: 1, col: 2 };
    const secondBlackPiece: Piece = { id: 'b2', color: 'black', isKing: false, row: 1, col: 4 };

    board[2][1] = whitePiece;
    board[1][2] = firstBlackPiece;
    board[1][4] = secondBlackPiece;

    const captureMoves = getMovesForPiece(board, whitePiece);

    expect(captureMoves).toHaveLength(3);
    expect(captureMoves.every(move => move.captures.length === 2)).toBe(true);
    expect(captureMoves.map(move => move.captures)).toEqual([
      [{ row: 1, col: 2 }, { row: 1, col: 4 }],
      [{ row: 1, col: 2 }, { row: 1, col: 4 }],
      [{ row: 1, col: 2 }, { row: 1, col: 4 }],
    ]);
    expect(captureMoves[0].sequence?.[0]).toEqual({
      to: { row: 0, col: 3 },
      capture: { row: 1, col: 2 },
    });
    expect(captureMoves.map(move => move.sequence?.[1]?.capture)).toEqual([
      { row: 1, col: 4 },
      { row: 1, col: 4 },
      { row: 1, col: 4 },
    ]);
  });

  it('prevents a king from reversing direction within the same capture sequence', () => {
    const board = createBoard();
    const whiteKing: Piece = { id: 'wk1', color: 'white', isKing: true, row: 5, col: 2 };
    const firstBlackPiece: Piece = { id: 'b1', color: 'black', isKing: false, row: 4, col: 3 };
    const secondBlackPiece: Piece = { id: 'b2', color: 'black', isKing: false, row: 2, col: 5 };
    const thirdBlackPiece: Piece = { id: 'b3', color: 'black', isKing: false, row: 6, col: 1 };

    board[5][2] = whiteKing;
    board[4][3] = firstBlackPiece;
    board[2][5] = secondBlackPiece;
    board[6][1] = thirdBlackPiece;

    const captureMoves = getMovesForPiece(board, whiteKing);

    expect(captureMoves).toHaveLength(2);
    expect(captureMoves.every(move => move.captures.length === 2)).toBe(true);
    expect(captureMoves.some(move => move.captures.some(capture => capture.row === 6 && capture.col === 1))).toBe(false);
  });
});