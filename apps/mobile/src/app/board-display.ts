/**
 * The order a page's cells are drawn in. As stored, a page reads row by row. Transposed (phones held
 * upright), a columns x rows page is drawn as rows x columns: the cell stored at (row r, column c) is drawn
 * at (row c, column r), so each stored row becomes a column. Display only: slots never change.
 *
 * Returns, for each drawn cell in reading order, its index on the stored page.
 */
export function displayedCellIndexes(columns: number, rows: number, transposed: boolean): number[] {
  const count = columns * rows;
  if (!transposed || columns === rows) return Array.from({ length: count }, (_, index) => index);
  const indexes: number[] = [];
  for (let drawnRow = 0; drawnRow < columns; drawnRow += 1) {
    for (let drawnColumn = 0; drawnColumn < rows; drawnColumn += 1) indexes.push(drawnColumn * columns + drawnRow);
  }
  return indexes;
}
