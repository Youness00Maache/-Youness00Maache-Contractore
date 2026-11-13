/**
 * QR codes without a network call or a heavy dependency (used for "Scan to pay" on invoice PDFs).
 *
 * This is the "QR Code generator library" by Project Nayuki (MIT license, https://www.nayuki.io/page/qr-code-generator-library),
 * the same encoder `qrcode.react` embeds. It is vendored here because `qrcode.react` only exposes React components:
 * rendering them to a string would pull `react-dom/server` into the always-loaded React chunk and load the 350 KB
 * scanner chunk with it (see vite.config.ts manualChunks). scripts/payments-qa.ts checks that this copy produces
 * exactly the same modules as `qrcode.react` for a set of payment links.
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 *   the Software.
 * - The Software is provided "as is", without warranty of any kind, express or implied, including but not limited to
 *   the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other liability, whether in an action of
 *   contract, tort or otherwise, arising from, out of or in connection with the Software or the use or other dealings
 *   in the Software.
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

// ordinal = row in the tables below, formatBits = the 2-bit value written in the format information
const ECC: Record<QrEcc, { ordinal: number; formatBits: number }> = {
    L: { ordinal: 0, formatBits: 1 },
    M: { ordinal: 1, formatBits: 0 },
    Q: { ordinal: 2, formatBits: 3 },
    H: { ordinal: 3, formatBits: 2 },
};
const ECC_ORDER: QrEcc[] = ['L', 'M', 'Q', 'H'];

const ECC_CODEWORDS_PER_BLOCK: number[][] = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// ---------------------------------------------------------------------------------------------------------------
// segments (numeric / alphanumeric / byte, chosen like qrcodegen.QrSegment.makeSegments)
// ---------------------------------------------------------------------------------------------------------------
interface Mode { modeBits: number; charCountBits: [number, number, number] }
const NUMERIC: Mode = { modeBits: 0x1, charCountBits: [10, 12, 14] };
const ALPHANUMERIC: Mode = { modeBits: 0x2, charCountBits: [9, 11, 13] };
const BYTE: Mode = { modeBits: 0x4, charCountBits: [8, 16, 16] };
const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

interface Segment { mode: Mode; numChars: number; bits: number[] }

const appendBits = (val: number, len: number, bb: number[]) => {
    if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
    for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
};
const getBit = (x: number, i: number) => ((x >>> i) & 1) !== 0;
const charCountBits = (mode: Mode, ver: number) => mode.charCountBits[Math.floor((ver + 7) / 17)];

const toUtf8 = (s: string): number[] => {
    const out: number[] = [];
    const enc = encodeURI(s);
    for (let i = 0; i < enc.length; i++) {
        if (enc.charAt(i) !== '%') out.push(enc.charCodeAt(i));
        else { out.push(parseInt(enc.substring(i + 1, i + 3), 16)); i += 2; }
    }
    return out;
};

const makeSegments = (text: string): Segment[] => {
    if (text === '') return [];
    if (/^[0-9]*$/.test(text)) {
        const bits: number[] = [];
        for (let i = 0; i < text.length;) {
            const n = Math.min(text.length - i, 3);
            appendBits(parseInt(text.substring(i, i + n), 10), n * 3 + 1, bits);
            i += n;
        }
        return [{ mode: NUMERIC, numChars: text.length, bits }];
    }
    if (/^[A-Z0-9 $%*+.\/:-]*$/.test(text)) {
        const bits: number[] = [];
        let i: number;
        for (i = 0; i + 2 <= text.length; i += 2) {
            appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45 + ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1)), 11, bits);
        }
        if (i < text.length) appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bits);
        return [{ mode: ALPHANUMERIC, numChars: text.length, bits }];
    }
    const bytes = toUtf8(text);
    const bits: number[] = [];
    for (const b of bytes) appendBits(b, 8, bits);
    return [{ mode: BYTE, numChars: bytes.length, bits }];
};

const totalBits = (segs: Segment[], ver: number): number => {
    let result = 0;
    for (const s of segs) {
        const cc = charCountBits(s.mode, ver);
        if (s.numChars >= 1 << cc) return Infinity;
        result += 4 + cc + s.bits.length;
    }
    return result;
};

// ---------------------------------------------------------------------------------------------------------------
// symbol
// ---------------------------------------------------------------------------------------------------------------
const numRawDataModules = (ver: number): number => {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
        const numAlign = Math.floor(ver / 7) + 2;
        result -= (25 * numAlign - 10) * numAlign - 55;
        if (ver >= 7) result -= 36;
    }
    return result;
};
const numDataCodewords = (ver: number, ecc: QrEcc) =>
    Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ECC[ecc].ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ECC[ecc].ordinal][ver];

const rsMultiply = (x: number, y: number): number => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
};
const rsDivisor = (degree: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < result.length; j++) {
            result[j] = rsMultiply(result[j], root);
            if (j + 1 < result.length) result[j] ^= result[j + 1];
        }
        root = rsMultiply(root, 0x02);
    }
    return result;
};
const rsRemainder = (data: number[], divisor: number[]): number[] => {
    const result = divisor.map(() => 0);
    for (const b of data) {
        const factor = b ^ (result.shift() as number);
        result.push(0);
        divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
    }
    return result;
};

class QrSymbol {
    readonly size: number;
    readonly modules: boolean[][] = [];
    private isFunction: boolean[][] = [];
    mask = 0;

    constructor(readonly version: number, readonly ecc: QrEcc, dataCodewords: number[]) {
        this.size = version * 4 + 17;
        for (let i = 0; i < this.size; i++) {
            this.modules.push(new Array(this.size).fill(false));
            this.isFunction.push(new Array(this.size).fill(false));
        }
        this.drawFunctionPatterns();
        this.drawCodewords(this.addEccAndInterleave(dataCodewords));
        let best = 0;
        let minPenalty = 1e9;
        for (let i = 0; i < 8; i++) {
            this.applyMask(i);
            this.drawFormatBits(i);
            const penalty = this.penaltyScore();
            if (penalty < minPenalty) { best = i; minPenalty = penalty; }
            this.applyMask(i); // XOR again = undo
        }
        this.mask = best;
        this.applyMask(best);
        this.drawFormatBits(best);
        this.isFunction = [];
    }

    private setFunction(x: number, y: number, dark: boolean) {
        this.modules[y][x] = dark;
        this.isFunction[y][x] = true;
    }

    private drawFunctionPatterns() {
        for (let i = 0; i < this.size; i++) {
            this.setFunction(6, i, i % 2 === 0);
            this.setFunction(i, 6, i % 2 === 0);
        }
        this.drawFinder(3, 3);
        this.drawFinder(this.size - 4, 3);
        this.drawFinder(3, this.size - 4);
        const pos = this.alignmentPositions();
        const n = pos.length;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) this.drawAlignment(pos[i], pos[j]);
            }
        }
        this.drawFormatBits(0);
        this.drawVersion();
    }

    private drawFormatBits(mask: number) {
        const data = (ECC[this.ecc].formatBits << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) this.setFunction(8, i, getBit(bits, i));
        this.setFunction(8, 7, getBit(bits, 6));
        this.setFunction(8, 8, getBit(bits, 7));
        this.setFunction(7, 8, getBit(bits, 8));
        for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, getBit(bits, i));
        for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, getBit(bits, i));
        for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, getBit(bits, i));
        this.setFunction(8, this.size - 8, true);
    }

    private drawVersion() {
        if (this.version < 7) return;
        let rem = this.version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const bits = (this.version << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const dark = getBit(bits, i);
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            this.setFunction(a, b, dark);
            this.setFunction(b, a, dark);
        }
    }

    private drawFinder(x: number, y: number) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                const xx = x + dx;
                const yy = y + dy;
                if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFunction(xx, yy, dist !== 2 && dist !== 4);
            }
        }
    }

    private drawAlignment(x: number, y: number) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }

    private alignmentPositions(): number[] {
        if (this.version === 1) return [];
        const numAlign = Math.floor(this.version / 7) + 2;
        const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
        const result = [6];
        for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
        return result;
    }

    private addEccAndInterleave(data: number[]): number[] {
        const ord = ECC[this.ecc].ordinal;
        const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ord][this.version];
        const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ord][this.version];
        const rawCodewords = Math.floor(numRawDataModules(this.version) / 8);
        const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
        const shortBlockLen = Math.floor(rawCodewords / numBlocks);
        const blocks: number[][] = [];
        const div = rsDivisor(blockEccLen);
        for (let i = 0, k = 0; i < numBlocks; i++) {
            const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
            k += dat.length;
            const ecc = rsRemainder(dat, div);
            if (i < numShortBlocks) dat.push(0);
            blocks.push(dat.concat(ecc));
        }
        const result: number[] = [];
        for (let i = 0; i < blocks[0].length; i++) {
            blocks.forEach((block, j) => {
                if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
            });
        }
        return result;
    }

    private drawCodewords(data: number[]) {
        let i = 0;
        for (let right = this.size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < this.size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? this.size - 1 - vert : vert;
                    if (!this.isFunction[y][x] && i < data.length * 8) {
                        this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
                        i++;
                    }
                }
            }
        }
    }

    private applyMask(mask: number) {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                let invert: boolean;
                switch (mask) {
                    case 0: invert = (x + y) % 2 === 0; break;
                    case 1: invert = y % 2 === 0; break;
                    case 2: invert = x % 3 === 0; break;
                    case 3: invert = (x + y) % 3 === 0; break;
                    case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                    case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
                    case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                    default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                }
                if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
            }
        }
    }

    private penaltyScore(): number {
        let result = 0;
        const size = this.size;
        const addHistory = (run: number, history: number[]) => {
            if (history[0] === 0) run += size;
            history.pop();
            history.unshift(run);
        };
        const countPatterns = (h: number[]) => {
            const n = h[1];
            const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
            return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
        };
        const terminate = (color: boolean, run: number, history: number[]) => {
            if (color) { addHistory(run, history); run = 0; }
            run += size;
            addHistory(run, history);
            return countPatterns(history);
        };
        for (let pass = 0; pass < 2; pass++) {
            for (let a = 0; a < size; a++) {
                let runColor = false;
                let run = 0;
                const history = [0, 0, 0, 0, 0, 0, 0];
                for (let b = 0; b < size; b++) {
                    const cell = pass === 0 ? this.modules[a][b] : this.modules[b][a];
                    if (cell === runColor) {
                        run++;
                        if (run === 5) result += PENALTY_N1;
                        else if (run > 5) result++;
                    } else {
                        addHistory(run, history);
                        if (!runColor) result += countPatterns(history) * PENALTY_N3;
                        runColor = cell;
                        run = 1;
                    }
                }
                result += terminate(runColor, run, history) * PENALTY_N3;
            }
        }
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const c = this.modules[y][x];
                if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) result += PENALTY_N2;
            }
        }
        let dark = 0;
        for (const row of this.modules) for (const c of row) if (c) dark++;
        const total = size * size;
        const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        result += k * PENALTY_N4;
        return result;
    }
}

/**
 * Encodes text (UTF-8) into QR modules (true = dark), smallest version first, error correction raised for free when
 * it still fits (qrcodegen's boostEcl). Throws RangeError when the text is too long for any version.
 */
export const qrMatrix = (text: string, ecc: QrEcc = 'M'): boolean[][] => {
    const segs = makeSegments(String(text ?? ''));
    let version = 1;
    let used = 0;
    for (; ; version++) {
        const bits = totalBits(segs, version);
        if (bits <= numDataCodewords(version, ecc) * 8) { used = bits; break; }
        if (version >= 40) throw new RangeError('Data too long for a QR code');
    }
    let level = ecc;
    for (const next of ECC_ORDER.slice(1)) if (used <= numDataCodewords(version, next) * 8 && ECC_ORDER.indexOf(next) > ECC_ORDER.indexOf(level)) level = next;
    const bb: number[] = [];
    for (const s of segs) {
        appendBits(s.mode.modeBits, 4, bb);
        appendBits(s.numChars, charCountBits(s.mode, version), bb);
        for (const b of s.bits) bb.push(b);
    }
    const capacity = numDataCodewords(version, level) * 8;
    appendBits(0, Math.min(4, capacity - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (let pad = 0xec; bb.length < capacity; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);
    const codewords: number[] = new Array(bb.length / 8).fill(0);
    bb.forEach((b, i) => { codewords[i >>> 3] |= b << (7 - (i & 7)); });
    return new QrSymbol(version, level, codewords).modules.map((row) => row.slice());
};

/** One SVG path for the dark modules: a horizontal run per row segment (`M x y h n v1 h-n z`). */
export const qrPath = (modules: boolean[][], margin = 0): string => {
    const ops: string[] = [];
    modules.forEach((row, y) => {
        let start = -1;
        for (let x = 0; x <= row.length; x++) {
            const dark = x < row.length && row[x];
            if (dark && start < 0) start = x;
            if (!dark && start >= 0) {
                ops.push(`M${start + margin} ${y + margin}h${x - start}v1h${start - x}z`);
                start = -1;
            }
        }
    });
    return ops.join('');
};

/**
 * Self-contained SVG markup (safe to inline: the only dynamic part is the generated path). A quiet zone of
 * `margin` modules (4 per the spec, 2 is fine on a white page) keeps phone cameras happy.
 */
export const qrSvg = (text: string, opts: { size?: number; margin?: number; ecc?: QrEcc; color?: string; title?: string } = {}): string => {
    const modules = qrMatrix(text, opts.ecc || 'M');
    const margin = Math.max(0, Math.floor(opts.margin ?? 2));
    const n = modules.length + margin * 2;
    const size = Math.max(16, Math.round(opts.size ?? 96));
    const color = /^#[0-9a-f]{3,8}$/i.test(String(opts.color || '')) ? String(opts.color) : '#000000';
    const title = opts.title ? `<title>${String(opts.title).replace(/[<>&"']/g, '')}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img">${title}<rect width="${n}" height="${n}" fill="#ffffff"/><path fill="${color}" d="${qrPath(modules, margin)}"/></svg>`;
};
