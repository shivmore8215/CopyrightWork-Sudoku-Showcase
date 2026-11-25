/* ═══════════════════════════════════════════════════════════════════════════
   PRESET SIZES & CURATED MULTI-SIZE SHOWCASE PUZZLES
   Every puzzle below has been verified against both SudokuSolverOptimized.java
   and SudokuEngine (assets/js/solver.js).
═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const SIZE_PRESETS = [
    {
      key: '2x2',
      boxRows: 2,
      boxCols: 2,
      n: 4,
      label: '4×4',
      boxLabel: '2×2 boxes',
      desc: 'Mini Sudoku · Values 1–4'
    },
    {
      key: '2x3',
      boxRows: 2,
      boxCols: 3,
      n: 6,
      label: '6×6',
      boxLabel: '2×3 boxes',
      desc: 'Rectangular sub-grids · Values 1–6'
    },
    {
      key: '2x4',
      boxRows: 2,
      boxCols: 4,
      n: 8,
      label: '8×8',
      boxLabel: '2×4 boxes',
      desc: 'Rectangular sub-grids · Values 1–8'
    },
    {
      key: '3x3',
      boxRows: 3,
      boxCols: 3,
      n: 9,
      label: '9×9',
      boxLabel: '3×3 boxes',
      desc: 'Classic Sudoku (Default)'
    },
    {
      key: '3x4',
      boxRows: 3,
      boxCols: 4,
      n: 12,
      label: '12×12',
      boxLabel: '3×4 boxes',
      desc: 'Extended rectangular · Values 1–12'
    },
    {
      key: '4x4',
      boxRows: 4,
      boxCols: 4,
      n: 16,
      label: '16×16',
      boxLabel: '4×4 boxes',
      desc: 'Mega Sudoku · Values 1–16'
    }
  ];

  const PUZZLES_BY_SIZE = {
    '2x2': [
      {
        name: 'Easy (4×4 Logic)',
        sub: 'Unique · 12 Naked Singles (0 guesses)',
        str: '0130000000020010'
      },
      {
        name: 'Hard (MRV & Backtrack)',
        sub: 'Under-constrained · 4 MRV guesses & backtrack',
        str: '0040000103040000'
      },
      {
        name: 'Unsolvable Test',
        sub: 'Valid start with no legal solution',
        str: '1000003441002001'
      },
      {
        name: 'Invalid Test',
        sub: 'Duplicate clue conflict detection',
        str: '1100003400000000'
      }
    ],
    '2x3': [
      {
        name: 'Easy (2×3 Boxes)',
        sub: 'Unique · 26 Naked Singles (0 hidden/guess)',
        str: '000500030001210060000300000023006000'
      },
      {
        name: 'Medium (Hidden Singles)',
        sub: 'Unique · 13 Hidden + 13 Naked Singles (Step 1)',
        str: '106020300000001004000060030000000406'
      },
      {
        name: 'Hard (MRV & Backtrack)',
        sub: 'Unique · 5 MRV guesses & 2 backtracks',
        str: '000012000600004200001050030005400000'
      },
      {
        name: 'Unsolvable Test',
        sub: 'Valid start with no legal solution',
        str: '320650546103010360400500054000000001'
      }
    ],
    '2x4': [
      {
        name: 'Easy (2×4 Boxes)',
        sub: 'Unique · 41 Naked Singles (0 hidden/guess)',
        str: '0010800000007430100430002080500001000000500713047650080080020000'
      },
      {
        name: 'Medium (Hidden Singles)',
        sub: 'Unique · 22 Hidden + 24 Naked Singles (Step 1)',
        str: '2870050000000000000400080750000002000700000083060001405070080000'
      },
      {
        name: 'Hard (MRV & Backtrack)',
        sub: 'Unique · 7 MRV guesses & 5 backtracks',
        str: '0365008070020000001000000006300500015038000020000000040000006021'
      },
      {
        name: 'Unsolvable Test',
        sub: 'Valid start with no legal solution',
        str: '3817562006421073200063077301850042300060170002000000215660207030'
      }
    ],
    '3x3': [
      {
        name: 'Easy (Classic)',
        sub: '51 Naked Singles · 0 guesses (Matches Figma)',
        str: '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
      },
      {
        name: 'Medium',
        sub: '4 Hidden Singles + 18 MRV guesses & 13 backtracks',
        str: '000000000904607000076804100309701080008000300050308702007502610000403208000000000'
      },
      {
        name: 'Hard',
        sub: '151 Hidden Singles · 81 MRV guesses & 71 backtracks',
        str: '000000012000000003002300400001800005060070800000009000008500000900040500470006000'
      },
      {
        name: 'Minimal (17 Clues)',
        sub: '19 Hidden + 45 Naked Singles · 0 guesses',
        str: '000000010400000000020000000000050407008000300001090000300400200050100000000806000'
      },
      {
        name: 'Unsolvable Test',
        sub: 'Valid start with no legal solution',
        str: '300000000000003085001020000000507000004000100090000000500000073002010000000040009'
      },
      {
        name: 'Invalid Test',
        sub: 'Duplicate clue conflict detection',
        str: '550070000600195000098000060800060003400803001700020006060000280000419005000080079'
      }
    ],
    '3x4': [
      {
        name: 'Easy (3×4 Boxes)',
        sub: '80 Naked Singles · 0 hidden/guess',
        str: '3 0 0 2 12 0 8 6 7 11 0 0 0 5 0 0 0 0 4 9 12 8 1 6 1 0 0 0 0 0 0 0 0 4 0 0 0 0 10 0 6 0 0 2 0 0 0 12 0 0 0 0 0 11 1 0 0 0 4 0 11 12 1 5 9 0 10 7 0 3 8 2 7 10 0 4 8 0 0 3 0 0 12 0 2 3 9 0 0 0 0 0 0 0 0 0 12 1 0 11 0 7 5 0 0 0 0 3 6 0 0 1 10 0 0 0 0 0 0 4 0 11 0 10 0 9 0 0 0 2 0 8 0 4 7 3 0 6 0 8 0 0 5 11'
      },
      {
        name: 'Medium (Hidden Singles)',
        sub: 'Unique · 32 Hidden + 54 Naked Singles (Step 1)',
        str: '0 2 0 0 1 3 0 8 0 11 0 0 0 0 0 10 7 0 0 0 5 0 0 0 1 8 0 3 11 0 4 12 0 0 9 2 0 7 0 2 0 8 0 0 0 0 0 0 0 0 10 12 5 0 0 0 3 4 0 1 0 1 3 0 0 0 10 0 0 5 0 7 10 0 8 1 0 11 0 0 0 0 0 5 0 6 0 0 0 7 0 0 8 0 0 0 0 0 2 0 0 0 8 0 12 9 11 6 12 10 1 0 0 6 0 9 7 0 0 0 0 0 0 0 0 0 7 3 0 0 4 0 8 0 7 5 0 0 0 0 0 2 6 0'
      },
      {
        name: 'Hard (MRV & Backtrack)',
        sub: 'Unique · 31 MRV guesses & 23 backtracks',
        str: '0 0 8 0 1 11 0 7 0 2 0 0 0 0 0 0 8 0 0 0 0 4 1 7 0 0 0 4 0 0 0 3 5 6 0 0 0 0 2 0 0 0 12 0 0 0 4 0 11 8 0 7 2 0 0 0 0 12 0 0 5 0 6 0 0 0 0 0 1 3 0 9 0 12 0 0 0 7 1 4 0 0 5 0 0 3 0 0 11 12 0 0 0 1 0 4 0 0 0 0 0 0 10 2 12 0 0 0 0 0 3 0 0 0 0 0 0 0 7 0 10 0 0 0 7 6 0 8 0 9 0 1 0 6 0 11 0 4 0 1 2 0 0 0'
      }
    ],
    '4x4': [
      {
        name: 'Easy (4×4 Boxes)',
        sub: '117 Naked Singles · 0 hidden/guess',
        str: '0 8 2 0 0 13 6 0 14 0 0 16 10 0 15 0 15 0 9 0 0 2 0 0 12 0 0 6 0 1 0 7 16 14 1 7 10 0 15 4 8 3 0 0 12 13 0 11 6 0 0 11 0 0 0 0 0 4 0 15 8 0 5 3 0 0 6 2 0 0 14 13 0 1 0 0 0 0 0 9 0 4 0 0 3 5 8 9 11 0 6 12 0 0 14 0 0 3 5 9 11 6 0 0 0 0 16 0 0 15 10 1 0 7 16 13 4 15 10 0 0 9 0 8 0 0 0 2 13 6 0 12 0 4 1 14 15 0 3 0 5 0 0 0 0 0 3 10 0 11 2 0 0 12 0 0 0 0 0 14 0 16 4 14 15 0 9 0 5 0 11 2 6 0 13 0 2 5 11 8 6 0 13 0 16 0 4 1 0 3 9 10 4 0 10 0 0 0 0 0 2 0 0 11 13 0 7 6 7 13 0 6 1 10 4 16 9 15 0 0 2 0 0 0 11 0 0 0 0 14 7 6 1 16 0 4 0 8 3 15 3 0 8 15 2 12 0 5 0 6 0 7 0 0 0 0'
      },
      {
        name: 'Medium (Hidden Singles)',
        sub: '77 Hidden + 84 Naked Singles (Step 1 · 0 guesses)',
        str: '6 3 0 15 0 0 0 0 13 7 0 0 0 0 0 0 0 0 0 2 0 0 0 13 0 0 0 9 0 3 0 15 0 8 0 0 0 0 15 14 12 0 0 4 0 0 11 10 0 7 0 10 0 0 0 0 0 0 0 0 12 16 4 2 0 6 0 16 0 0 7 0 1 11 0 0 15 0 0 0 0 4 10 0 5 0 8 0 0 0 0 14 2 0 0 0 14 0 0 0 12 0 0 0 10 0 7 0 0 11 0 0 5 0 0 0 0 0 3 0 0 0 0 0 0 4 13 7 3 1 0 5 0 0 0 6 4 0 0 0 0 10 0 0 0 0 4 12 8 10 13 0 9 0 0 0 0 0 0 0 0 10 11 0 0 1 0 9 6 0 14 0 0 2 7 0 16 0 0 0 0 0 0 0 0 0 0 8 9 0 0 5 0 13 0 11 15 0 0 0 0 0 0 2 7 0 0 0 0 12 7 0 0 13 0 0 0 0 9 15 16 0 2 0 0 14 16 0 0 12 0 0 0 13 0 1 0 0 0 9 0 0 0 9 2 14 6 16 0 0 4 10 8 0 0 0'
      },
      {
        name: 'Hard (MRV & Backtrack)',
        sub: '68 MRV guesses & 50 backtracks',
        str: '3 10 1 0 0 4 9 2 0 0 11 0 13 0 15 0 0 0 0 4 0 13 0 0 0 0 10 0 12 0 16 11 16 0 0 0 3 0 0 0 5 0 0 0 0 9 0 2 0 0 5 13 16 0 0 0 0 0 0 4 0 0 0 10 12 5 11 15 0 0 10 7 6 0 0 14 0 2 4 0 0 7 0 0 0 3 0 1 0 12 0 15 14 6 0 9 13 0 6 0 0 0 0 0 0 0 0 0 0 10 8 0 4 1 0 0 13 0 0 9 0 0 0 0 15 11 0 0 0 0 0 10 9 0 0 0 8 0 0 0 6 0 0 0 0 0 13 2 5 0 0 0 0 0 3 10 0 8 7 0 7 0 8 0 1 0 4 3 12 0 0 0 0 0 9 0 0 0 12 0 7 0 8 16 0 0 0 0 0 0 1 3 6 0 15 0 11 5 0 12 0 0 4 1 0 0 10 8 0 4 14 1 6 0 15 0 3 0 0 0 0 16 0 12 0 12 0 0 0 0 0 0 0 0 0 0 1 0 2 0 0 0 3 7 0 0 0 0 0 0 0 5 0 0 0 0'
      }
    ]
  };

  global.SudokuPuzzles = {
    SIZE_PRESETS,
    PUZZLES_BY_SIZE
  };
})(window);
