/**
 * CSV cell escaping, with formula-injection neutralisation.
 *
 * Quoting is not protection. Excel decides a cell is a formula from what the
 * cell *contains* after the CSV has been parsed, so `"=cmd|' /C calc'!A0"` is
 * still a formula — the quotes are consumed by the parser and never seen. The
 * only defence is to change the value itself: a leading apostrophe makes Excel
 * read the cell as text, and it is not displayed.
 *
 * Covered leading characters, per the OWASP CSV-injection guidance:
 *   =  +  -  @        spreadsheet functions and references
 *   \t \r \n          control characters Excel also accepts as a formula start
 *
 * The consequence worth knowing about: a cell that is a *negative number*
 * ("-120") starts with '-' and therefore becomes text. It still renders
 * identically, but a spreadsheet will not add it up. Neutralising it anyway is
 * the trade the guidance asks for, and every other cell in the range has the
 * same first character, so there is no safe way to tell them apart.
 */

const FORMULA_START = new Set(['=', '+', '-', '@', '\t', '\r', '\n'])

/**
 * Prepends `'` to any value that a spreadsheet would read as a formula.
 *
 * The *first* character is what the guidance names, but leading spaces are
 * checked too: a cell of `" =1+1"` is trimmed by some importers before the
 * formula scan, and neutralising it costs nothing on a value that no ordinary
 * data field resembles.
 *
 * Exported separately from `escapeCsvCell` so tests can assert the
 * neutralisation on its own, before quoting muddies the signal.
 */
export function neutralizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length === 0) return str
  if (FORMULA_START.has(str[0])) return `'${str}`
  const firstMeaningful = str.trimStart()[0]
  if (firstMeaningful !== undefined && FORMULA_START.has(firstMeaningful)) {
    return `'${str}`
  }
  return str
}

/**
 * Neutralise first, quote second — in that order, always.
 *
 * Quoting first would leave `=…` as the first character of the parsed cell and
 * hand the whole point of the neutralisation back.
 */
export function escapeCsvCell(value: unknown): string {
  const str = neutralizeCsvCell(value)
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
