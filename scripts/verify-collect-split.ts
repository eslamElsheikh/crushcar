/**
 * Checks the collected-amount split.
 *
 * Run: npx tsx scripts/verify-collect-split.ts
 *
 * The rule has two halves that can each be broken without the other showing
 * it: the seats have to receive whole numbers, and the seats have to add back
 * up to the figure the operator typed. A split that rounds everything down
 * looks fine per-seat and loses money in the ledger, so every case asserts
 * both the exact shares and their sum.
 */
import { splitCollectAmount, parseCollectAmount, COLLECT_AMOUNT_MAX } from '../src/lib/validations'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function sumsTo(total: number | null, seats: (number | null)[]): boolean {
  const sum = seats.reduce<number>((acc, s) => acc + (s ?? 0), 0)
  return parseCollectAmount(total) === sum
}

console.log('whole-number split')
check('1000 over 4 is 250 each', JSON.stringify(splitCollectAmount(1000, 4)) === '[250,250,250,250]', JSON.stringify(splitCollectAmount(1000, 4)))
check('4000 over 4 is 1000 each', JSON.stringify(splitCollectAmount(4000, 4)) === '[1000,1000,1000,1000]', JSON.stringify(splitCollectAmount(4000, 4)))
check('100 over 4 is 25 each', JSON.stringify(splitCollectAmount(100, 4)) === '[25,25,25,25]', JSON.stringify(splitCollectAmount(100, 4)))
check('900 over 3 is 300 each', JSON.stringify(splitCollectAmount(900, 3)) === '[300,300,300]', JSON.stringify(splitCollectAmount(900, 3)))

console.log('remainder goes to the last seats')
check('100 over 3 is 33/33/34', JSON.stringify(splitCollectAmount(100, 3)) === '[33,33,34]', JSON.stringify(splitCollectAmount(100, 3)))
check('10 over 3 is 3/3/4', JSON.stringify(splitCollectAmount(10, 3)) === '[3,3,4]', JSON.stringify(splitCollectAmount(10, 3)))
check('1000 over 3 is 333/333/334', JSON.stringify(splitCollectAmount(1000, 3)) === '[333,333,334]', JSON.stringify(splitCollectAmount(1000, 3)))
check('100 over 6 is 16/16 then 17 four times', JSON.stringify(splitCollectAmount(100, 6)) === '[16,16,17,17,17,17]', JSON.stringify(splitCollectAmount(100, 6)))

console.log('every share is a whole number')
const messy = [7, 13, 99, 101, 999, 1001, 555].flatMap((total) =>
  Array.from({ length: 11 }, (_, i) => i + 1).map((n) => splitCollectAmount(total, n)),
)
check('no fractional share is ever produced', messy.every((seats) => seats.every((s) => s === null || Number.isInteger(s))))

console.log('the seats add back up to the figure typed')
const sumCases: Array<[number, number]> = [
  [100, 3], [1000, 3], [10, 3], [4000, 4], [100, 6], [999, 7], [101, 4],
  [1, 1], [4, 4], [5000, 8], [12345, 11], [2, 3],
]
for (const [total, n] of sumCases) {
  check(`${total} over ${n} sums back to ${total}`, sumsTo(total, splitCollectAmount(total, n)), `got ${JSON.stringify(splitCollectAmount(total, n))}`)
}

console.log('a figure smaller than the seat count')
// base is 0, so the whole figure is the remainder and it lands on the last
// seats — the same "remainder goes last" rule as every other case.
check('2 over 3 is nothing/1/1', JSON.stringify(splitCollectAmount(2, 3)) === '[null,1,1]', JSON.stringify(splitCollectAmount(2, 3)))
check('...and still sums to 2', sumsTo(2, splitCollectAmount(2, 3)))
check('1 over 5 is a single 1 at the end', JSON.stringify(splitCollectAmount(1, 5)) === '[null,null,null,null,1]', JSON.stringify(splitCollectAmount(1, 5)))

console.log('nothing entered')
check('null gives no values', splitCollectAmount(null, 3).every((s) => s === null))
check('empty string gives no values', splitCollectAmount('', 3).every((s) => s === null))
check('junk gives no values', splitCollectAmount('abc', 3).every((s) => s === null))
check('zero gives no values', splitCollectAmount(0, 3).every((s) => s === null))
check('negative gives no values', splitCollectAmount(-50, 3).every((s) => s === null))
check('form strings are accepted', JSON.stringify(splitCollectAmount('4000', 4)) === '[1000,1000,1000,1000]', JSON.stringify(splitCollectAmount('4000', 4)))
check('decimals are rounded like the stored value', JSON.stringify(splitCollectAmount('100.6', 2)) === '[50,51]', JSON.stringify(splitCollectAmount('100.6', 2)))

console.log('degenerate seat counts')
check('zero seats returns nothing', JSON.stringify(splitCollectAmount(1000, 0)) === '[]', JSON.stringify(splitCollectAmount(1000, 0)))
check('negative seats returns nothing', JSON.stringify(splitCollectAmount(1000, -3)) === '[]', JSON.stringify(splitCollectAmount(1000, -3)))

console.log('round trip covers both legs')
// The wizard posts outbound and return separately, so the split is computed
// over the combined count before either request goes out.
const roundTrip = splitCollectAmount(4000, 2 + 2)
check('2 outbound + 2 return gives 1000 each', JSON.stringify(roundTrip) === '[1000,1000,1000,1000]', JSON.stringify(roundTrip))
check('outbound draws the first two', roundTrip.slice(0, 2).every((s) => s === 1000))
check('return draws the last two', roundTrip.slice(2).every((s) => s === 1000))

console.log('the ceiling still applies before splitting')
check('over the ceiling gives no values', splitCollectAmount(COLLECT_AMOUNT_MAX + 1, 4).every((s) => s === null))
check('at the ceiling still splits', splitCollectAmount(COLLECT_AMOUNT_MAX, 4).every((s) => s === COLLECT_AMOUNT_MAX / 4))

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)