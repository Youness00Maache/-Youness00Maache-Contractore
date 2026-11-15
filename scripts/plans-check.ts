/**
 * Checks for plan measurement (roadmap N9): lib/plans/* — geometry (shoelace, concave shapes, cut-outs, degenerate
 * input), calibration parsing, unit and scale math, the measurement file (schema, versions, migration, caps, malformed
 * input, the PNG container), storage paths and listing, per-label totals with waste, CSV, price book matching, the
 * estimate line + seed, and the Quick measure hand-off. Plus wiring checks (job tab, App, help, pdf.js loading).
 *   npx tsx scripts/plans-check.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    COMMON_SCALES, M_PER_PT, SQ_FT_PER_M2, areaIn, areaM2, centroid, dist, distToSegment, isDegeneratePolygon, lengthIn, lengthM,
    nearestVertex, pointInPolygon, polygonArea, polygonPerimeter, polylineLength, presetScale, roundTo, scaleFromPoints, signedArea, toMetres,
    type Pt,
} from '../lib/plans/geometry.ts';
import { MAX_KNOWN_M, parseKnownLength, scaleLabel } from '../lib/plans/calibration.ts';
import {
    ITEMS_PER_PAGE_MAX, LABELS_MAX, LABEL_COLORS, MEASURE_MAX_BYTES, PLAN_MAX_PAGES, POINTS_PER_ITEM_MAX, blankMeasureDoc, hasContent, labelColor,
    newItem, newLabel, readMeasureDoc, sanitizeMeasureDoc, serializeMeasureDoc, stampForSave, utf8Length, type MeasureDoc,
} from '../lib/plans/schema.ts';
import {
    buildEstimateLine, defaultWaste, estimateSeed, itemMeasure, kindsOf, labelTotals, mainKind, matchPriceItems, nameSimilarity, quantityFor,
    quickMeasureState, totalsCsv, unitFor, unitKind, wasteOf,
} from '../lib/plans/totals.ts';
import {
    PLAN_LIMITS, measurePathFor, parsePlanListing, planFolder, planKindOf, planMimeFor, planStoragePath, planTitle, validatePlanFile,
} from '../lib/plans/planFiles.ts';
import { KEYWORD, decodeTextPng, encodeTextPng, readStoredText } from '../lib/plans/pngText.ts';
import { M_PER_FT, measureFinal, readMeasure, rememberMeasurement, readRecentMeasurements, sanitizeMeasureState } from '../lib/measure.ts';
import type { KeyValueStore } from '../lib/userDataSync.ts';
import type { SavedItem } from '../types.ts';
import { HELP_GUIDES } from '../components/help/helpContent.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);
const near = (label: string, actual: number, expected: number, tol = 1e-6) => {
    if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) passes++;
    else { failures++; console.error(`FAIL ${label}\n  expected ≈${expected}\n  actual   ${actual}`); }
};

// ================================================================================================= geometry
{
    const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    near('square area', polygonArea(sq), 100);
    near('square area (clockwise same)', polygonArea([...sq].reverse()), 100);
    ok('signed area flips with direction', signedArea(sq) === -signedArea([...sq].reverse()) && signedArea(sq) !== 0);
    near('square perimeter', polygonPerimeter(sq), 40);
    near('triangle 3-4-5 area', polygonArea([[0, 0], [4, 0], [0, 3]]), 6);
    near('triangle perimeter', polygonPerimeter([[0, 0], [4, 0], [0, 3]]), 12);
    // L shape (concave): 10x10 minus 5x5 corner = 75
    const L: Pt[] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
    near('L-shape (concave) area', polygonArea(L), 75);
    near('L-shape perimeter', polygonPerimeter(L), 40);
    // U shape (concave)
    const U: Pt[] = [[0, 0], [9, 0], [9, 9], [6, 9], [6, 3], [3, 3], [3, 9], [0, 9]];
    near('U-shape area', polygonArea(U), 81 - 18);
    // concave arrow: triangle (0,0)(4,2)(0,4) = 8 minus the notch (0,0)(1,2)(0,4) = 2
    near('concave arrow area', polygonArea([[0, 0], [4, 2], [0, 4], [1, 2]]), 6);
    near('polyline length', polylineLength([[0, 0], [3, 4], [3, 10]]), 11);
    near('polyline 1 point = 0', polylineLength([[1, 1]]), 0);
    near('polyline empty = 0', polylineLength([]), 0);
    near('polyline null = 0', polylineLength(null), 0);
    near('polygon < 3 points = 0 area', polygonArea([[0, 0], [5, 5]]), 0);
    near('2-point perimeter = there and back', polygonPerimeter([[0, 0], [3, 4]]), 10);
    near('collinear points: 0 area', polygonArea([[0, 0], [1, 1], [2, 2], [3, 3]]), 0);
    ok('collinear is degenerate', isDegeneratePolygon([[0, 0], [1, 1], [2, 2]]));
    ok('repeated points are degenerate', isDegeneratePolygon([[0, 0], [0, 0], [5, 5], [5, 5]]));
    ok('square is not degenerate', !isDegeneratePolygon(sq));
    near('junk points skipped', polylineLength([[0, 0], [NaN, 1] as Pt, ['a', 2] as unknown as Pt, [0, 5]]), 5);
    near('tiny polygon area', polygonArea([[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]]), 1e-6, 1e-12);
    eq('centroid of square', centroid(sq), [5, 5]);
    eq('centroid empty', centroid([]), [0, 0]);
    near('dist', dist([0, 0], [6, 8]), 10);
    near('dist to segment (middle)', distToSegment([5, 3], [0, 0], [10, 0]), 3);
    near('dist to segment (past end)', distToSegment([13, 4], [0, 0], [10, 0]), 5);
    near('dist to zero segment', distToSegment([3, 4], [0, 0], [0, 0]), 5);
    ok('point in L', pointInPolygon([2, 8], L));
    ok('point in L notch is outside', !pointInPolygon([8, 8], L));
    eq('nearest vertex within radius', nearestVertex(sq, [9.5, 9.6], 1), 2);
    eq('nearest vertex none', nearestVertex(sq, [5, 5], 1), -1);
}

// ================================================================================================= units + scale
{
    near('lengthM', lengthM(100, 0.01), 1);
    near('lengthM no scale = 0', lengthM(100, null), 0);
    near('lengthM negative scale = 0', lengthM(100, -1), 0);
    near('areaM2', areaM2(10000, 0.01), 1);
    near('ft from m', lengthIn(M_PER_FT * 12, 'imperial'), 12, 1e-9);
    near('m stays m', lengthIn(3.8, 'metric'), 3.8);
    near('sq ft from m²', areaIn(1, 'imperial'), 10.763910416709722, 1e-9);
    near('SQ_FT_PER_M2', SQ_FT_PER_M2, 10.7639104167, 1e-6);
    near('toMetres imperial', toMetres(10, 'imperial'), 3.048, 1e-12);
    near('toMetres metric', toMetres(10, 'metric'), 10);
    eq('roundTo 0.01', roundTo(1.005 + 1e-9, 0.01), 1.01);
    eq('roundTo 1', roundTo(12.5, 1), 13);
    eq('roundTo -0', roundTo(-0.001, 0.01), 0);
    eq('roundTo NaN', roundTo(NaN), 0);
    // calibration: 200 units = 10 ft
    const k = scaleFromPoints([0, 0], [200, 0], 10 * M_PER_FT)!;
    near('calibration scale', k, (10 * M_PER_FT) / 200, 1e-12);
    near('calibrated 100 units = 5 ft', lengthIn(lengthM(100, k), 'imperial'), 5, 1e-9);
    near('calibrated 100x100 units = 25 sq ft', areaIn(areaM2(10000, k), 'imperial'), 25, 1e-9);
    eq('calibration: points too close', scaleFromPoints([0, 0], [1, 1], 3), null);
    eq('calibration: zero length', scaleFromPoints([0, 0], [100, 0], 0), null);
    eq('calibration: negative length', scaleFromPoints([0, 0], [100, 0], -2), null);
    eq('calibration: bad point', scaleFromPoints([NaN, 0] as Pt, [100, 0], 2), null);
    // preset: 1/4" = 1' → 1 inch on paper (72 pt) = 4 ft
    const q = presetScale(48)!;
    near('preset 1/4"=1\': 72 pt = 4 ft', lengthIn(lengthM(72, q), 'imperial'), 4, 1e-9);
    near('preset 1:100: 72 pt = 2.54 m', lengthM(72, presetScale(100)!), 2.54, 1e-9);
    eq('preset bad', presetScale(0), null);
    near('M_PER_PT', M_PER_PT * 72, 0.0254, 1e-15);
    ok('common scales: imperial + metric', COMMON_SCALES.some(c => c.system === 'imperial' && c.ratio === 48) && COMMON_SCALES.some(c => c.system === 'metric' && c.ratio === 50));
    eq('scale labels unique', new Set(COMMON_SCALES.map(c => c.id)).size, COMMON_SCALES.length);
}

// ================================================================================================= calibration text
{
    const ft = (s: string, sys: 'imperial' | 'metric' = 'imperial') => { const m = parseKnownLength(s, sys); return m === null ? null : Math.round((m / M_PER_FT) * 1e6) / 1e6; };
    const m = (s: string, sys: 'imperial' | 'metric' = 'metric') => { const v = parseKnownLength(s, sys); return v === null ? null : Math.round(v * 1e6) / 1e6; };
    eq('12\'6"', ft('12\'6"'), 12.5);
    eq('12\' 6"', ft('12\' 6"'), 12.5);
    eq('12 ft 6 in', ft('12 ft 6 in'), 12.5);
    eq('12.5 ft', ft('12.5 ft'), 12.5);
    eq('12.5\'', ft('12.5\''), 12.5);
    eq('12\' 6 1/2"', ft('12\' 6 1/2"'), Math.round((12 + 6.5 / 12) * 1e6) / 1e6);
    eq('150 in', ft('150 in'), 12.5);
    eq('6" only', ft('6"'), 0.5);
    eq('curly quotes 12′6″', ft('12′6″'), 12.5);
    eq('bare number imperial = feet', ft('20'), 20);
    eq('3.8 m', m('3.8 m'), 3.8);
    eq('3.8 m on an imperial account', m('3.8 m', 'imperial'), 3.8);
    eq('3800 mm', m('3800 mm'), 3.8);
    eq('380 cm', m('380 cm'), 3.8);
    eq('3,8 m (decimal comma)', m('3,8 m'), 3.8);
    eq('bare number metric = metres', m('4.2'), 4.2);
    eq('12 ft on a metric account', ft('12 ft', 'metric'), 12);
    eq('empty', parseKnownLength('', 'imperial'), null);
    eq('junk', parseKnownLength('abc', 'imperial'), null);
    eq('zero', parseKnownLength('0', 'imperial'), null);
    eq('negative', parseKnownLength('-3 m', 'metric'), null);
    eq('absurd', parseKnownLength(`${MAX_KNOWN_M + 1} m`, 'metric'), null);
    eq('too long text', parseKnownLength('1'.repeat(50), 'metric'), null);
    eq('number input', parseKnownLength(10, 'imperial'), 10 * M_PER_FT);
    eq('null', parseKnownLength(null, 'imperial'), null);
    eq('label: none', scaleLabel(null, 'pdf', 'imperial'), 'No scale');
    eq('label: preset', scaleLabel({ mPerU: presetScale(48)!, how: 'preset', ref: 48 }, 'pdf', 'imperial'), '1/4" = 1\'');
    eq('label: preset 1:50', scaleLabel({ mPerU: presetScale(50)!, how: 'preset', ref: 50 }, 'pdf', 'metric'), '1:50');
    eq('label: calibrated near a common scale', scaleLabel({ mPerU: presetScale(48.5)!, how: 'calibrated', ref: 3 }, 'pdf', 'imperial'), '≈ 1/4" = 1\'');
    eq('label: calibrated ratio', scaleLabel({ mPerU: presetScale(73.2)!, how: 'calibrated', ref: 3 }, 'pdf', 'metric'), '≈ 1:73');
    eq('label: image calibrated', scaleLabel({ mPerU: 0.01, how: 'calibrated', ref: 12.5 * M_PER_FT }, 'image', 'imperial'), 'Set from 12\' 6"');
    eq('label: image metric', scaleLabel({ mPerU: 0.01, how: 'calibrated', ref: 3.8 }, 'image', 'metric'), 'Set from 3.8 m');
}

// ================================================================================================= schema
const docWith = (): MeasureDoc => {
    const d = blankMeasureDoc('pdf', 3);
    const drywall = { ...newLabel('Drywall', 0), id: 'ldry' };
    const base = { ...newLabel('Baseboard', 1), id: 'lbase' };
    const outlets = { ...newLabel('Outlets', 2), id: 'lout' };
    d.labels = [drywall, base, outlets];
    // scale: 1 unit = 0.1 ft
    const k = 0.1 * M_PER_FT;
    d.pages = {
        1: {
            scale: { mPerU: k, how: 'calibrated', ref: 10 * M_PER_FT },
            items: [
                { ...newItem('area', 'ldry', [[0, 0], [200, 0], [200, 100], [0, 100]]), id: 'a1' }, // 20 x 10 ft = 200 sq ft
                { ...newItem('area', 'ldry', [[10, 10], [40, 10], [40, 40], [10, 40]], true), id: 'a2' }, // cut-out 3 x 3 = 9
                { ...newItem('line', 'lbase', [[0, 0], [200, 0], [200, 100]]), id: 'l1' }, // 30 ft
                { ...newItem('count', 'lout', [[5, 5], [6, 6], [7, 7]]), id: 'c1' },
            ],
        },
        2: {
            items: [
                { ...newItem('line', 'lbase', [[0, 0], [100, 0]]), id: 'l2' }, // no scale → skipped
                { ...newItem('count', 'lout', [[1, 1]]), id: 'c2' }, // counts need no scale
            ],
        },
    };
    return d;
};
{
    const blank = blankMeasureDoc('image');
    eq('blank doc', [blank.v, blank.version, blank.kind, blank.pageCount, blank.labels.length, Object.keys(blank.pages).length], [1, 0, 'image', 1, 0, 0]);
    ok('blank has no content', !hasContent(blank));
    ok('doc has content', hasContent(docWith()));
    eq('label colours cycle', [labelColor(0), labelColor(LABEL_COLORS.length), labelColor(-1)], [LABEL_COLORS[0], LABEL_COLORS[0], LABEL_COLORS[LABEL_COLORS.length - 1]]);
    eq('new label defaults', [newLabel('  ', 4).name, newLabel('Drywall', 0, 12).waste, 'waste' in newLabel('X', 0)], ['Label 5', 12, false]);
    eq('subtract only on areas', ['subtract' in newItem('line', 'x', [[0, 0], [1, 1]], true), newItem('area', 'x', [[0, 0], [1, 0], [1, 1]], true).subtract], [false, true]);

    // round trip
    const d = docWith();
    const text = serializeMeasureDoc(d);
    const back = readMeasureDoc(text);
    eq('round trip: no problem', [back.problem, back.readOnly], [null, false]);
    eq('round trip: same labels', back.doc.labels.map(l => l.name), ['Drywall', 'Baseboard', 'Outlets']);
    eq('round trip: items', back.doc.pages['1'].items.map(i => i.id), ['a1', 'a2', 'l1', 'c1']);
    eq('round trip: cut-out kept', back.doc.pages['1'].items[1].subtract, true);
    eq('round trip: page without scale', back.doc.pages['2'].scale, undefined);

    // malformed
    eq('bad JSON → blank + problem', [readMeasureDoc('{oops').doc.labels.length, !!readMeasureDoc('{oops').problem], [0, true]);
    eq('array → blank + problem', !!readMeasureDoc('[1,2]').problem, true);
    eq('null → blank, no problem', [readMeasureDoc(null).problem, readMeasureDoc(null).readOnly], [null, false]);
    eq('number → problem', !!readMeasureDoc(42).problem, true);
    eq('huge text refused', !!readMeasureDoc('x'.repeat(MEASURE_MAX_BYTES * 2 + 1)).problem, true);
    eq('v as string → problem', !!readMeasureDoc({ v: 'one' }).problem, true);
    // newer version
    const newer = readMeasureDoc(JSON.stringify({ ...d, v: 2, future: true }));
    eq('newer version: read-only, still shown', [newer.readOnly, !!newer.problem, newer.doc.labels.length], [true, true, 3]);
    eq('newer version: unknown keys dropped', 'future' in newer.doc, false);
    // v0 (first draft shape) migration
    const v0 = readMeasureDoc({ labels: [{ id: 'l1', name: 'Paint', color: '#123456' }], scale: { mPerU: 0.01, how: 'calibrated', ref: 2 }, items: [{ id: 'x', tool: 'line', label: 'l1', pts: [[0, 0], [10, 0]] }] });
    eq('v0 migrated to page 1', [v0.doc.v, v0.problem, v0.doc.pages['1'].items.length, v0.doc.pages['1'].scale?.mPerU], [1, null, 1, 0.01]);
    // sanitizing
    const dirty = sanitizeMeasureDoc({
        v: 1, version: -5, kind: 'weird', pageCount: 99, updatedAt: 'nope',
        labels: [
            { id: 'a', name: 'A\u0000B   C', color: 'red', hidden: 'yes', waste: 250 },
            { id: 'a', name: 'dup id' },
            { id: 'bad id!', name: '' },
            'junk',
        ],
        pages: {
            1: { items: [
                { id: 'i1', tool: 'line', label: 'a', pts: [[0, 0], [1e9, 0], [5, 5]] },
                { id: 'i2', tool: 'area', label: 'a', pts: [[0, 0], [1, 0]] },
                { id: 'i3', tool: 'poly', label: 'a', pts: [[0, 0], [1, 0], [1, 1]] },
                { id: 'i4', tool: 'count', label: 'missing', pts: [[0, 0]] },
                { id: 'i5', tool: 'count', label: 'a', pts: [[1.23456, 7.891011]] },
                { id: 'i6', tool: 'line', label: 'a', subtract: true, pts: [[0, 0], [3, 3]] },
            ] },
            0: { items: [] }, 11: { items: [] }, '01': { items: [] }, x: {},
            3: { scale: { mPerU: -1 }, items: [] },
            4: { scale: { mPerU: 0.5, how: 'weird', ref: 'x' }, items: [] },
        },
    });
    eq('sanitize: version, kind, page count, time', [dirty.version, dirty.kind, dirty.pageCount, dirty.updatedAt], [0, 'pdf', PLAN_MAX_PAGES, new Date(0).toISOString()]);
    eq('sanitize: label name cleaned, colour fallback, hidden only true, waste capped', [dirty.labels[0].name, dirty.labels[0].color, dirty.labels[0].hidden, dirty.labels[0].waste], ['A B C', LABEL_COLORS[0], undefined, 100]);
    eq('sanitize: duplicate / bad ids replaced, junk dropped', [dirty.labels.length, new Set(dirty.labels.map(l => l.id)).size, dirty.labels[2].name], [3, 3, 'Label 3']);
    eq('sanitize: pages kept', Object.keys(dirty.pages).sort(), ['1', '4']);
    eq('sanitize: items kept', dirty.pages['1'].items.map(i => i.id), ['i1', 'i5', 'i6']);
    eq('sanitize: out-of-range point dropped', dirty.pages['1'].items[0].pts, [[0, 0], [5, 5]]);
    eq('sanitize: points rounded', dirty.pages['1'].items[1].pts, [[1.23, 7.89]]);
    eq('sanitize: subtract only for areas', 'subtract' in dirty.pages['1'].items[2], false);
    eq('sanitize: odd scale normalized', dirty.pages['4'].scale, { mPerU: 0.5, how: 'calibrated', ref: 0 });
    // caps
    const many = sanitizeMeasureDoc({
        labels: Array.from({ length: LABELS_MAX + 10 }, (_, i) => ({ id: `l${i}`, name: `L${i}` })),
        pages: { 1: { items: Array.from({ length: ITEMS_PER_PAGE_MAX + 50 }, (_, i) => ({ id: `i${i}`, tool: 'count', label: 'l0', pts: Array.from({ length: POINTS_PER_ITEM_MAX + 20 }, () => [1, 1]) })) } },
    });
    eq('caps: labels / items / points', [many.labels.length, many.pages['1'].items.length, many.pages['1'].items[0].pts.length], [LABELS_MAX, ITEMS_PER_PAGE_MAX, POINTS_PER_ITEM_MAX]);
    let threw = '';
    try { serializeMeasureDoc(many); } catch (e) { threw = (e as Error).message; }
    ok('caps: too big to save throws a readable error', /Too many measurements/.test(threw));
    eq('utf8 length', [utf8Length('abc'), utf8Length('é'), utf8Length('€'), utf8Length('😀')], [3, 2, 3, 4]);
    // last write wins
    const s1 = stampForSave({ ...d, version: 3 }, { version: 7 }, new Date('2026-11-15T10:00:00Z'));
    eq('stamp: version above both, time now', [s1.version, s1.updatedAt], [8, '2026-11-15T10:00:00.000Z']);
    eq('stamp: no remote', stampForSave({ ...d, version: 3 }, null, new Date(0)).version, 4);
}

// ================================================================================================= PNG container
{
    const json = JSON.stringify({ hello: 'wörld €', n: 1 });
    const png = encodeTextPng(json);
    eq('png signature', Array.from(png.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    ok('png has IHDR first', String.fromCharCode(...png.slice(12, 16)) === 'IHDR');
    ok('png ends with IEND', String.fromCharCode(...png.slice(png.length - 8, png.length - 4)) === 'IEND');
    ok('png carries the keyword', Buffer.from(png).includes(Buffer.from(KEYWORD)));
    eq('png round trip (UTF-8)', decodeTextPng(png), json);
    eq('readStoredText png', readStoredText(png), json);
    eq('readStoredText json bytes', readStoredText(new TextEncoder().encode(' {"a":1}')), ' {"a":1}');
    eq('readStoredText BOM json', readStoredText(new TextEncoder().encode('﻿{"a":1}')), '{"a":1}');
    eq('readStoredText junk', readStoredText(new TextEncoder().encode('hello')), null);
    eq('readStoredText empty', readStoredText(new Uint8Array(0)), null);
    const broken = png.slice();
    broken[60] ^= 0xff; // inside the iTXt data → CRC mismatch
    eq('png: bad CRC → null', decodeTextPng(broken), null);
    eq('png: truncated → null', decodeTextPng(png.slice(0, 40)), null);
    eq('png: not a png → null', decodeTextPng(new Uint8Array(30)), null);
    // the CRC of IEND is the well known AE426082
    eq('png: IEND crc', Array.from(png.slice(png.length - 4)), [0xae, 0x42, 0x60, 0x82]);
    // whole doc round trip through the container
    const doc = docWith();
    const res = readMeasureDoc(readStoredText(encodeTextPng(serializeMeasureDoc(doc))));
    eq('doc through png', [res.problem, res.doc.pages['1'].items.length], [null, 4]);
}

// ================================================================================================= files + paths
{
    eq('mime pdf', planMimeFor('a.PDF', ''), 'application/pdf');
    eq('mime jpg', planMimeFor('a.jpeg', ''), 'image/jpeg');
    eq('mime image/jpg type', planMimeFor('x', 'image/jpg'), 'image/jpeg');
    eq('mime webp', planMimeFor('x.webp', 'image/webp'), 'image/webp');
    eq('mime gif refused', planMimeFor('x.gif', 'image/gif'), null);
    eq('mime dwg refused', planMimeFor('x.dwg', ''), null);
    eq('kind', [planKindOf('application/pdf'), planKindOf('image/png')], ['pdf', 'image']);
    eq('validate ok', validatePlanFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }), null);
    ok('validate empty', /empty/.test(validatePlanFile({ name: 'a.pdf', size: 0 }) || ''));
    ok('validate type', /PDFs or images/.test(validatePlanFile({ name: 'a.dwg', size: 10 }) || ''));
    ok('validate size', /up to 15 MB/.test(validatePlanFile({ name: 'a.pdf', size: PLAN_LIMITS.maxBytes + 1 }) || ''));
    eq('validate at the limit', validatePlanFile({ name: 'a.pdf', size: PLAN_LIMITS.maxBytes }), null);
    eq('limits', [PLAN_LIMITS.maxBytes, PLAN_LIMITS.maxPages], [15728640, 10]);
    eq('folder', planFolder('user-1', 'job-2'), 'user-1/plans/job-2');
    eq('folder strips odd chars', planFolder('u/../x', 'j?2'), 'ux/plans/j2');
    const p = planStoragePath('u1', 'j1', 'Floor plan L1 (rev B).PDF', 'application/pdf', 'ABCDEF123456');
    eq('storage path', p, 'u1/plans/j1/abcdef123456-Floor-plan-L1-rev-B.pdf');
    eq('storage path: extension follows the type', planStoragePath('u1', 'j1', 'photo.jpeg', 'image/jpeg', 'abcdefgh'), 'u1/plans/j1/abcdefgh-photo.jpg');
    eq('storage path: short random padded', planStoragePath('u1', 'j1', 'x.png', 'image/png', 'ab'), 'u1/plans/j1/ab000000-x.png');
    eq('storage path: a ".measure" name is not confusing', planStoragePath('u1', 'j1', 'a.measure.pdf', 'application/pdf', 'abcdefgh'), 'u1/plans/j1/abcdefgh-a.pdf');
    ok('storage path: owner folder first', p.split('/')[0] === 'u1');
    eq('measure path', measurePathFor(p), 'u1/plans/j1/abcdef123456-Floor-plan-L1-rev-B.measure.png');
    eq('title', planTitle('abcdef123456-Floor-plan-L1-rev-B.pdf'), 'Floor plan L1 rev B');
    eq('title of an odd name', planTitle('notes.pdf'), 'notes');
    const listed = parsePlanListing('u1/plans/j1', [
        { name: 'aaaaaaaa-Old.pdf', created_at: '2026-11-01T00:00:00Z', metadata: { size: 100 } },
        { name: 'bbbbbbbb-New-photo.jpg', created_at: '2026-11-10T00:00:00Z', metadata: { size: 200 } },
        { name: 'aaaaaaaa-Old.measure.png', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' },
        { name: 'cccccccc-Stray.measure.png' },
        { name: 'dddddddd-Json.pdf', created_at: '2026-11-03T00:00:00Z' },
        { name: 'dddddddd-Json.measure.json', created_at: '2026-11-04T00:00:00Z' },
        { name: '.emptyFolderPlaceholder' },
        { name: 'random.txt' },
    ]);
    eq('listing: plans only, newest first', listed.map(x => x.title), ['New photo', 'Json', 'Old']);
    eq('listing: measurement files paired', listed.map(x => x.measurePath), [null, 'u1/plans/j1/dddddddd-Json.measure.json', 'u1/plans/j1/aaaaaaaa-Old.measure.png']);
    eq('listing: measured time', listed[2].measuredAt, '2026-11-05T00:00:00Z');
    eq('listing: kinds + sizes', listed.map(x => [x.kind, x.size]), [['image', 200], ['pdf', null], ['pdf', 100]]);
    eq('listing: junk input', parsePlanListing('f', null), []);
    const both = parsePlanListing('f', [{ name: 'eeeeeeee-X.pdf' }, { name: 'eeeeeeee-X.measure.json' }, { name: 'eeeeeeee-X.measure.png' }]);
    eq('listing: png wins over json', both[0].measurePath, 'f/eeeeeeee-X.measure.png');
}

// ================================================================================================= totals
{
    const d = docWith();
    const t = labelTotals(d, 'imperial');
    const by = (name: string) => t.find(r => r.label.name === name)!;
    near('drywall gross area', by('Drywall').areaAdded, 200, 1e-6);
    near('drywall cut-out', by('Drywall').areaRemoved, 9, 1e-6);
    near('drywall net area', by('Drywall').area, 191, 1e-6);
    near('drywall perimeter (cut-out not added)', by('Drywall').perimeter, 60, 1e-6);
    near('baseboard length (page 2 has no scale)', by('Baseboard').length, 30, 1e-6);
    eq('baseboard unscaled skipped', by('Baseboard').unscaled, 1);
    eq('outlets count across pages', by('Outlets').count, 4);
    eq('page filter', labelTotals(d, 'imperial', [2]).find(r => r.label.name === 'Outlets')!.count, 1);
    const metric = labelTotals(d, 'metric');
    near('metric net area', metric.find(r => r.label.name === 'Drywall')!.area, 191 / SQ_FT_PER_M2, 1e-6);
    near('metric length', metric.find(r => r.label.name === 'Baseboard')!.length, 30 * M_PER_FT, 1e-9);
    // a cut-out bigger than the area → never below 0
    const over = blankMeasureDoc();
    over.labels = [{ id: 'z', name: 'Z', color: '#000000' }];
    over.pages = { 1: { scale: { mPerU: 1, how: 'calibrated', ref: 1 }, items: [newItem('area', 'z', [[0, 0], [1, 0], [1, 1]], true)] } };
    eq('net area never negative', labelTotals(over, 'metric')[0].area, 0);
    eq('items of a deleted label ignored', labelTotals({ ...d, labels: d.labels.slice(0, 1) }, 'imperial').length, 1);
    eq('item measure: line without scale = null', itemMeasure(newItem('line', 'x', [[0, 0], [1, 1]]), null, 'imperial'), null);
    eq('item measure: count without scale', itemMeasure(newItem('count', 'x', [[0, 0], [1, 1]]), null, 'imperial')!.count, 2);
    eq('main kind', [mainKind(by('Drywall')), mainKind(by('Baseboard')), mainKind(by('Outlets')), mainKind({ area: 0, areaAdded: 0, length: 0, count: 0 })], ['area', 'length', 'count', null]);
    eq('kinds of', kindsOf({ areaAdded: 1, length: 2, count: 0 }), ['area', 'length']);
    // waste
    eq('default waste', [defaultWaste('area'), defaultWaste('length'), defaultWaste('count')], [10, 10, 0]);
    eq('label waste wins', [wasteOf({ waste: 15 }, 'area'), wasteOf({ waste: null }, 'area'), wasteOf({}, 'count'), wasteOf({ waste: 200 }, 'area')], [15, 10, 0, 100]);
    eq('units', [unitFor('area', 'imperial'), unitFor('length', 'imperial'), unitFor('count', 'imperial'), unitFor('area', 'metric'), unitFor('length', 'metric')], ['sq ft', 'lf', 'each', 'm²', 'm']);
    const qa = quantityFor(by('Drywall'), 'area', 10, 'imperial');
    eq('area + 10% rounded up to whole sq ft', [qa.base, qa.withWaste, qa.quantity, qa.unit], [191, 210.1, 211, 'sq ft']);
    const ql = quantityFor(by('Baseboard'), 'length', 10, 'imperial');
    eq('length + 10%', [ql.quantity, ql.unit], [33, 'lf']);
    const qc = quantityFor(by('Outlets'), 'count', 0, 'imperial');
    eq('count, no waste', [qc.quantity, qc.unit], [4, 'each']);
    const qc5 = quantityFor({ area: 0, length: 0, count: 7 }, 'count', 10, 'imperial');
    eq('count with waste rounds up to whole', qc5.quantity, 8);
    const qm = quantityFor({ area: 17.7444, length: 0, count: 0 }, 'area', 10, 'metric');
    eq('metric area rounded up to 0.01', [qm.quantity, qm.unit], [19.52, 'm²']);
    // CSV
    const csv = totalsCsv(t, 'imperial');
    const lines = csv.trim().split('\r\n');
    eq('csv header', lines[0], 'Label,Measure,Measured,Unit,Waste %,Total with waste,Perimeter,Cut-outs');
    eq('csv rows', lines.slice(1), [
        'Drywall,Area,191,sq ft,10,211,60 lf,9',
        'Baseboard,Length,30,lf,10,33,,',
        'Outlets,Count,4,each,0,4,,',
    ]);
    const tricky = totalsCsv([{ ...by('Outlets'), label: { ...by('Outlets').label, name: '=SUM(A1), "x"' } }], 'imperial');
    ok('csv escapes formulas and quotes', tricky.includes('"\'=SUM(A1), ""x"""'));
}

// ================================================================================================= price book + estimate
{
    const item = (id: string, name: string, rate: number, unit?: string, extra: Partial<SavedItem> = {}): SavedItem => ({ id, user_id: 'u', name, rate, unit, ...extra });
    const book = [
        item('1', 'Drywall 1/2" sheet', 14, 'sheet'),
        item('2', 'Drywall install', 2.1, 'sq ft', { unit_cost: 1.2 }),
        item('3', 'Baseboards MDF', 3.5, 'lf'),
        item('4', 'Electrical outlet', 85, 'each'),
        item('5', 'Paint walls', 1.5, 'sq ft'),
        item('6', 'Roofing shingles', 120, 'sq'),
    ];
    eq('similarity exact', nameSimilarity('Drywall', 'drywall'), 1);
    ok('similarity plural', nameSimilarity('Outlets', 'Electrical outlet') >= 0.5);
    eq('similarity nothing shared', nameSimilarity('Tile', 'Paint walls'), 0);
    eq('similarity empty', nameSimilarity('', 'x'), 0);
    ok('similarity prefix', nameSimilarity('Baseboard', 'Baseboards MDF') >= 0.4);
    eq('unit kinds', [unitKind('sq ft'), unitKind('SF'), unitKind('m²'), unitKind('LF'), unitKind('m'), unitKind('ea'), unitKind('sheet'), unitKind('')], ['area', 'area', 'area', 'length', 'length', 'count', null, null]);
    const dry = matchPriceItems('Drywall', book, 'area');
    eq('drywall: install (sq ft) ranks above the sheet', dry.map(m => m.item.id).slice(0, 2), ['2', '1']);
    eq('baseboard matches', matchPriceItems('Baseboard', book, 'length')[0]?.item.id, '3');
    eq('outlets match', matchPriceItems('Outlets', book, 'count')[0]?.item.id, '4');
    eq('no match', matchPriceItems('Concrete', book, 'area'), []);
    eq('max results', matchPriceItems('Drywall', book, null, 1).length, 1);
    eq('empty book', matchPriceItems('Drywall', [], 'area'), []);

    const q = { kind: 'area' as const, base: 191, waste: 10, withWaste: 210.1, quantity: 211, unit: 'sq ft' };
    const withItem = buildEstimateLine('Drywall', q, book[1], 'line-1');
    eq('line with price book item', withItem.line, { id: 'line-1', description: 'Drywall', quantity: 211, rate: 2.1, unit: 'sq ft', unitCost: 1.2, itemSource: 'pricebook' });
    eq('no unit warning when units fit', withItem.unitWarning, null);
    const sheet = buildEstimateLine('Drywall', q, book[0], 'line-2');
    ok('unit warning when the item is priced per sheet', /per sheet/.test(sheet.unitWarning || ''));
    eq('line without item', buildEstimateLine('Drywall', q, null, 'line-3').line, { id: 'line-3', description: 'Drywall', quantity: 211, rate: 0, unit: 'sq ft' });
    eq('empty label name', buildEstimateLine('', q, null, 'x').line.description, 'Measured from plans');
    ok('line ids are generated', buildEstimateLine('A', q).line.id.length > 6);
    const seed = estimateSeed([withItem.line], 'Kitchen plans');
    eq('seed', seed, { title: 'Kitchen plans', lineItems: [withItem.line] });
    ok('seed copies lines', (seed.lineItems as unknown[])[0] !== withItem.line);
    eq('seed without title', Object.keys(estimateSeed([withItem.line])), ['lineItems']);
}

// ================================================================================================= Quick measure hand-off
{
    const store = (): KeyValueStore => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } }; };
    const qa = { kind: 'area' as const, base: 191, waste: 10, withWaste: 210.1, quantity: 211, unit: 'sq ft' };
    const s = quickMeasureState('Drywall', qa, 'imperial')!;
    const f = measureFinal(sanitizeMeasureState(s), readMeasure(sanitizeMeasureState(s)));
    eq('area hand-off gives the same quantity in Quick measure', [s.mode, s.name, f.lineQuantity, f.lineUnit], ['area', 'Drywall (plans)', 211, 'sq ft']);
    const ql = { kind: 'length' as const, base: 30, waste: 10, withWaste: 33, quantity: 33, unit: 'lf' };
    const sl = quickMeasureState('Baseboard', ql, 'imperial')!;
    const fl = measureFinal(sanitizeMeasureState(sl), readMeasure(sanitizeMeasureState(sl)));
    eq('length hand-off', [sl.mode, fl.lineQuantity, fl.lineUnit], ['linear', 33, 'lf']);
    const qmet = { kind: 'area' as const, base: 17.7444, waste: 10, withWaste: 19.51884, quantity: 19.52, unit: 'm²' };
    const sm = quickMeasureState('Tile', qmet, 'metric')!;
    const fm = measureFinal(sanitizeMeasureState(sm), readMeasure(sanitizeMeasureState(sm)));
    eq('metric hand-off', [fm.lineQuantity, fm.lineUnit], [19.52, 'm²']);
    eq('counts have no Quick measure mode', quickMeasureState('Outlets', { kind: 'count', base: 4, waste: 0, withWaste: 4, quantity: 4, unit: 'each' }, 'imperial'), null);
    eq('nothing measured → null', quickMeasureState('X', { ...qa, base: 0 }, 'imperial'), null);
    const kv = store();
    rememberMeasurement(kv, 'u1', 'job1', s);
    const recent = readRecentMeasurements(kv, 'u1', 'job1');
    eq('shows under Recent on this job', [recent.length, recent[0].label.startsWith('Drywall (plans)'), recent[0].quantity, recent[0].unit], [1, true, 211, 'sq ft']);
}

// ================================================================================================= wiring
{
    const root = join(import.meta.dirname ?? __dirname, '..');
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    const details = read('components/JobDetailsScreen.tsx');
    ok('Plans tab: slot, hash, tab list', details.includes('plansSlot?: React.ReactNode') && details.includes("'#plans'") && details.includes("tabs.push(['plans', 'Plans'])") && details.includes("tabState === 'plans' && !plansSlot"));
    const app = read('App.tsx');
    ok('App: Plans panel is lazy', app.includes("lazy(() => import('./components/plans/JobPlansPanel.tsx'))"));
    ok('App: Plans tab mounted for signed-in users', /plansSlot=\{session \?/.test(app));
    ok('App: pdf.js never imported by App', !/pdfjs-dist/.test(app));
    const render = read('components/plans/planRender.ts');
    ok('pdf.js: legacy build, dynamic import', render.includes("import('pdfjs-dist/legacy/build/pdf.mjs')") && !/^import .*pdfjs-dist/m.test(render));
    ok('pdf.js: worker from our own origin', render.includes("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')") && render.includes('GlobalWorkerOptions.workerSrc'));
    ok('pdf.js: no eval', render.includes('isEvalSupported: false'));
    const viewer = read('components/plans/PlanViewer.tsx');
    ok('viewer: no static pdf.js import', !/from 'pdfjs-dist/.test(viewer));
    ok('viewer: new estimate opens the form (no write here)', !/supabase/.test(viewer) && read('components/plans/JobPlansPanel.tsx').includes('makeSeedPrefill(seed)'));
    const api = read('lib/plans/plansApi.ts');
    ok('api: no database table writes', !/\.from\('[a-z_]+'\)\.(insert|update|upsert|delete)/.test(api));
    ok('api: writes need a connection', (api.match(/ensureOnline\(\)/g) || []).length >= 3);
    ok('api: measurements saved as PNG (bucket mime types)', api.includes("contentType: 'image/png'"));
    const guide = HELP_GUIDES.find(g => g.id === 'plans');
    ok('help: plans guide', !!guide && guide.steps.length >= 5 && guide.where.join('>') === 'Job>Plans');
    ok('help: covers upload, scale, measure, estimate', !!guide && ['Add a plan', 'Set the scale', 'Measure', 'Totals and the estimate'].every(t => guide.steps.some(s => s.title === t)));
    ok('help: no forbidden words', !!guide && !/kelviq|merchant of record/i.test(JSON.stringify(guide)));
    const vercel = read('vercel.json');
    ok('CSP allows workers from our own origin', /worker-src 'self'/.test(vercel));
}

console.log(`plans-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
