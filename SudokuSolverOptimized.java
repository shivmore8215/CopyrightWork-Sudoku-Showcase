/*
 * ============================================================================
 * Project Name : Generic Sudoku Solver Using Constraint Propagation
 * File Name    : SudokuSolverOptimized.java
 * Date         : 17 September 2026
 *
 * Author       :   1. SHIVRAJ VIJAY MORE
 *                  2. DHANALAKSHMI SHRIMANT KARE
 *                  3. NIVEDITA SANJAY PAWAR
 *
 * Copyright © 2026: All Rights Reserved.
 *
 * ============================================================================
 * DESCRIPTION
 * ============================================================================
 *
 * Generic Sudoku solver using constraint propagation (Naked Singles, Hidden
 * Singles), MRV, and backtracking with the following optimizations:
 *
 * 1. CANDIDATE MASKS       — Bitmasks provide O(1) candidate calculation and
 *                            row, column, and sub-grid updates.
 * 2. WORKLIST PROPAGATION  — Re-examines only cells and units affected by
 *                            recent placements instead of the whole board.
 * 3. UNDO LOG              — Records placements and restores them in reverse
 *                            order without full-board snapshots.
 * 4. HIDDEN SINGLES        — seenOnce/seenTwice bitmasks detect singles and
 *                            contradictions without scratch arrays.
 * 5. UNIT LOOKUPS          — Row, column, and sub-grid cell lists are
 *                            precomputed and reused.
 * 6. PRIMITIVE WORKLISTS   — IntDeque/IntArrayList reduce object allocations
 *                            by storing encoded values as primitive integers.
 * 7. LIVE EMPTY-CELL LIST  — Tracks only empty cells, reducing MRV search
 *                            from a complete-board scan.
 * 8. LOOKUP TABLES         — Precomputed tables replace frequent row, column,
 *                            box, and unit calculations involving division.
 * 9. FILLED-PEER SKIPPING  — Only empty peers are added to the worklist.
 * 10. COMPLETE-UNIT SKIP   — Fully populated units are skipped immediately.
 * 11. WORKLIST DEDUP       — Generation tracking prevents duplicate entries
 *                            during the same propagation round.
 *
 * The public interface -- constructor, solve(int[][]), and printBoard(int[][])
 * -- is identical to SudokuSolver. A solver instance is safe for sequential
 * reuse but must not execute multiple solve() calls concurrently.
 *
 * NOTE ON UNDO ORDERING
 * ---------------------
 * Placements are always undone in LIFO order, allowing the live empty-cell
 * list to restore cells to their original positions in O(1).
 *
 * "A wish once imagined is now becoming a reality — Kitty🐾"
 * ============================================================================
 */

import java.util.Arrays;

/**
 * Generic Sudoku solver using bitmask candidate tracking, worklist-driven
 * propagation, and an undo log in place of full-board snapshots.
 */
public class SudokuSolverOptimized {
    private static final int UNIT_ROW = 0;
    private static final int UNIT_COL = 1;
    private static final int UNIT_BOX = 2;
    private static final int NONE = -1;
    private final int boxRows;
    private final int boxCols;
    private final int n;
    private final int boxesAcross;
    private final long fullMask;
    private final int[][][][] unitCellsCache;
    private final long[] unitCellMaskScratch;
    private final int[] rowBoxBand;
    private final int[] colBoxBand;
    private final int[] cellRowTable;
    private final int[] cellColTable;
    private final int[] unitTypeTable;
    private final int[] unitIndexTable;
    private long currentGeneration;
    private final long[] cellPendingGeneration;
    private final long[] unitPendingGeneration;
    private int[] emptyPrev;
    private int[] emptyNext;
    private int emptyHead;
    private int emptyTail;
    private long[] rowUsed;
    private long[] colUsed;
    private long[] boxUsed;

    /**
     * Creates a Sudoku solver for the specified sub-grid dimensions.
     */
    public SudokuSolverOptimized(int boxRows, int boxCols) {
        if (boxRows <= 0 || boxCols <= 0) {
            throw new IllegalArgumentException(
                    "Sub-grid dimensions must be positive.");
        }
        long dimension = (long) boxRows * (long) boxCols;
        if (dimension > 64) {
            throw new IllegalArgumentException(
                    "Board dimension N = boxRows * boxCols must not exceed "
                            + "64 (N = " + dimension + " was requested); "
                            + "candidate sets are stored in a 64-bit mask, "
                            + "and 64 is the largest dimension one mask can "
                            + "represent.");
        }
        this.boxRows = boxRows;
        this.boxCols = boxCols;
        this.n = (int) dimension;
        this.boxesAcross = this.n / boxCols;
        this.fullMask = (this.n == 64) ? -1L : (1L << this.n) - 1L;
        this.unitCellsCache = buildUnitCellsCache();
        this.unitCellMaskScratch = new long[this.n];
        this.emptyPrev = new int[this.n * this.n];
        this.emptyNext = new int[this.n * this.n];
        this.rowBoxBand = new int[this.n];
        this.colBoxBand = new int[this.n];
        for (int i = 0; i < this.n; i++) {
            this.rowBoxBand[i] = i / boxRows;
            this.colBoxBand[i] = i / boxCols;
        }
        this.cellRowTable = new int[this.n * this.n];
        this.cellColTable = new int[this.n * this.n];
        for (int code = 0; code < this.n * this.n; code++) {
            this.cellRowTable[code] = code / this.n;
            this.cellColTable[code] = code % this.n;
        }
        this.unitTypeTable = new int[3 * this.n];
        this.unitIndexTable = new int[3 * this.n];
        for (int code = 0; code < 3 * this.n; code++) {
            this.unitTypeTable[code] = code / this.n;
            this.unitIndexTable[code] = code % this.n;
        }
        this.currentGeneration = 0L;
        this.cellPendingGeneration = new long[this.n * this.n];
        this.unitPendingGeneration = new long[3 * this.n];
    }
    /**
     * Solves the supplied Sudoku board.
     * Empty cells must contain 0. The supplied board is modified
     * directly when a solution is found.
     */
    public boolean solve(int[][] board) {
        if (!isValidBoard(board)) {
            return false;
        }
        rowUsed = new long[n];
        colUsed = new long[n];
        boxUsed = new long[n];
        initEmptyCellList(board);
        for (int row = 0; row < n; row++) {
            for (int col = 0; col < n; col++) {
                int value = board[row][col];
                if (value != 0) {
                    markUsed(row, col, value);
                }
            }
        }
        return solveBoard(board, NONE);
    }
    /**
     * Performs recursive solving using constraint propagation, MRV and
     * backtracking.
     */
    private boolean solveBoard(int[][] board, int justPlacedCode) {
        IntArrayList log = new IntArrayList(16);
        if (!propagate(board, justPlacedCode, log)) {
            undo(board, log);
            return false;
        }
        int bestCellCode = findBestCell();
        if (bestCellCode == NONE) {
            return true;
        }
        int row = cellRow(bestCellCode);
        int col = cellCol(bestCellCode);
        long mask = candidateMask(row, col);
        for (int value = 1; value <= n; value++) {
            long bit = 1L << (value - 1);
            if ((mask & bit) == 0) {
                continue;
            }
            place(row, col, value);
            board[row][col] = value;
            if (solveBoard(board, encodeCell(row, col))) {
                return true;
            }
            board[row][col] = 0;
            unplace(row, col, value);
        }
        undo(board, log);
        return false;
    }
    /**
     * Runs Naked and Hidden Single propagation to a fixed point, using the
     * whole board initially and the most recently placed cell recursively.
     */
    private boolean propagate(int[][] board, int justPlacedCode, IntArrayList log) {
        currentGeneration++;
        IntDeque cellQueue = new IntDeque(64);
        IntDeque unitQueue = new IntDeque(64);
        if (justPlacedCode == NONE) {
            for (int row = 0; row < n; row++) {
                for (int col = 0; col < n; col++) {
                    enqueueCellIfNeeded(row, col, board, cellQueue);
                }
            }
            for (int i = 0; i < n; i++) {
                enqueueUnitIfNeeded(UNIT_ROW, i, unitQueue);
                enqueueUnitIfNeeded(UNIT_COL, i, unitQueue);
                enqueueUnitIfNeeded(UNIT_BOX, i, unitQueue);
            }
        } else {
            int justRow = cellRow(justPlacedCode);
            int justCol = cellCol(justPlacedCode);
            enqueuePeers(justRow, justCol, board, cellQueue);
            enqueueUnitIfNeeded(UNIT_ROW, justRow, unitQueue);
            enqueueUnitIfNeeded(UNIT_COL, justCol, unitQueue);
            enqueueUnitIfNeeded(UNIT_BOX, boxIndex(justRow, justCol), unitQueue);
        }
        while (!cellQueue.isEmpty() || !unitQueue.isEmpty()) {
            while (!cellQueue.isEmpty()) {
                int cellCode = cellQueue.poll();
                cellPendingGeneration[cellCode] = 0L;
                int row = cellRow(cellCode);
                int col = cellCol(cellCode);
                if (board[row][col] != 0) {
                    continue;
                }
                long mask = candidateMask(row, col);
                if (mask == 0L) {
                    return false;
                }
                if (isSingleBit(mask)) {
                    int value = Long.numberOfTrailingZeros(mask) + 1;
                    place(row, col, value);
                    board[row][col] = value;
                    log.add(cellCode);
                    enqueuePeers(row, col, board, cellQueue);
                    enqueueUnitIfNeeded(UNIT_ROW, row, unitQueue);
                    enqueueUnitIfNeeded(UNIT_COL, col, unitQueue);
                    enqueueUnitIfNeeded(UNIT_BOX, boxIndex(row, col), unitQueue);
                }
            }
            if (!unitQueue.isEmpty()) {
                int unitCode = unitQueue.poll();
                unitPendingGeneration[unitCode] = 0L;
                if (!checkHiddenSingles(board, unitType(unitCode), unitIndex(unitCode),
                        cellQueue, unitQueue, log)) {
                    return false;
                }
            }
        }
        return true;
    }
   /**
     * Checks a row, column, or sub-grid for Hidden Singles: values that
     * have only one legal position within the unit.
     */
    private boolean checkHiddenSingles(
            int[][] board,
            int unitType,
            int unitIndex,
            IntDeque cellQueue,
            IntDeque unitQueue,
            IntArrayList log) {
        long unitUsed = unitUsedMask(unitType, unitIndex);
        if (unitUsed == fullMask) {
            return true;
        }
        int[][] cells = unitCellsCache[unitType][unitIndex];
        long seenOnce = 0L;
        long seenTwice = 0L;
        for (int i = 0; i < cells.length; i++) {
            int row = cells[i][0];
            int col = cells[i][1];
            if (board[row][col] != 0) {
                continue;
            }
            long mask = candidateMask(row, col);
            if (mask == 0L) {
                return false;
            }
            unitCellMaskScratch[i] = mask;
            seenTwice |= (seenOnce & mask);
            seenOnce |= mask;
        }
        if ((fullMask & ~seenOnce & ~unitUsed) != 0L) {
            return false;
        }
        long hiddenSingles = seenOnce & ~seenTwice;
        if (hiddenSingles == 0L) {
            return true;
        }
        for (int value = 1; value <= n; value++) {
            long bit = 1L << (value - 1);
            if ((hiddenSingles & bit) == 0L) {
                continue;
            }
            for (int i = 0; i < cells.length; i++) {
                int row = cells[i][0];
                int col = cells[i][1];
                if (board[row][col] != 0) {
                    continue;
                }
                if ((unitCellMaskScratch[i] & bit) == 0L) {
                    continue;
                }
                place(row, col, value);
                board[row][col] = value;
                log.add(encodeCell(row, col));
                enqueuePeers(row, col, board, cellQueue);
                enqueueUnitIfNeeded(UNIT_ROW, row, unitQueue);
                enqueueUnitIfNeeded(UNIT_COL, col, unitQueue);
                enqueueUnitIfNeeded(UNIT_BOX, boxIndex(row, col), unitQueue);
                break;
            }
        }
        return true;
    }
    /**
     * Enqueues empty peers of a cell for Naked Single checks, skipping
     * filled cells and peers already pending in the current propagation call.
     */
    private void enqueuePeers(int row, int col, int[][] board, IntDeque cellQueue) {
        for (int c = 0; c < n; c++) {
            if (c != col) {
                enqueueCellIfNeeded(row, c, board, cellQueue);
            }
        }
        for (int r = 0; r < n; r++) {
            if (r != row) {
                enqueueCellIfNeeded(r, col, board, cellQueue);
            }
        }
        int startRow = rowBoxBand[row] * boxRows;
        int startCol = colBoxBand[col] * boxCols;
        for (int r = startRow; r < startRow + boxRows; r++) {
            for (int c = startCol; c < startCol + boxCols; c++) {
                if (r != row && c != col) {
                    enqueueCellIfNeeded(r, c, board, cellQueue);
                }
            }
        }
    }
    /**
     * Adds a cell to the queue for a Naked Single check, unless it is
     * already filled or already pending in the current propagation call.
     */
    private void enqueueCellIfNeeded(int row, int col, int[][] board, IntDeque cellQueue) {
        if (board[row][col] != 0) {
            return;
        }
        int code = encodeCell(row, col);
        if (cellPendingGeneration[code] == currentGeneration) {
            return;
        }
        cellPendingGeneration[code] = currentGeneration;
        cellQueue.add(code);
    }
    /**
     * Adds a unit to the queue for a Hidden Single check unless it is
     * already pending in the current propagation call.
     */
    private void enqueueUnitIfNeeded(int unitType, int unitIndex, IntDeque unitQueue) {
        int code = encodeUnit(unitType, unitIndex);
        if (unitPendingGeneration[code] == currentGeneration) {
            return;
        }
        unitPendingGeneration[code] = currentGeneration;
        unitQueue.add(code);
    }
    /**
     * Precomputes and caches, once per solver instance, the list of
     * cells belonging to every row, column and sub-grid.
     */
    private int[][][][] buildUnitCellsCache() {
        int[][][][] cache = new int[3][n][][];
        for (int i = 0; i < n; i++) {
            cache[UNIT_ROW][i] = computeUnitCells(UNIT_ROW, i);
            cache[UNIT_COL][i] = computeUnitCells(UNIT_COL, i);
            cache[UNIT_BOX][i] = computeUnitCells(UNIT_BOX, i);
        }
        return cache;
    }
    /**
     * Lists the N cells belonging to a unit; called once during construction
     * to build the cache, while later calls use the cached result.
     */
    private int[][] computeUnitCells(int unitType, int unitIndex) {
        int[][] cells = new int[n][2];
        if (unitType == UNIT_ROW) {
            for (int c = 0; c < n; c++) {
                cells[c][0] = unitIndex;
                cells[c][1] = c;
            }
        } else if (unitType == UNIT_COL) {
            for (int r = 0; r < n; r++) {
                cells[r][0] = r;
                cells[r][1] = unitIndex;
            }
        } else {
            int boxRowIndex = unitIndex / boxesAcross;
            int boxColIndex = unitIndex % boxesAcross;
            int startRow = boxRowIndex * boxRows;
            int startCol = boxColIndex * boxCols;
            int i = 0;
            for (int r = startRow; r < startRow + boxRows; r++) {
                for (int c = startCol; c < startCol + boxCols; c++) {
                    cells[i][0] = r;
                    cells[i][1] = c;
                    i++;
                }
            }
        }
        return cells;
    }
    /**
     * Builds the initial doubly linked list of empty cells in row-major order.
     * Only cells that start empty are included; given cells remain unlinked.
     */
    private void initEmptyCellList(int[][] board) {
        int last = NONE;
        emptyHead = NONE;
        emptyTail = NONE;
        for (int row = 0; row < n; row++) {
            for (int col = 0; col < n; col++) {
                if (board[row][col] != 0) {
                    continue;
                }
                int code = encodeCell(row, col);
                emptyPrev[code] = last;
                emptyNext[code] = NONE;
                if (last == NONE) {
                    emptyHead = code;
                } else {
                    emptyNext[last] = code;
                }
                last = code;
            }
        }
        emptyTail = last;
    }
    /**
     * Splices a cell out of the empty-cell list in O(1), because it
     * has just been filled.
     */
    private void removeEmptyCell(int code) {
        int p = emptyPrev[code];
        int nx = emptyNext[code];
        if (p != NONE) {
            emptyNext[p] = nx;
        } else {
            emptyHead = nx;
        }
        if (nx != NONE) {
            emptyPrev[nx] = p;
        } else {
            emptyTail = p;
        }
    }
    /**
     * Splices a cell back into the empty-cell list in O(1), at
     * exactly the point it was removed from, because a failed branch
     * is undoing its placement.
     */
    private void restoreEmptyCell(int code) {
        int p = emptyPrev[code];
        int nx = emptyNext[code];
        if (p != NONE) {
            emptyNext[p] = code;
        } else {
            emptyHead = code;
        }
        if (nx != NONE) {
            emptyPrev[nx] = code;
        } else {
            emptyTail = code;
        }
    }
    /**
     * Finds the empty cell with the fewest candidates using MRV. Scans only empty
     * cells in row-major order, reducing the search from O(N²) to O(empty cells).
     * Stops early when a cell with one candidate is found.
     */
    private int findBestCell() {
        int bestCode = NONE;
        int minimumCandidates = n + 1;
        for (int code = emptyHead; code != NONE; code = emptyNext[code]) {
            int row = cellRow(code);
            int col = cellCol(code);
            int candidateCount = Long.bitCount(candidateMask(row, col));
            if (candidateCount < minimumCandidates) {
                minimumCandidates = candidateCount;
                bestCode = code;
                if (minimumCandidates == 1) {
                    break;
                }
            }
        }
        return bestCode;
    }
    /**
     * Computes the candidate mask for an empty cell: bit (v - 1) is
     * set exactly when value v does not yet appear in the cell's
     * row, column or sub-grid.
     */
    private long candidateMask(int row, int col) {
        return fullMask & ~(rowUsed[row] | colUsed[col] | boxUsed[boxIndex(row, col)]);
    }
    /**
     * Records a value by updating its row, column, and sub-grid masks and
     * removing the cell from the empty-cell list. The caller updates the board.
     */
    private void place(int row, int col, int value) {
        markUsed(row, col, value);
        removeEmptyCell(encodeCell(row, col));
    }
    /**
     * Clears the value's row, column, and sub-grid mask bits and restores the
     * cell to the empty-cell list; the caller clears the value from the board.
     */
    private void unplace(int row, int col, int value) {
        long bit = 1L << (value - 1);
        int box = boxIndex(row, col);
        rowUsed[row] &= ~bit;
        colUsed[col] &= ~bit;
        boxUsed[box] &= ~bit;
        restoreEmptyCell(encodeCell(row, col));
    }
    /**
     * Sets the tracking bits for a value in its row, column, and sub-grid.
     * Used only for initial givens; other placements go through {@link #place}.
     */
    private void markUsed(int row, int col, int value) {
        long bit = 1L << (value - 1);
        int box = boxIndex(row, col);
        rowUsed[row] |= bit;
        colUsed[col] |= bit;
        boxUsed[box] |= bit;
    }
    /**
     * Undoes all placements in reverse order, clearing the board cells and
     * their corresponding tracking bits.
     */
    private void undo(int[][] board, IntArrayList log) {
        for (int i = log.size() - 1; i >= 0; i--) {
            int cellCode = log.get(i);
            int row = cellRow(cellCode);
            int col = cellCol(cellCode);
            int value = board[row][col];
            board[row][col] = 0;
            unplace(row, col, value);
        }
    }
    /**
     * Returns the tracking mask for an entire unit: bit (v - 1) is
     * set exactly when value v already occupies some cell in that
     * row, column or sub-grid.
     */
    private long unitUsedMask(int unitType, int unitIndex) {
        if (unitType == UNIT_ROW) {
            return rowUsed[unitIndex];
        } else if (unitType == UNIT_COL) {
            return colUsed[unitIndex];
        } else {
            return boxUsed[unitIndex];
        }
    }
    /**
     * Computes which sub-grid a cell belongs to.
     */
    private int boxIndex(int row, int col) {
        return rowBoxBand[row] * boxesAcross + colBoxBand[col];
    }
    /**
     * Encodes a {row, col} pair as a single non-negative int.
     */
    private int encodeCell(int row, int col) {
        return row * n + col;
    }
    /**
     * Decodes the row from a cell encoded by {@link #encodeCell}.
     */
    private int cellRow(int code) {
        return cellRowTable[code];
    }
    /**
     * Decodes the column from a cell encoded by {@link #encodeCell}.
     */
    private int cellCol(int code) {
        return cellColTable[code];
    }
    /**
     * Encodes a {unitType, unitIndex} pair as a single non-negative int.
     */
    private int encodeUnit(int unitType, int unitIndex) {
        return unitType * n + unitIndex;
    }
    /**
     * Decodes the unit type from a unit encoded by {@link #encodeUnit}.
     */
    private int unitType(int code) {
        return unitTypeTable[code];
    }
    /**
     * Decodes the unit index from a unit encoded by {@link #encodeUnit}.
     */
    private int unitIndex(int code) {
        return unitIndexTable[code];
    }
    /**
     * Checks whether a mask has exactly one bit set.
     */
    private static boolean isSingleBit(long mask) {
        return mask != 0L && (mask & (mask - 1)) == 0L;
    }
    /**
     * Validates the supplied Sudoku board.
     */
    private boolean isValidBoard(int[][] board) {
        if (board == null || board.length != n) {
            return false;
        }
        long[] rowSeen = new long[n];
        long[] colSeen = new long[n];
        long[] boxSeen = new long[n];
        for (int row = 0; row < n; row++) {
            if (board[row] == null || board[row].length != n) {
                return false;
            }
            for (int col = 0; col < n; col++) {
                int value = board[row][col];
                if (value < 0 || value > n) {
                    return false;
                }
                if (value == 0) {
                    continue;
                }
                long bit = 1L << (value - 1);
                int box = boxIndex(row, col);
                if ((rowSeen[row] & bit) != 0
                        || (colSeen[col] & bit) != 0
                        || (boxSeen[box] & bit) != 0) {
                    return false;
                }
                rowSeen[row] |= bit;
                colSeen[col] |= bit;
                boxSeen[box] |= bit;
            }
        }
        return true;
    }
    /**
     * Prints the Sudoku board in a structured format.
     */
    public void printBoard(int[][] board) {

        for (int row = 0; row < n; row++) {
            for (int col = 0; col < n; col++) {
                System.out.printf("%3d", board[row][col]);
                if ((col + 1) % boxCols == 0 && col != n - 1) {
                    System.out.print(" |");
                }
            }
            System.out.println();
            if ((row + 1) % boxRows == 0 && row != n - 1) {
                for (int i = 0; i < n * 4 + boxCols - 1; i++) {
                    System.out.print("-");
                }
                System.out.println();
            }
        }
    }

    private static final class IntDeque {

        private int[] data;
        private int head;
        private int size;
        IntDeque(int initialCapacity) {
            data = new int[Math.max(8, initialCapacity)];
            head = 0;
            size = 0;
        }

        boolean isEmpty() {
            return size == 0;
        }

        void add(int value) {

            if (size == data.length) {
                grow();
            }
            int tail = (head + size) % data.length;
            data[tail] = value;
            size++;
        }

        int poll() {
            int value = data[head];
            head = (head + 1) % data.length;
            size--;
            return value;
        }

        private void grow() {
            int[] newData = new int[data.length * 2];
            for (int i = 0; i < size; i++) {
                newData[i] = data[(head + i) % data.length];
            }
            data = newData;
            head = 0;
        }
    }

    private static final class IntArrayList {
        private int[] data;
        private int size;
        IntArrayList(int initialCapacity) {
            data = new int[Math.max(8, initialCapacity)];
            size = 0;
        }
        void add(int value) {
            if (size == data.length) 
                data = Arrays.copyOf(data, data.length * 2);
            data[size] = value;
            size++;
        }
        int get(int index) {
            return data[index];
        }
        int size() {
            return size;
        }
    }
}