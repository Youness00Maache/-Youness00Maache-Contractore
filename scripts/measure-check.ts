/**
 * Checks for Quick measure (competitor gap #20, calculator): lib/measure.ts — rooms with doors and windows, areas,
 * linear totals, roof pitch factors 1/12–12/12 and squares, cubic yards, feet-inches / metric parsing and conversion,
 * waste % + pack rounding, the description summary, recent measurements (device storage) and edge cases.
 *   npx tsx scripts/measure-check.ts
 */
import {
    CU_FT_PER_CU_YD, M_PER_FT, PITCH_MAX_RISE, RECENT_MAX, ROUND_STEP, STANDARD_OPENINGS, areaTotal, blankMeasureState, ceilTo, clean,
    convertAmount, convertLength, convertMeasureState, defaultUnitSystem, finalQuantity, formatLength, formatQty, linearTotal,
    measureFinal, measurementSummary, newOpening, newSegment, newShape, parseCount, parseFeetInches, parseInches, parseNumber,
    parseUnitSystem, pickedOutput, pitchDegrees, pitchFactor, pitchFactorFromDegrees, pluralUnit, readLength, readMeasure,
    readRecentMeasurements, recentMeasureKey, recentWhen, rememberMeasurement, riseFromDegrees, roofResult, roomAreas,
    sanitizeMeasureState, shapeArea, suggestFromUnit, unitFromText, volumeResult, withMeasurement,
    type LengthInput, type MeasureState,
} from '../lib/measure.ts';
import type { KeyValueStore } from '../lib/userDataSync.ts';
import { normalizeLineItem } from '../components/forms/formUtils.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);
const near = (label: string, actual: number, expected: number, tol = 1e-4) => {
    if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ≈${expected}\n  actual   ${actual}`); }
};

class MemoryStorage implements KeyValueStore {
    map = new Map<string, string>();
    full = false;
    getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
    setItem(k: string, v: string) { if (this.full) throw new Error('QuotaExceededError'); this.map.set(k, String(v)); }
    removeItem(k: string) { this.map.delete(k); }
}

const L = (major: string, minor = ''): LengthInput => ({ major, minor });
const state = (patch: (s: MeasureState) => void, system: 'imperial' | 'metric' = 'imperial'): MeasureState => {
    const s = blankMeasureState(system);
    patch(s);
    return s;
};
const out = (s: MeasureState, key: string) => readMeasure(s).outputs.find(o => o.key === key);

// ------------------------------------------------------------------------------------------------- numbers
eq('parse: integer', parseNumber('12'), 12);
eq('parse: decimal', parseNumber('12.5'), 12.5);
eq('parse: leading dot', parseNumber('.5'), 0.5);
eq('parse: decimal comma', parseNumber('12,5'), 12.5);
eq('parse: 0,125 is a decimal', parseNumber('0,125'), 0.125);
eq('parse: thousands comma', parseNumber('1,250'), 1250);
eq('parse: thousands + decimals', parseNumber('1,250.75'), 1250.75);
eq('parse: two thousands groups', parseNumber('1,250,000'), 1250000);
eq('parse: bad commas', parseNumber('1,2,3'), null);
eq('parse: mixed fraction', parseNumber('6 1/2'), 6.5);
eq('parse: mixed fraction with dash', parseNumber('6-1/2'), 6.5);
eq('parse: fraction', parseNumber('3/4'), 0.75);
eq('parse: divide by zero', parseNumber('1/0'), null);
eq('parse: negative', parseNumber('-3'), -3);
eq('parse: unicode minus', parseNumber('−3'), -3);
eq('parse: empty', parseNumber(''), null);
eq('parse: spaces', parseNumber('   '), null);
eq('parse: junk', parseNumber('abc'), null);
eq('parse: 12-6 is not a number', parseNumber('12-6'), null);
eq('parse: NaN number', parseNumber(NaN), null);
eq('parse: undefined', parseNumber(undefined), null);
eq('count: empty = 1', parseCount(''), 1);
eq('count: empty default override', parseCount('', 0), 0);
eq('count: rounds', parseCount('2.4'), 2);
eq('count: negative → null', parseCount('-1'), null);
eq('count: junk → null', parseCount('x'), null);
eq('count: capped', parseCount('100000'), 9999);
eq('formatQty: thousands + 2 decimals', formatQty(1234.567), '1,234.57');
eq('formatQty: trims zeros', formatQty(168), '168');
eq('formatQty: no -0', formatQty(-0.0000001), '0');
eq('ceilTo: exact stays', ceilTo(168, 1), 168);
eq('ceilTo: float noise does not round up', ceilTo(0.1 + 0.2, 0.01), 0.3);
eq('ceilTo: 184.8 → 185 (whole)', ceilTo(184.8, 1), 185);
eq('ceilTo: 2.471 → 2.48', ceilTo(2.471, 0.01), 2.48);
eq('ceilTo: zero / negative → 0', [ceilTo(0, 1), ceilTo(-5, 1)], [0, 0]);
eq('clean: no -0', Object.is(clean(-0), 0), true);

// ---------------------------------------------------------------------------------------- feet / inches / metres
eq('ft box: plain feet', parseFeetInches('12'), 12);
eq("ft box: 12'6\"", parseFeetInches('12\'6"'), 12.5);
eq("ft box: 12' 6", parseFeetInches("12' 6"), 12.5);
eq('ft box: 12 ft 6 in', parseFeetInches('12 ft 6 in'), 12.5);
eq('ft box: 12ft', parseFeetInches('12ft'), 12);
eq('ft box: 12 feet', parseFeetInches('12 feet'), 12);
near("ft box: 12' 6 1/2\"", parseFeetInches('12\' 6 1/2"') as number, 12 + 6.5 / 12);
eq('ft box: 6" only', parseFeetInches('6"'), 0.5);
eq("ft box: 6'' (two quotes) = inches", parseFeetInches("6''"), 0.5);
eq('ft box: curly marks', parseFeetInches('12′6″'), 12.5);
eq('ft box: junk', parseFeetInches('twelve'), null);
eq('ft box: lone mark', parseFeetInches("'"), null);
eq('in box: 6', parseInches('6'), 6);
eq('in box: 6 1/2"', parseInches('6 1/2"'), 6.5);
eq('in box: 8 in', parseInches('8 in'), 8);
eq('in box: junk', parseInches('x'), null);
eq('length: ft + in', readLength(L('12', '6'), 'imperial'), { value: 12.5, empty: false, valid: true });
eq('length: inches only', readLength(L('', '8'), 'imperial').value, clean(8 / 12, 9));
eq('length: empty', readLength(L(''), 'imperial'), { value: 0, empty: true, valid: true });
eq('length: undefined', readLength(undefined, 'metric'), { value: 0, empty: true, valid: true });
eq('length: negative is invalid', readLength(L('-3'), 'imperial'), { value: 0, empty: false, valid: false });
eq('length: negative inches invalid', readLength(L('3', '-2'), 'imperial').valid, false);
eq('length: junk invalid', readLength(L('abc'), 'metric').valid, false);
eq('length: metric metres', readLength(L('3.45'), 'metric').value, 3.45);
eq('length: metric m + cm', readLength(L('3', '45'), 'metric').value, 3.45);
eq('length: metric decimal comma', readLength(L('3,45'), 'metric').value, 3.45);
eq('format: 12.5 ft', formatLength(12.5, 'imperial'), "12' 6\"");
eq('format: 6\' 8"', formatLength(6 + 8 / 12, 'imperial'), "6' 8\"");
eq('format: whole feet', formatLength(14, 'imperial'), "14'");
eq('format: inches only', formatLength(4 / 12, 'imperial'), '4"');
eq('format: 11.999" rolls to the next foot', formatLength(12.9999999, 'imperial'), "13'");
eq('format: metric', formatLength(3.81, 'metric'), '3.81 m');
eq('format: negative shown as 0', formatLength(-2, 'imperial'), "0'");

// ---------------------------------------------------------------------------------------------- unit conversion
eq("convert: 12' 6\" → 3.81 m", convertLength(L('12', '6'), 'imperial', 'metric'), L('3.81'));
eq('convert: 3.81 m → 12\' 6"', convertLength(L('3.81'), 'metric', 'imperial'), L('12', '6'));
eq("convert: 7' round trip", convertLength(convertLength(L('7'), 'imperial', 'metric'), 'metric', 'imperial'), L('7'));
eq("convert: 6' 8\" round trip", convertLength(convertLength(L('6', '8'), 'imperial', 'metric'), 'metric', 'imperial'), L('6', '8'));
eq('convert: 1 m → 3\' 3.375" (nearest 1/8")', convertLength(L('1'), 'metric', 'imperial'), L('3', '3.375'));
eq('convert: 4" depth → 0.102 m', convertLength(L('', '4'), 'imperial', 'metric'), L('0.102'));
eq('convert: 0.1 m → 0\' 3 7/8" (3.937" to the nearest 1/8")', convertLength(L('0.1'), 'metric', 'imperial'), L('0', '3.875'));
eq('convert: empty stays empty', convertLength(L(''), 'imperial', 'metric'), L(''));
eq('convert: junk kept as typed', convertLength(L('abc'), 'imperial', 'metric'), L('abc'));
eq('convert: same system unchanged', convertLength(L('12', '6'), 'imperial', 'imperial'), L('12', '6'));
near('convert: 1 m² = 10.7639 sq ft', convertAmount(1, 'm²', 'sq ft') as number, 10.7639, 1e-4);
near('convert: 100 sq ft = 9.2903 m²', convertAmount(100, 'sq ft', 'm²') as number, 9.290304, 1e-6);
near('convert: 1 square = 100 sq ft', convertAmount(1, 'sq', 'sq ft') as number, 100, 1e-9);
near('convert: 1 cu yd = 27 cu ft', convertAmount(1, 'cu yd', 'cu ft') as number, 27, 1e-9);
near('convert: 1 cu yd = 0.7646 m³', convertAmount(1, 'cu yd', 'm³') as number, 0.764555, 1e-6);
near('convert: 1 lf = 0.3048 m', convertAmount(1, 'lf', 'm') as number, M_PER_FT, 1e-12);
eq('convert: area → length is refused', convertAmount(1, 'sq ft', 'lf'), null);

// ------------------------------------------------------------------------------------------------------ rooms
{
    const a = roomAreas(12, 14, 8);
    eq('room 12×14×8: floor', a.floor, 168);
    eq('room: ceiling = floor', a.ceiling, 168);
    eq('room: perimeter', a.perimeter, 52);
    eq('room: walls', a.walls, 416);
    eq('room: walls + ceiling', a.wallsAndCeiling, 584);
    const door = 3 * (6 + 8 / 12); // 20 sq ft
    const b = roomAreas(12, 14, 8, [{ count: 2, width: 3, height: 6 + 8 / 12 }, { count: 3, width: 3, height: 4 }]);
    near('room: standard door = 20 sq ft', door, 20);
    eq('room: openings 2 doors + 3 windows = 76', b.openings, 76);
    eq('room: walls minus openings', b.walls, 340);
    eq('room: gross walls kept', b.wallsGross, 416);
    eq('room: openings never bigger than walls', roomAreas(2, 2, 2, [{ count: 10, width: 3, height: 7 }]).walls, 0);
    eq('room: openings > walls flagged', roomAreas(2, 2, 2, [{ count: 10, width: 3, height: 7 }]).openingsExceedWalls, true);
    eq('room: no height → no walls', roomAreas(12, 14, 0).walls, 0);
    eq('room: negative dims are 0', roomAreas(-12, 14, 8).floor, 0);
    eq('room: zero count opening ignored', roomAreas(12, 14, 8, [{ count: 0, width: 3, height: 7 }]).walls, 416);
    eq('room: NaN ignored', roomAreas(NaN, 14, 8).perimeter, 28);
}
{
    // the same room typed in the sheet, with ft + in and the standard door/window sizes
    const s = state(st => {
        st.room.length = L('12');
        st.room.width = L('14');
        st.room.height = L('8');
        st.room.openings = [{ ...newOpening('door', 'imperial'), count: '2' }, { ...newOpening('window', 'imperial'), count: '3' }];
    });
    eq('sheet room: floor', out(s, 'floor')?.value, 168);
    eq('sheet room: walls', out(s, 'walls')?.value, 340);
    eq('sheet room: perimeter unit lf', [out(s, 'perimeter')?.value, out(s, 'perimeter')?.unit], [52, 'lf']);
    eq('sheet room: work line for floor', out(s, 'floor')?.work, "12' × 14'");
    eq('sheet room: work line for walls', out(s, 'walls')?.work, "52 lf × 8' − 76 sq ft (2 doors, 3 windows)");
    eq('sheet room: no issues', readMeasure(s).issues, []);
    eq('sheet room: default pick = floor', pickedOutput(s)?.key, 'floor');
    s.pick.room = 'walls';
    eq('sheet room: picked walls', pickedOutput(s)?.key, 'walls');
    s.pick.room = 'nope';
    eq('sheet room: unknown pick → first', pickedOutput(s)?.key, 'floor');
    const custom = state(st => {
        st.room.length = L('10'); st.room.width = L('10'); st.room.height = L('9');
        st.room.openings = [{ ...newOpening('other', 'imperial'), count: '1', width: L('16'), height: L('7') }]; // garage door
    });
    eq('sheet room: custom opening 16×7', out(custom, 'walls')?.value, 360 - 112);
    const bad = state(st => { st.room.length = L('12'); st.room.width = L('x'); st.room.openings = [{ ...newOpening('door', 'imperial'), count: '-1' }]; });
    eq('sheet room: issues listed', readMeasure(bad).issues, ['Width: not a length.', 'Door 1: count is not a whole number.']);
    eq('sheet room: bad width → floor 0', out(bad, 'floor')?.value, 0);
    const huge = state(st => { st.room.length = L('2'); st.room.width = L('2'); st.room.height = L('2'); st.room.openings = [{ ...newOpening('door', 'imperial'), count: '5' }]; });
    ok('sheet room: openings bigger than walls → issue', readMeasure(huge).issues.some(i => i.startsWith('Doors and windows are bigger')));
    const metric = state(st => {
        st.room.length = L('4'); st.room.width = L('3.5'); st.room.height = L('2.5');
        st.room.openings = [newOpening('door', 'metric'), newOpening('window', 'metric')];
    }, 'metric');
    eq('metric room: floor m²', [out(metric, 'floor')?.value, out(metric, 'floor')?.unit], [14, 'm²']);
    eq('metric room: walls = 37.5 − 1.89 − 1.44', out(metric, 'walls')?.value, 34.17);
    eq('metric room: perimeter in m', [out(metric, 'perimeter')?.value, out(metric, 'perimeter')?.unit], [15, 'm']);
    eq('standard sizes: imperial door 3\' × 6\' 8"', STANDARD_OPENINGS.imperial.door, { width: L('3'), height: L('6', '8') });
}

// ------------------------------------------------------------------------------------------------------- area
eq('shape: rectangle', shapeArea('rect', 12, 10), 120);
eq('shape: triangle', shapeArea('tri', 6, 4), 12);
eq('shape: negative = 0', shapeArea('rect', -2, 4), 0);
eq('area: add and take away', areaTotal([{ kind: 'rect', a: 12, b: 10 }, { kind: 'tri', a: 6, b: 4 }, { kind: 'rect', a: 3, b: 3, subtract: true }]), { total: 123, added: 132, removed: 9, negative: false });
eq('area: more taken away than added → 0', areaTotal([{ kind: 'rect', a: 2, b: 2 }, { kind: 'rect', a: 3, b: 3, subtract: true }]), { total: 0, added: 4, removed: 9, negative: true });
eq('area: empty list', areaTotal([]).total, 0);
{
    const s = state(st => {
        st.mode = 'area';
        st.area.shapes = [{ ...newShape('rect'), a: L('12'), b: L('10') }, { ...newShape('tri'), a: L('6'), b: L('4') }, { ...newShape('rect', true), a: L('3'), b: L('3') }];
    });
    eq('sheet area: total', out(s, 'total')?.value, 123);
    eq('sheet area: work line', out(s, 'total')?.work, "12' × 10' + ½ × 6' × 4' − 3' × 3'");
    const neg = state(st => { st.mode = 'area'; st.area.shapes = [{ ...newShape('rect', true), a: L('3'), b: L('3') }]; });
    ok('sheet area: negative → issue', readMeasure(neg).issues.some(i => i.includes('taken away')));
    eq('sheet area: negative → 0', out(neg, 'total')?.value, 0);
    const many = state(st => { st.mode = 'area'; st.area.shapes = Array.from({ length: 6 }, () => ({ ...newShape('rect'), a: L('1'), b: L('1') })); });
    eq('sheet area: long work line is shortened', out(many, 'total')?.work, "1' × 1' + 1' × 1' + 1' × 1' + 1' × 1' + 2 more");
}

// ----------------------------------------------------------------------------------------------------- linear
eq('linear: sum', linearTotal([{ length: 12 }, { length: 8.5 }, { length: 4, count: 3 }]), 32.5);
eq('linear: count 0', linearTotal([{ length: 12, count: 0 }]), 0);
eq('linear: negatives ignored', linearTotal([{ length: -12 }, { length: 2 }]), 2);
eq('linear: empty', linearTotal([]), 0);
{
    const s = state(st => {
        st.mode = 'linear';
        st.linear.segments = [{ ...newSegment(), length: L('12') }, { ...newSegment(), length: L('8', '6') }, { ...newSegment(), length: L('4'), count: '3' }];
    });
    eq('sheet linear: total lf', [out(s, 'total')?.value, out(s, 'total')?.unit], [32.5, 'lf']);
    eq('sheet linear: work', out(s, 'total')?.work, "12' + 8' 6\" + 3 × 4'");
    const bad = state(st => { st.mode = 'linear'; st.linear.segments = [{ ...newSegment(), length: L('5'), count: 'two' }]; });
    eq('sheet linear: bad count', readMeasure(bad).issues, ['Length 1: count is not a whole number.']);
}

// ------------------------------------------------------------------------------------------------------- roof
{
    const table: Array<[number, number]> = [
        [1, 1.0035], [2, 1.0138], [3, 1.0308], [4, 1.0541], [5, 1.0833], [6, 1.1180],
        [7, 1.1577], [8, 1.2019], [9, 1.2500], [10, 1.3017], [11, 1.3566], [12, 1.4142],
    ];
    for (const [rise, factor] of table) near(`pitch ${rise}/12 factor`, pitchFactor(rise), factor, 5e-5);
    eq('pitch: flat = 1', pitchFactor(0), 1);
    eq('pitch: negative = flat', pitchFactor(-4), 1);
    eq('pitch: NaN = flat', pitchFactor(NaN), 1);
    near('pitch: capped at 24/12', pitchFactor(40), pitchFactor(PITCH_MAX_RISE), 1e-12);
    eq('pitch: bad run = 1', pitchFactor(6, 0), 1);
    near('pitch: 45° = 12/12', pitchFactorFromDegrees(45), Math.SQRT2, 1e-9);
    near('pitch: 6/12 ≈ 26.57°', pitchDegrees(6), 26.565, 1e-3);
    near('pitch: 45° → rise 12', riseFromDegrees(45), 12, 1e-9);
    const r = roofResult(1200, pitchFactor(6));
    near('roof: 1,200 sq ft plan at 6/12', r.area, 1341.6408, 1e-3);
    near('roof: squares', r.squares, 13.416408, 1e-5);
    eq('roof: zero plan', roofResult(0, 1.2).area, 0);
    eq('roof: factor below 1 treated as flat', roofResult(100, 0.5).area, 100);
    const s = state(st => { st.mode = 'roof'; st.roof.length = L('40'); st.roof.width = L('30'); st.roof.pitch = '6'; });
    near('sheet roof: area from L × W', out(s, 'area')?.value as number, 1341.6408, 1e-3);
    eq('sheet roof: squares unit', out(s, 'squares')?.unit, 'sq');
    eq('sheet roof: work line', out(s, 'area')?.work, "40' × 30' × 1.118 (6/12)");
    const typed = state(st => { st.mode = 'roof'; st.roof.by = 'area'; st.roof.planArea = '1,200'; st.roof.pitch = '12'; });
    near('sheet roof: typed plan area 12/12', out(typed, 'area')?.value as number, 1697.0563, 1e-3);
    const deg = state(st => { st.mode = 'roof'; st.roof.by = 'area'; st.roof.planArea = '100'; st.roof.pitch = '45'; st.roof.pitchUnit = 'deg'; }, 'metric');
    near('sheet roof: metric 45°', out(deg, 'area')?.value as number, 141.4214, 1e-3);
    eq('sheet roof: metric has no squares', out(deg, 'squares'), undefined);
    const steep = state(st => { st.mode = 'roof'; st.roof.by = 'area'; st.roof.planArea = '100'; st.roof.pitch = '30'; });
    ok('sheet roof: too steep → issue', readMeasure(steep).issues.includes('Pitch: at most 24/12.'));
    const flat = state(st => { st.mode = 'roof'; st.roof.by = 'area'; st.roof.planArea = '100'; });
    eq('sheet roof: empty pitch = flat', out(flat, 'area')?.value, 100);
    const badArea = state(st => { st.mode = 'roof'; st.roof.by = 'area'; st.roof.planArea = 'lots'; });
    eq('sheet roof: bad plan area', readMeasure(badArea).issues, ['Plan area: not a number.']);
}

// ----------------------------------------------------------------------------------------------------- volume
{
    const v = volumeResult(20, 10, 4 / 12, 'imperial');
    near('volume: 20×10×4" slab cu ft', v.cubic, 66.6667, 1e-3);
    near('volume: = 2.47 cu yd', v.cuYd as number, 2.469136, 1e-5);
    eq('volume: 27 cu ft = 1 cu yd', volumeResult(3, 3, 3, 'imperial').cuYd, 1);
    eq('volume: metric m³, no cu yd', volumeResult(5, 4, 0.1, 'metric'), { cubic: 2, cuYd: null });
    eq('volume: missing depth', volumeResult(5, 4, 0, 'imperial').cubic, 0);
    eq('volume: constant', CU_FT_PER_CU_YD, 27);
    const s = state(st => { st.mode = 'volume'; st.volume.length = L('20'); st.volume.width = L('10'); st.volume.depth = L('0', '4'); st.waste = '5'; });
    const f = measureFinal(s);
    eq('sheet volume: default = cubic yards', f.output?.unit, 'cu yd');
    eq('sheet volume: 2.47 + 5% → 2.6 cu yd (2 decimals)', [f.withWaste, f.quantity], [clean(2.469136 * 1.05, 6), 2.6]);
    s.pack = '0.25'; s.packName = 'load';
    const fp = measureFinal(s);
    eq('sheet volume: quarter-yard loads', [fp.packs, fp.quantity], [11, 2.75]);
    eq('sheet volume: work', fp.output?.work, "20' × 10' × 4\" ÷ 27");
}

// --------------------------------------------------------------------------------------- waste + pack rounding
eq('final: no waste, exact', finalQuantity(168, 0, null, 1), { base: 168, waste: 0, withWaste: 168, pack: null, packs: null, quantity: 168 });
eq('final: 10% waste rounded up to whole', finalQuantity(168, 10, null, 1).quantity, 185);
eq('final: 10% of 168 = 184.8', finalQuantity(168, 10, null, 1).withWaste, 184.8);
eq('final: 2 decimals step', finalQuantity(13.416408, 0, null, 0.01).quantity, 13.42);
eq('final: box of 20 sq ft', finalQuantity(168, 10, 20, 1), { base: 168, waste: 10, withWaste: 184.8, pack: 20, packs: 10, quantity: 200 });
eq('final: exact pack multiple stays', finalQuantity(200, 0, 20).packs, 10);
eq('final: float noise does not add a pack (3 × 0.1)', finalQuantity(0.3, 0, 0.1).packs, 3);
eq('final: one bundle = 1/3 square', finalQuantity(13.416408, 10, 1 / 3).packs, 45);
eq('final: waste capped at 100%', finalQuantity(10, 250, null, 1).withWaste, 20);
eq('final: negative waste = 0', finalQuantity(10, -5, null, 1).withWaste, 10);
eq('final: NaN waste = 0', finalQuantity(10, NaN, null, 1).withWaste, 10);
eq('final: zero / negative pack ignored', [finalQuantity(10, 0, 0, 1).packs, finalQuantity(10, 0, -5, 1).packs], [null, null]);
eq('final: zero base', finalQuantity(0, 10, 20), { base: 0, waste: 10, withWaste: 0, pack: 20, packs: 0, quantity: 0 });
eq('final: negative base', finalQuantity(-5, 10, null, 1).quantity, 0);
eq('round steps', [ROUND_STEP['sq ft'], ROUND_STEP.lf, ROUND_STEP.sq, ROUND_STEP['cu yd'], ROUND_STEP['m²']], [1, 1, 0.01, 0.01, 0.01]);
{
    const s = state(st => { st.room.length = L('12'); st.room.width = L('14'); st.waste = '10'; st.pack = '20'; });
    const f = measureFinal(s);
    eq('sheet final: fill as sq ft by default', [f.lineQuantity, f.lineUnit], [200, 'sq ft']);
    s.fillAs = 'pack';
    const fb = measureFinal(s);
    eq('sheet final: fill as boxes', [fb.lineQuantity, fb.lineUnit], [10, 'box']);
    s.pack = '';
    eq('sheet final: "boxes" without a pack size falls back to the unit', [measureFinal(s).lineQuantity, measureFinal(s).lineUnit], [185, 'sq ft']);
    s.waste = 'abc';
    eq('sheet final: junk waste = 0', measureFinal(s).lineQuantity, 168);
    const empty = blankMeasureState('imperial');
    eq('sheet final: nothing typed = 0', measureFinal(empty).lineQuantity, 0);
    eq('plural: box → boxes', pluralUnit('box', 10), 'boxes');
    eq('plural: bundle → bundles', pluralUnit('bundle', 2), 'bundles');
    eq('plural: one box', pluralUnit('box', 1), 'box');
    eq('plural: odd text untouched', pluralUnit('sq ft', 3), 'sq ft');
}

// -------------------------------------------------------------------------------------- description summary
{
    const s = state(st => { st.name = 'Kitchen'; st.room.length = L('12'); st.room.width = L('14'); st.waste = '10'; st.pack = '20'; });
    const summary = measurementSummary(s);
    eq('summary: with name, waste and boxes', summary, "Measured: Kitchen, floor 12' × 14' = 168 sq ft + 10% waste → 10 boxes of 20 sq ft");
    s.pack = '';
    eq('summary: rounded quantity', measurementSummary(s), "Measured: Kitchen, floor 12' × 14' = 168 sq ft + 10% waste → 185 sq ft");
    s.waste = ''; s.name = '';
    eq('summary: plain', measurementSummary(s), "Measured: floor 12' × 14' = 168 sq ft");
    eq('description: appended after a dot', withMeasurement('LVP flooring', 'Measured: floor = 168 sq ft'), 'LVP flooring · Measured: floor = 168 sq ft');
    eq('description: replaced, never repeated', withMeasurement('LVP flooring · Measured: floor = 100 sq ft', 'Measured: floor = 168 sq ft'), 'LVP flooring · Measured: floor = 168 sq ft');
    eq('description: empty description = summary', withMeasurement('', 'Measured: x'), 'Measured: x');
    eq('description: summary only, replaced', withMeasurement('Measured: old', 'Measured: new'), 'Measured: new');
    eq('description: no summary leaves the text', withMeasurement('Tile', ''), 'Tile');
    const long = state(st => { st.name = 'N'.repeat(60); st.mode = 'linear'; st.linear.segments = Array.from({ length: 20 }, () => ({ ...newSegment(), length: L('123', '4.5'), count: '7' })); });
    ok('summary: capped length', measurementSummary(long).length <= 220);
    eq('summary: nothing measured → ""', measurementSummary(blankMeasureState()), "Measured: floor 0' × 0' = 0 sq ft");
}

// --------------------------------------------------------------------------------------------------- unit hints
eq('hint: per square', unitFromText('Architectural shingles (per square)'), 'sq');
eq('hint: squares', unitFromText('Tear-off, 20 squares'), 'sq');
eq('hint: sq ft beats sq', unitFromText('Tile 120 sq ft'), 'sq ft');
eq('hint: sqft', unitFromText('LVP sqft'), 'sq ft');
eq('hint: square feet', unitFromText('Paint, per square foot'), 'sq ft');
eq('hint: lf', unitFromText('Baseboard (LF)'), 'lf');
eq('hint: linear feet', unitFromText('Gutter, linear feet'), 'lf');
eq('hint: cu yd', unitFromText('Concrete 4000 psi / cu yd'), 'cu yd');
eq('hint: cubic yards', unitFromText('Gravel, cubic yards'), 'cu yd');
eq('hint: m²', unitFromText('Carrelage (m²)'), 'm²');
eq('hint: m3', unitFromText('Béton m3'), 'm³');
eq('hint: line unit exact', unitFromText('cu ft'), 'cu ft');
eq('hint: none', unitFromText('Demo and haul-away'), null);
eq('hint: "square" alone is not a unit', unitFromText('Square trim kit'), null);
eq('hint: empty', unitFromText(''), null);
eq('suggest: squares → roof', suggestFromUnit('sq'), { mode: 'roof', pick: 'squares' });
eq('suggest: cu yd → volume', suggestFromUnit('cu yd'), { mode: 'volume', pick: 'volume' });
eq('suggest: lf → linear', suggestFromUnit('lf'), { mode: 'linear' });
eq('suggest: sq ft → none', suggestFromUnit('sq ft'), null);

// ---------------------------------------------------------------------------------------- unit system preference
eq('default units: en-US', defaultUnitSystem('en-US'), 'imperial');
eq('default units: en', defaultUnitSystem('en'), 'imperial');
eq('default units: en-CA', defaultUnitSystem('en-CA'), 'imperial');
eq('default units: en-GB', defaultUnitSystem('en-GB'), 'metric');
eq('default units: fr-FR', defaultUnitSystem('fr-FR'), 'metric');
eq('default units: es-419', defaultUnitSystem('es-419'), 'metric');
eq('default units: es-US', defaultUnitSystem('es_US'), 'imperial');
eq('default units: zh-Hans-CN', defaultUnitSystem('zh-Hans-CN'), 'metric');
eq('default units: de (no region)', defaultUnitSystem('de'), 'metric');
eq('default units: none', defaultUnitSystem(''), 'imperial');
eq('setting: parse object', parseUnitSystem({ system: 'metric', updatedAt: 'x' }), 'metric');
eq('setting: parse string', parseUnitSystem('imperial'), 'imperial');
eq('setting: junk', parseUnitSystem({ system: 'cubits' }), null);
{
    const s = state(st => {
        st.room.length = L('12', '6'); st.room.width = L('10'); st.room.openings = [newOpening('door', 'imperial')];
        st.roof.by = 'area'; st.roof.planArea = '1,000'; st.pack = '20'; st.name = 'Hall';
    });
    const m = convertMeasureState(s, 'metric');
    eq('toggle: system', m.system, 'metric');
    eq('toggle: lengths converted', [m.room.length, m.room.width], [L('3.81'), L('3.048')]);
    eq('toggle: door size converted', [m.room.openings[0].width, m.room.openings[0].height], [L('0.914'), L('2.032')]);
    eq('toggle: plan area sq ft → m²', m.roof.planArea, '92.9');
    eq('toggle: pack 20 sq ft → 1.858 m²', m.pack, '1.858');
    eq('toggle: name kept', m.name, 'Hall');
    near('toggle: floor area kept (m²)', out(m, 'floor')?.value as number, 12.5 * 10 * M_PER_FT ** 2, 1e-3);
    const back = convertMeasureState(m, 'imperial');
    eq('toggle back: lengths', [back.room.length, back.room.width], [L('12', '6'), L('10')]);
    eq('toggle: same system = same object', convertMeasureState(s, 'imperial') === s, true);
    const roof = state(st => { st.mode = 'roof'; st.pick.roof = 'squares'; st.roof.by = 'area'; st.roof.planArea = '1000'; st.pack = '0.3333'; });
    const rm = convertMeasureState(roof, 'metric');
    eq('toggle: squares → roof area in metric', pickedOutput(rm)?.key, 'area');
    eq('toggle: pack in squares → m²', rm.pack, '3.096');
}

// ------------------------------------------------------------------------------------- stored state + recent
{
    const junk = sanitizeMeasureState({ system: 'metric', mode: 'hack', name: 5, room: { length: { major: 12, minor: null }, openings: [{ kind: 'x', count: 2 }, 'bad'] }, area: { shapes: 'nope' }, pick: { room: 'walls', roof: '<script>' }, fillAs: 'pack', packName: '  bundle  ', extra: 1 });
    eq('sanitize: system kept', junk.system, 'metric');
    eq('sanitize: bad mode → room', junk.mode, 'room');
    eq('sanitize: name not text → ""', junk.name, '');
    eq('sanitize: numbers → text boxes', junk.room.length, L('12'));
    eq('sanitize: openings cleaned', junk.room.openings.map(o => [o.kind, o.count]), [['other', '2']]);
    eq('sanitize: missing shapes → one blank shape', junk.area.shapes.length, 1);
    eq('sanitize: picks filtered', junk.pick, { room: 'walls' });
    eq('sanitize: fill as + pack name', [junk.fillAs, junk.packName], ['pack', 'bundle']);
    ok('sanitize: extra keys dropped', !('extra' in junk));
    eq('sanitize: not an object', sanitizeMeasureState('x').mode, 'room');
    eq('sanitize: long text capped', sanitizeMeasureState({ room: { length: { major: '1'.repeat(100) } } }).room.length.major.length, 24);
    eq('sanitize: lists capped at 20', sanitizeMeasureState({ linear: { segments: Array.from({ length: 50 }, () => ({ length: { major: '1' } })) } }).linear.segments.length, 20);

    const store = new MemoryStorage();
    const UID = 'user-1';
    const JOB = 'job-1';
    eq('recent: key per user + job', recentMeasureKey(UID, JOB), 'cd.measure.recent:user-1:job-1');
    eq('recent: key without user / job', recentMeasureKey(null, undefined), 'cd.measure.recent:guest:no-job');
    eq('recent: empty list', readRecentMeasurements(store, UID, JOB), []);
    const kitchen = state(st => { st.name = 'Kitchen'; st.room.length = L('12'); st.room.width = L('14'); st.waste = '10'; });
    const now = new Date('2026-11-14T10:00:00Z');
    let list = rememberMeasurement(store, UID, JOB, kitchen, now);
    eq('recent: saved', list.map(r => [r.label, r.quantity, r.unit]), [['Kitchen · Floor', 185, 'sq ft']]);
    eq('recent: read back', readRecentMeasurements(store, UID, JOB).map(r => r.label), ['Kitchen · Floor']);
    eq('recent: other job is separate', readRecentMeasurements(store, UID, 'job-2'), []);
    eq('recent: other user is separate', readRecentMeasurements(store, 'user-2', JOB), []);
    list = rememberMeasurement(store, UID, JOB, { ...kitchen, room: { ...kitchen.room } }, now);
    eq('recent: same measurement only once', list.length, 1);
    const walls = { ...kitchen, pick: { room: 'walls' } };
    walls.room = { ...kitchen.room, height: L('8') };
    list = rememberMeasurement(store, UID, JOB, walls, now);
    eq('recent: newest first', list.map(r => r.label), ['Kitchen · Walls', 'Kitchen · Floor']);
    for (let i = 0; i < 12; i++) list = rememberMeasurement(store, UID, JOB, state(st => { st.mode = 'linear'; st.linear.segments = [{ ...newSegment(), length: L(String(i + 1)) }]; }), now);
    eq('recent: at most 8', list.length, RECENT_MAX);
    eq('recent: newest kept', list[0].quantity, 12);
    eq('recent: nothing measured is not saved', rememberMeasurement(store, UID, 'job-3', blankMeasureState(), now), []);
    store.full = true;
    const before = readRecentMeasurements(store, UID, JOB);
    eq('recent: storage full → list unchanged, no crash', rememberMeasurement(store, UID, JOB, kitchen, now).length, before.length);
    store.full = false;
    store.setItem(recentMeasureKey(UID, 'job-x'), '{broken json');
    eq('recent: broken storage → empty', readRecentMeasurements(store, UID, 'job-x'), []);
    store.setItem(recentMeasureKey(UID, 'job-y'), JSON.stringify([{ quantity: -1, state: {} }, { quantity: 5, unit: 'lf', state: { mode: 'linear' }, label: 'Ok', at: 'not a date' }, null, 'x']));
    const cleaned = readRecentMeasurements(store, UID, 'job-y');
    eq('recent: bad rows dropped', cleaned.map(r => [r.label, r.quantity, r.state.mode]), [['Ok', 5, 'linear']]);
    eq('recent: bad date → epoch', cleaned[0].at, new Date(0).toISOString());
    eq('when: today', recentWhen('2026-11-14T08:00:00', new Date('2026-11-14T18:00:00')), 'today');
    eq('when: yesterday', recentWhen('2026-11-13T08:00:00', new Date('2026-11-14T18:00:00')), 'yesterday');
    eq('when: days', recentWhen('2026-11-10T08:00:00', new Date('2026-11-14T18:00:00')), '4 days ago');
    eq('when: date', recentWhen('2026-10-01T08:00:00', new Date('2026-11-14T18:00:00')), 'Oct 1');
    eq('when: junk', recentWhen('nope'), '');
}

// ---------------------------------------------------------------------------- the line keeps its unit (forms)
{
    const saved = normalizeLineItem({ id: 'a', description: 'Tile', quantity: 185, rate: 4, unit: 'sq ft' }, undefined, false);
    eq('line: saved unit kept when the document is opened again', saved?.unit, 'sq ft');
    const ai = normalizeLineItem({ description: 'Tile', quantity: 2, rate: 4, unit: '  box\n' });
    eq('line: unit cleaned', ai?.unit, 'box');
    const none = normalizeLineItem({ id: 'b', description: 'Demo', quantity: 1, rate: 100 }, undefined, false);
    ok('line: no unit → no unit key (old documents unchanged)', none !== null && !('unit' in none));
    const blank = normalizeLineItem({ id: 'c', description: 'Demo', quantity: 1, rate: 100, unit: '   ' }, undefined, false);
    ok('line: blank unit dropped', blank !== null && !('unit' in blank));
    const long = normalizeLineItem({ id: 'd', description: 'X', quantity: 1, rate: 1, unit: 'u'.repeat(80) }, undefined, false);
    eq('line: unit capped', long?.unit?.length, 24);
}

console.log(`${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
