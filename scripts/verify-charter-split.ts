/* Behaviour check for the charter/seat bus split and the pricing helpers.
 * Run: npx tsx scripts/verify-charter-split.mts
 */
import { busesForMode, isBusType, busTypeLabel, BUS_TYPES } from '../src/lib/bus-types';
import { distributeCharterTotal } from '../src/lib/charter';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
}

const buses = [
  { id: 'b1', name: 'Coach', type: 'COACH_BUS' },
  { id: 'b2', name: 'Mini', type: 'MINI_BUS' },
  { id: 'b3', name: 'Elive', type: 'CHARTER' },
  { id: 'b4', name: 'VIP', type: 'VIP_BUS' },
];

console.log('bus filtering');
check('charter tab lists only CHARTER buses',
  busesForMode(buses, 'BUS').map((b: any) => b.id), ['b3']);
check('seat tab lists every non-CHARTER bus',
  busesForMode(buses, 'SEAT').map((b: any) => b.id), ['b1', 'b2', 'b4']);
check('the already-assigned bus stays visible while editing',
  busesForMode(buses, 'SEAT', 'b3').map((b: any) => b.id), ['b1', 'b2', 'b3', 'b4']);
check('switching tabs rejects the other tab buses',
  busesForMode(buses, 'BUS', null).some((b: any) => b.id === 'b1'), false);

console.log('type validation');
check('CHARTER is accepted', isBusType('CHARTER'), true);
check('VIP_BUS is accepted', isBusType('VIP_BUS'), true);
check('garbage is rejected', isBusType('SUPER_BUS'), false);
check('undefined is rejected', isBusType(undefined), false);
check('null is rejected', isBusType(null), false);
check('CHARTER ships in the dropdown list',
  BUS_TYPES.map((b) => b.value).includes('CHARTER'), true);

console.log('labels');
check('arabic charter label', busTypeLabel('CHARTER', true), 'شارتر');
check('english charter label', busTypeLabel('CHARTER', false), 'Charter');
check('unknown type falls back to the raw value', busTypeLabel('MYSTERY', true), 'MYSTERY');
check('missing type renders a dash', busTypeLabel(null, true), '—');

console.log('charter pricing');
check('every stop carries the same total', distributeCharterTotal(5000, 3), [5000, 5000, 5000]);
check('two stops', distributeCharterTotal(1200, 2), [1200, 1200]);
check('zero stops', distributeCharterTotal(900, 0), []);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);