/**
 * Quick measure (competitor gap #20, calculator): a bottom sheet on phones / dialog on computers opened from a line
 * of an estimate, invoice or change order (components/forms/LineItemsEditor.tsx). All the math is in lib/measure.ts.
 *
 *   - Room / Area / Linear / Roof / Volume, typed in feet + inches or metres (the choice follows the user's account:
 *     public.user_settings 'measure.units', lib/userData.ts);
 *   - pick a result (floor, walls, squares…), add waste %, round up to packs (1 box = 20 sq ft);
 *   - "Use this quantity" puts the quantity (and its unit) on the line; the measurement goes into the description only
 *     when "Add measurement to description" is ticked (off by default, so documents never change by surprise);
 *   - "Price book" picks the line's item without leaving the sheet;
 *   - used measurements are remembered on this device per user and job (Recent on this job).
 * Rendered in a portal: Enter in a box moves to the next box and never submits the document form behind it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem, LineItem, SavedItem } from '../../types.ts';
import { cn } from '../../lib/utils.ts';
import {
    MEASURE_MODES, PACK_NAMES, PITCH_MAX_RISE, WASTE_CHOICES, blankMeasureState, convertMeasureState, defaultUnitSystem, formatLength, formatQty, inputNumber,
    measureFinal, measurementSummary, newOpening, newSegment, newShape, parseNumber, pitchDegrees, pitchFactor, pitchFactorFromDegrees,
    pluralUnit, readLength, readMeasure, readRecentMeasurements, recentWhen, rememberMeasurement, riseFromDegrees, suggestFromUnit, unitFromText, unitsOf,
    withMeasurement, type LengthInput, type MeasureMode, type MeasureState, type OpeningInput, type RecentMeasurement, type UnitSystem,
} from '../../lib/measure.ts';
import { activeUserIdNow, browserStore, currentUserId, loadMeasureUnits, readMeasureUnitsLocal, saveMeasureUnits } from '../../lib/userData.ts';
import ItemPickerModal from '../forms/ItemPickerModal.tsx';
import { PlusIcon, TagIcon, XCircleIcon } from '../Icons.tsx';

export interface QuickMeasureResult {
    quantity: number;
    unit: string;
    /** only when "Add measurement to description" is ticked */
    description?: string;
}

interface QuickMeasureSheetProps {
    open: boolean;
    onClose: () => void;
    line: LineItem | null;
    lineNumber: number;
    jobId?: string | null;
    onApply: (result: QuickMeasureResult) => void;
    savedItems?: SavedItem[];
    inventoryItems?: InventoryItem[];
    showInventory?: boolean;
    currency?: string;
    /** picks a price book / inventory item onto this line (same rules as the line's own picker) */
    onPickSaved?: (item: SavedItem) => void;
    onPickInventory?: (item: InventoryItem) => void;
}

/** The units in use this session (account / device value once known), so every sheet opens in them. */
let sessionSystem: { uid: string | null; system: UnitSystem } | null = null;
/** What was typed per line this session: closing the sheet by mistake loses nothing. */
const typedByLine = new Map<string, MeasureState>();

const systemNow = (): UnitSystem => {
    const uid = activeUserIdNow();
    if (sessionSystem && sessionSystem.uid === uid) return sessionSystem.system;
    return readMeasureUnitsLocal(uid) || defaultUnitSystem(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
};

/** Nothing typed for the current mode yet (every result is 0). */
const modeIsEmpty = (s: MeasureState) => readMeasure(s).outputs.every(o => o.value === 0);

function startState(line: LineItem | null, system: UnitSystem): MeasureState {
    const kept = line ? typedByLine.get(line.id) : undefined;
    if (kept) return kept.system === system ? kept : convertMeasureState(kept, system);
    const s = blankMeasureState(system);
    const hint = suggestFromUnit(unitFromText(line?.unit) || unitFromText(line?.description));
    if (hint) {
        s.mode = hint.mode;
        if (hint.pick) s.pick = { [hint.mode]: hint.pick };
    }
    return s;
}

// ------------------------------------------------------------------------------------------------ small parts
const boxClass = 'input h-11 min-w-0 px-3 text-base tabular-nums sm:text-sm';
/** small caps caption on phones, a plain label beside the row from `sm` */
const groupLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm sm:font-medium sm:normal-case sm:tracking-normal';

const NumBox: React.FC<{
    value: string;
    onChange: (v: string) => void;
    suffix?: string;
    label: string;
    invalid?: boolean;
    placeholder?: string;
    numeric?: boolean;
    className?: string;
}> = ({ value, onChange, suffix, label, invalid, placeholder, numeric, className }) => (
    <div className={cn('relative min-w-0', className)}>
        <input
            type="text"
            inputMode={numeric ? 'numeric' : 'decimal'}
            enterKeyHint="next"
            autoComplete="off"
            data-measure=""
            className={cn(boxClass, suffix && 'pr-9', invalid && 'border-destructive focus:border-destructive focus:ring-destructive/15')}
            value={value}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={invalid || undefined}
            onChange={e => onChange(e.target.value.slice(0, 24))}
            onFocus={e => e.currentTarget.select()}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
);

const LengthBoxes: React.FC<{ value: LengthInput; onChange: (v: LengthInput) => void; system: UnitSystem; label: string; placeholder?: string }> = ({
    value, onChange, system, label, placeholder,
}) => {
    const invalid = !readLength(value, system).valid;
    if (system === 'metric') {
        return <NumBox value={value.major} onChange={major => onChange({ major, minor: '' })} suffix="m" label={`${label} (m)`} invalid={invalid} placeholder={placeholder} />;
    }
    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-1.5">
            <NumBox value={value.major} onChange={major => onChange({ ...value, major })} suffix="ft" label={`${label} (feet)`} invalid={invalid} placeholder={placeholder} />
            <NumBox value={value.minor} onChange={minor => onChange({ ...value, minor })} suffix="in" label={`${label} (inches)`} invalid={invalid} />
        </div>
    );
};

const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={cn('grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2', className)}>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {children}
    </div>
);

const Pill: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; label?: string; className?: string }> = ({ on, onClick, children, label, className }) => (
    <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={onClick}
        className={cn(
            'min-h-[40px] rounded-lg px-3 text-xs font-semibold transition-colors',
            on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
            className,
        )}
    >
        {children}
    </button>
);

const RemoveButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
        ×
    </button>
);

const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button type="button" onClick={onClick} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-primary/5">
        <PlusIcon className="h-3.5 w-3.5" /> {children}
    </button>
);

const OPENING_LABEL: Record<OpeningInput['kind'], string> = { door: 'Door', window: 'Window', other: 'Other' };

// ------------------------------------------------------------------------------------------------- the sheet
const QuickMeasureSheet: React.FC<QuickMeasureSheetProps> = ({
    open, onClose, line, lineNumber, jobId, onApply, savedItems = [], inventoryItems = [], showInventory = true, currency = 'USD',
    onPickSaved, onPickInventory,
}) => {
    // the state remembers which line it belongs to, so a stale state is never saved under another line
    const [slot, setSlot] = useState<{ lineId: string; state: MeasureState }>(() => ({ lineId: line?.id ?? '', state: startState(line, systemNow()) }));
    const state = slot.state;
    const setState = (next: MeasureState | ((s: MeasureState) => MeasureState)) =>
        setSlot(cur => ({ ...cur, state: typeof next === 'function' ? next(cur.state) : next }));
    const [addToDescription, setAddToDescription] = useState(false);
    const [recent, setRecent] = useState<RecentMeasurement[]>([]);
    const [uid, setUid] = useState<string | null>(() => activeUserIdNow());
    const [picker, setPicker] = useState(false);
    const [editing, setEditing] = useState<Record<string, boolean>>({});
    const [unitsNote, setUnitsNote] = useState('');
    const panelRef = useRef<HTMLDivElement>(null);
    const toggledRef = useRef(false);
    const lineId = line?.id ?? '';

    // a fresh start (or this line's last values) every time the sheet opens
    useEffect(() => {
        if (!open) return;
        setSlot({ lineId, state: startState(line, systemNow()) });
        setAddToDescription(false);
        setPicker(false);
        setEditing({});
        setUnitsNote('');
        toggledRef.current = false;
        let active = true;
        const known = activeUserIdNow();
        const loadRecent = (id: string | null) => { if (active) { setUid(id); setRecent(readRecentMeasurements(browserStore, id, jobId)); } };
        loadRecent(known);
        if (!known) void currentUserId().then(id => { if (id) loadRecent(id); });
        // the account's choice wins over this device's copy (another device may have changed it)
        void loadMeasureUnits().then(sys => {
            if (!active || !sys) return;
            sessionSystem = { uid: activeUserIdNow(), system: sys };
            if (!toggledRef.current) setState(s => (s.system === sys ? s : convertMeasureState(s, sys)));
        }).catch(() => { /* offline: this device's copy is used */ });
        // keyboard users start typing at once; phones wait for a tap (the keypad would cover the sheet)
        if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
            window.setTimeout(() => panelRef.current?.querySelector<HTMLInputElement>('input[data-measure]')?.focus(), 30);
        }
        return () => { active = false; };
    }, [open, lineId]); // eslint-disable-line react-hooks/exhaustive-deps

    // remember what was typed for this line (session only)
    useEffect(() => { if (open && lineId && slot.lineId === lineId) typedByLine.set(lineId, slot.state); }, [open, lineId, slot]);

    useEffect(() => {
        if (!open || picker) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, picker, onClose]);

    const reading = useMemo(() => readMeasure(state), [state]);
    const final = useMemo(() => measureFinal(state, reading), [state, reading]);

    if (!open || !line || typeof document === 'undefined') return null;

    const sys = state.system;
    const u = unitsOf(sys);
    const output = final.output;
    const set = (fn: (s: MeasureState) => MeasureState) => setState(fn);
    const setMode = (mode: MeasureMode) => set(s => ({ ...s, mode }));
    const pick = (key: string) => set(s => ({ ...s, pick: { ...s.pick, [s.mode]: key } }));

    const switchUnits = (to: UnitSystem) => {
        if (to === sys) return;
        toggledRef.current = true;
        sessionSystem = { uid: activeUserIdNow(), system: to };
        setState(s => convertMeasureState(s, to));
        void saveMeasureUnits(to).then(mode => setUnitsNote(mode === 'device' || mode === 'offline' ? 'Saved on this device for now.' : ''));
    };

    const reuseRecent = (r: RecentMeasurement) => setState(r.state.system === sys ? r.state : convertMeasureState(r.state, sys));

    const apply = () => {
        if (!output || final.lineQuantity <= 0) return;
        const result: QuickMeasureResult = { quantity: final.lineQuantity, unit: final.lineUnit };
        if (addToDescription) result.description = withMeasurement(line.description, measurementSummary(state, final));
        onApply(result);
        setRecent(rememberMeasurement(browserStore, uid, jobId, state));
        onClose();
    };

    const pickedFromBook = (fn?: () => void) => {
        fn?.();
        setPicker(false);
    };

    /** after a price book pick: "per square" opens Roof → squares when nothing is typed yet */
    const followItem = (text: string) => {
        const hint = suggestFromUnit(unitFromText(text));
        if (!hint) return;
        set(s => {
            if (s.mode !== hint.mode && !modeIsEmpty(s)) return s;
            return { ...s, mode: hint.mode, pick: hint.pick ? { ...s.pick, [hint.mode]: hint.pick } : s.pick };
        });
    };

    // Enter = next box (never submits the document form)
    const onKeyDown = (e: React.KeyboardEvent) => {
        const t = e.target as HTMLElement;
        if (e.key !== 'Enter' || !(t instanceof HTMLInputElement) || t.type === 'checkbox') return;
        e.preventDefault();
        const boxes = Array.from(panelRef.current?.querySelectorAll<HTMLInputElement>('input[data-measure]') ?? []);
        const i = boxes.indexOf(t);
        if (i >= 0 && i < boxes.length - 1) boxes[i + 1].focus(); else t.blur();
    };

    // ----------------------------------------------------------------------------------- inputs per mode
    const room = state.room;
    const setRoom = (patch: Partial<MeasureState['room']>) => set(s => ({ ...s, room: { ...s.room, ...patch } }));
    const setOpening = (id: string, patch: Partial<OpeningInput>) => setRoom({ openings: room.openings.map(o => (o.id === id ? { ...o, ...patch } : o)) });
    const addOpening = (kind: OpeningInput['kind']) => {
        const o = newOpening(kind, sys);
        setRoom({ openings: [...room.openings, o] });
        if (kind === 'other') setEditing(e => ({ ...e, [o.id]: true }));
    };

    const roomInputs = (
        <div className="space-y-2.5">
            <Row label="Length"><LengthBoxes value={room.length} onChange={v => setRoom({ length: v })} system={sys} label="Room length" /></Row>
            <Row label="Width"><LengthBoxes value={room.width} onChange={v => setRoom({ width: v })} system={sys} label="Room width" /></Row>
            <Row label="Height"><LengthBoxes value={room.height} onChange={v => setRoom({ height: v })} system={sys} label="Wall height" /></Row>
            <div className="pt-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Doors &amp; windows</p>
                {room.openings.length > 0 && (
                    <ul className="mt-1.5 divide-y divide-border rounded-xl border border-border">
                        {room.openings.map(o => {
                            const w = readLength(o.width, sys);
                            const h = readLength(o.height, sys);
                            const sizeOpen = !!editing[o.id];
                            return (
                                <li key={o.id} className="px-2.5 py-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-14 shrink-0 text-sm font-medium">{OPENING_LABEL[o.kind]}</span>
                                        <span className="text-xs text-muted-foreground" aria-hidden>×</span>
                                        <NumBox value={o.count} onChange={count => setOpening(o.id, { count })} label={`${OPENING_LABEL[o.kind]} count`} numeric className="w-14 shrink-0" placeholder="1" />
                                        <button
                                            type="button"
                                            onClick={() => setEditing(e => ({ ...e, [o.id]: !sizeOpen }))}
                                            aria-expanded={sizeOpen}
                                            className="min-h-[40px] min-w-0 flex-1 truncate rounded-lg px-2 text-left font-mono text-xs text-muted-foreground hover:bg-muted"
                                            title="Change the size"
                                        >
                                            {w.value > 0 && h.value > 0 ? `${formatLength(w.value, sys)} × ${formatLength(h.value, sys)}` : 'Set size'}
                                            <span className="ml-1.5 font-sans font-semibold text-primary">{sizeOpen ? 'Done' : 'Size'}</span>
                                        </button>
                                        <RemoveButton onClick={() => setRoom({ openings: room.openings.filter(x => x.id !== o.id) })} label={`Remove ${OPENING_LABEL[o.kind].toLowerCase()}`} />
                                    </div>
                                    {sizeOpen && (
                                        <div className="mt-1.5 space-y-1.5 pb-1">
                                            <Row label="Width"><LengthBoxes value={o.width} onChange={v => setOpening(o.id, { width: v })} system={sys} label={`${OPENING_LABEL[o.kind]} width`} /></Row>
                                            <Row label="Height"><LengthBoxes value={o.height} onChange={v => setOpening(o.id, { height: v })} system={sys} label={`${OPENING_LABEL[o.kind]} height`} /></Row>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                    <AddButton onClick={() => addOpening('door')}>Door</AddButton>
                    <AddButton onClick={() => addOpening('window')}>Window</AddButton>
                    <AddButton onClick={() => addOpening('other')}>Other opening</AddButton>
                </div>
            </div>
        </div>
    );

    const shapes = state.area.shapes;
    const setShapes = (next: MeasureState['area']['shapes']) => set(s => ({ ...s, area: { shapes: next } }));
    const areaInputs = (
        <div className="space-y-2">
            {shapes.map((sh, i) => (
                <div key={sh.id} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-center gap-1.5">
                        {/* one tap switches between adding the shape and taking it away */}
                        <button
                            type="button"
                            aria-pressed={sh.subtract}
                            aria-label={`Shape ${i + 1} is ${sh.subtract ? 'taken away' : 'added'}; tap to switch`}
                            onClick={() => setShapes(shapes.map(x => (x.id === sh.id ? { ...x, subtract: !x.subtract } : x)))}
                            className={cn('min-h-[40px] w-[6.5rem] shrink-0 rounded-lg px-2 text-left text-xs font-bold', sh.subtract ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}
                        >
                            {sh.subtract ? '− Take away' : '+ Add'}
                        </button>
                        <Pill on={sh.kind === 'rect'} onClick={() => setShapes(shapes.map(x => (x.id === sh.id ? { ...x, kind: 'rect' } : x)))}>Rectangle</Pill>
                        <Pill on={sh.kind === 'tri'} onClick={() => setShapes(shapes.map(x => (x.id === sh.id ? { ...x, kind: 'tri' } : x)))}>Triangle</Pill>
                        {shapes.length > 1 && <span className="ml-auto"><RemoveButton onClick={() => setShapes(shapes.filter(x => x.id !== sh.id))} label={`Remove shape ${i + 1}`} /></span>}
                    </div>
                    <div className="mt-2 space-y-1.5">
                        <Row label={sh.kind === 'tri' ? 'Base' : 'Length'}><LengthBoxes value={sh.a} onChange={a => setShapes(shapes.map(x => (x.id === sh.id ? { ...x, a } : x)))} system={sys} label={`Shape ${i + 1} ${sh.kind === 'tri' ? 'base' : 'length'}`} /></Row>
                        <Row label={sh.kind === 'tri' ? 'Height' : 'Width'}><LengthBoxes value={sh.b} onChange={b => setShapes(shapes.map(x => (x.id === sh.id ? { ...x, b } : x)))} system={sys} label={`Shape ${i + 1} ${sh.kind === 'tri' ? 'height' : 'width'}`} /></Row>
                    </div>
                </div>
            ))}
            {shapes.length < 20 && (
                <div className="flex flex-wrap gap-1">
                    <AddButton onClick={() => setShapes([...shapes, newShape('rect')])}>Add shape</AddButton>
                    <AddButton onClick={() => setShapes([...shapes, newShape('rect', true)])}>Take away a shape</AddButton>
                </div>
            )}
        </div>
    );

    const segments = state.linear.segments;
    const setSegments = (next: MeasureState['linear']['segments']) => set(s => ({ ...s, linear: { segments: next } }));
    const linearInputs = (
        <div className="space-y-1.5">
            {segments.map((sg, i) => (
                <div key={sg.id} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                        <LengthBoxes value={sg.length} onChange={length => setSegments(segments.map(x => (x.id === sg.id ? { ...x, length } : x)))} system={sys} label={`Length ${i + 1}`} />
                    </div>
                    <span className="text-xs text-muted-foreground" aria-hidden>×</span>
                    <NumBox value={sg.count} onChange={count => setSegments(segments.map(x => (x.id === sg.id ? { ...x, count } : x)))} label={`Length ${i + 1} count`} numeric placeholder="1" className="w-12 shrink-0 sm:w-14" />
                    {segments.length > 1 ? <RemoveButton onClick={() => setSegments(segments.filter(x => x.id !== sg.id))} label={`Remove length ${i + 1}`} /> : <span className="w-9 shrink-0" />}
                </div>
            ))}
            {segments.length < 20 && <AddButton onClick={() => setSegments([...segments, newSegment()])}>Add length</AddButton>}
        </div>
    );

    const roof = state.roof;
    const setRoof = (patch: Partial<MeasureState['roof']>) => set(s => ({ ...s, roof: { ...s.roof, ...patch } }));
    const pitchValue = parseNumber(roof.pitch) ?? 0;
    const roofFactor = roof.pitchUnit === 'deg' ? pitchFactorFromDegrees(pitchValue) : pitchFactor(pitchValue);
    const roofInputs = (
        <div className="space-y-2.5">
            <Row label="Plan">
                <div className="flex gap-1.5">
                    <Pill on={roof.by === 'dims'} onClick={() => setRoof({ by: 'dims' })}>Length × width</Pill>
                    <Pill on={roof.by === 'area'} onClick={() => setRoof({ by: 'area' })}>Footprint area</Pill>
                </div>
            </Row>
            {roof.by === 'dims' ? (
                <>
                    <Row label="Length"><LengthBoxes value={roof.length} onChange={v => setRoof({ length: v })} system={sys} label="Roof plan length" /></Row>
                    <Row label="Width"><LengthBoxes value={roof.width} onChange={v => setRoof({ width: v })} system={sys} label="Roof plan width" /></Row>
                </>
            ) : (
                <Row label="Area"><NumBox value={roof.planArea} onChange={planArea => setRoof({ planArea })} suffix={u.area} label={`Footprint area (${u.area})`} invalid={roof.planArea.trim() !== '' && parseNumber(roof.planArea) === null} /></Row>
            )}
            <Row label="Pitch">
                <div className="flex items-center gap-1.5">
                    <NumBox value={roof.pitch} onChange={pitch => setRoof({ pitch })} suffix={roof.pitchUnit === 'deg' ? '°' : '/12'} label={roof.pitchUnit === 'deg' ? 'Roof pitch in degrees' : 'Roof pitch, rise per 12'} placeholder={roof.pitchUnit === 'deg' ? '30' : '6'} invalid={roof.pitch.trim() !== '' && parseNumber(roof.pitch) === null} className="w-24 shrink-0" />
                    <Pill on={roof.pitchUnit === 'rise'} onClick={() => setRoof({ pitchUnit: 'rise', pitch: roof.pitchUnit === 'deg' && pitchValue > 0 ? inputNumber(riseFromDegrees(pitchValue), 2) : roof.pitch })} label="Pitch as rise per 12" className="min-w-[44px]">x/12</Pill>
                    <Pill on={roof.pitchUnit === 'deg'} onClick={() => setRoof({ pitchUnit: 'deg', pitch: roof.pitchUnit === 'rise' && pitchValue > 0 ? inputNumber(pitchDegrees(Math.min(pitchValue, PITCH_MAX_RISE)), 1) : roof.pitch })} label="Pitch in degrees" className="min-w-[44px]">°</Pill>
                </div>
            </Row>
            <p className="pl-[5rem] font-mono text-[11px] text-muted-foreground">
                factor ×{roofFactor.toFixed(3)}{roof.pitchUnit === 'rise' && pitchValue > 0 ? ` · ${formatQty(pitchDegrees(Math.min(pitchValue, PITCH_MAX_RISE)), 1)}°` : ''}
            </p>
        </div>
    );

    const vol = state.volume;
    const setVol = (patch: Partial<MeasureState['volume']>) => set(s => ({ ...s, volume: { ...s.volume, ...patch } }));
    const volumeInputs = (
        <div className="space-y-2.5">
            <Row label="Length"><LengthBoxes value={vol.length} onChange={v => setVol({ length: v })} system={sys} label="Length" /></Row>
            <Row label="Width"><LengthBoxes value={vol.width} onChange={v => setVol({ width: v })} system={sys} label="Width" /></Row>
            <Row label="Depth"><LengthBoxes value={vol.depth} onChange={v => setVol({ depth: v })} system={sys} label="Depth" placeholder={sys === 'metric' ? '0.1' : '0'} /></Row>
            <p className="pl-[5rem] text-[11px] text-muted-foreground">{sys === 'metric' ? 'A 10 cm slab: 0.1 m.' : 'A 4" slab: 0 ft 4 in.'}</p>
        </div>
    );

    const inputs = { room: roomInputs, area: areaInputs, linear: linearInputs, roof: roofInputs, volume: volumeInputs }[state.mode];
    const lineName = line.description.trim();
    const packUnit = output?.unit ?? u.area;
    const packs = final.packs;
    const packWord = (n: number) => pluralUnit(state.packName || 'pack', n);
    const canUse = !!output && final.lineQuantity > 0;

    // the calculation behind the final number, in the "work shown" style of the results
    const work = (() => {
        if (!output || output.value <= 0) return '';
        const parts = [formatQty(output.value, 3)];
        if (final.waste > 0) parts.push(`+ ${formatQty(final.waste, 1)}% = ${formatQty(final.withWaste, 3)}`);
        if (packs !== null && final.pack !== null) parts.push(`→ ${packs} × ${formatQty(final.pack, 3)}`);
        else if (final.quantity !== final.withWaste) parts.push('→ rounded up');
        return parts.length > 1 ? parts.join(' ') : '';
    })();

    return createPortal(
        <>
            <div
                className="modal-backdrop"
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <div
                    ref={panelRef}
                    className="modal-panel flex max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-xl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="quick-measure-title"
                    onKeyDown={onKeyDown}
                >
                    {/* header: what is being measured + units */}
                    <div className="border-b border-border px-4 pb-3 pt-2 sm:px-5 sm:pt-4">
                        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 id="quick-measure-title" className="text-base font-semibold">Quick measure</h3>
                                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="shrink-0">Line {lineNumber}</span>
                                    <span aria-hidden>·</span>
                                    <span className={cn('truncate', lineName ? 'text-foreground' : 'italic')}>{lineName || 'no item yet'}</span>
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <div role="radiogroup" aria-label="Units" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
                                    {([['imperial', 'ft-in'], ['metric', 'm']] as const).map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={sys === value}
                                            onClick={() => switchUnits(value)}
                                            className={cn('min-h-[34px] min-w-[44px] rounded-md px-2 text-xs font-semibold', sys === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Close"><XCircleIcon className="h-5 w-5" /></button>
                            </div>
                        </div>
                        {unitsNote && <p className="mt-1 text-right text-[11px] text-muted-foreground" role="status">{unitsNote}</p>}
                        <div role="tablist" aria-label="What to measure" className="mt-3 grid grid-cols-5 gap-1 rounded-xl bg-muted p-1">
                            {MEASURE_MODES.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={state.mode === m.id}
                                    onClick={() => setMode(m.id)}
                                    className={cn('min-h-[40px] rounded-lg text-xs font-semibold transition-colors sm:text-sm', state.mode === m.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* body */}
                    <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5" role="tabpanel" aria-label={MEASURE_MODES.find(m => m.id === state.mode)?.label}>
                        {recent.length > 0 && (
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent on this job</p>
                                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
                                    {recent.map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => reuseRecent(r)}
                                            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-left hover:border-primary/50"
                                            title="Measure again from these values"
                                        >
                                            <span className="block max-w-[11rem] truncate text-xs font-semibold">{r.label}</span>
                                            <span className="block text-[11px] tabular-nums text-muted-foreground">{formatQty(r.quantity, 3)} {pluralUnit(r.unit, r.quantity)} · {recentWhen(r.at)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {inputs}

                        {reading.issues.length > 0 && (
                            <ul className="space-y-0.5 text-xs font-medium text-warning" role="status">
                                {reading.issues.slice(0, 3).map(i => <li key={i}>{i}</li>)}
                            </ul>
                        )}

                        {/* results: pick the one to use */}
                        <div role="radiogroup" aria-label="Result to use" className="space-y-1.5">
                            {reading.outputs.map(o => {
                                const on = output?.key === o.key;
                                return (
                                    <button
                                        key={o.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        onClick={() => pick(o.key)}
                                        className={cn(
                                            'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                                            on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                                        )}
                                    >
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <span className={cn('h-4 w-4 shrink-0 rounded-full border-2', on ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--card))]' : 'border-input')} aria-hidden />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold">{o.label}</span>
                                                <span className="block truncate font-mono text-[11px] text-muted-foreground">{o.value > 0 ? o.work : '—'}</span>
                                            </span>
                                        </span>
                                        <span className="shrink-0 tabular-nums">
                                            <span className="text-base font-bold">{formatQty(o.value)}</span>
                                            <span className="ml-1 text-xs text-muted-foreground">{o.unit}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* waste + packs */}
                        <div className="grid gap-x-3 gap-y-1.5 rounded-xl border border-border p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-center sm:gap-y-2.5">
                            <span className={groupLabel}>Waste</span>
                            <div className="flex items-center gap-1.5">
                                {WASTE_CHOICES.map(w => (
                                    <Pill key={w} on={(parseNumber(state.waste) ?? 0) === w} onClick={() => set(s => ({ ...s, waste: w ? String(w) : '' }))} className="min-w-[44px] shrink-0">
                                        {w}%
                                    </Pill>
                                ))}
                                <NumBox value={state.waste} onChange={waste => set(s => ({ ...s, waste }))} suffix="%" label="Waste (%)" placeholder="other" className="flex-1 sm:max-w-[7rem]" invalid={state.waste.trim() !== '' && parseNumber(state.waste) === null} />
                            </div>
                            <span className={cn(groupLabel, 'mt-1.5 sm:mt-0')}>Packs</span>
                            <div className="flex items-center gap-1.5">
                                <span className="shrink-0 text-sm">1</span>
                                <select
                                    className="input h-11 w-auto shrink-0 py-1.5 pl-3 pr-8 text-base sm:text-sm"
                                    value={state.packName}
                                    onChange={e => set(s => ({ ...s, packName: e.target.value }))}
                                    aria-label="Pack name"
                                >
                                    {PACK_NAMES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <span className="shrink-0 text-sm">=</span>
                                <NumBox value={state.pack} onChange={pack => set(s => ({ ...s, pack }))} suffix={packUnit} label={`Pack size (${packUnit} per ${state.packName})`} placeholder="none" className="flex-1 sm:max-w-[9rem]" invalid={state.pack.trim() !== '' && !((parseNumber(state.pack) ?? 0) > 0)} />
                            </div>
                        </div>

                        {/* optional name: the recent list and the description summary use it */}
                        <input
                            className="input h-11 text-base sm:text-sm"
                            value={state.name}
                            maxLength={40}
                            onChange={e => set(s => ({ ...s, name: e.target.value }))}
                            placeholder="Name (optional), e.g. Kitchen"
                            aria-label="Measurement name (optional)"
                            enterKeyHint="done"
                        />
                    </div>

                    {/* footer: the quantity that goes on the line */}
                    <div className="border-t border-border bg-card px-4 pt-3 sm:px-5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quantity for line {lineNumber}</p>
                                <p className="text-2xl font-bold tabular-nums leading-tight" aria-live="polite">
                                    {formatQty(final.lineQuantity, 3)} <span className="text-sm font-semibold text-muted-foreground">{state.fillAs === 'pack' && packs !== null ? packWord(final.lineQuantity) : final.lineUnit}</span>
                                </p>
                                {work && <p className="truncate font-mono text-[11px] text-muted-foreground">{work}</p>}
                            </div>
                            {packs !== null && output && (
                                <div role="radiogroup" aria-label="Fill the line as" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
                                    {([['unit', `${formatQty(final.quantity, 3)} ${output.unit}`], ['pack', `${packs} ${packWord(packs)}`]] as const).map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={state.fillAs === value}
                                            onClick={() => set(s => ({ ...s, fillAs: value }))}
                                            className={cn('min-h-[36px] rounded-md px-2.5 text-xs font-semibold tabular-nums', state.fillAs === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                            <label className="flex min-h-[40px] cursor-pointer items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={addToDescription} onChange={e => setAddToDescription(e.target.checked)} />
                                <span>
                                    Add measurement to description
                                    <span className="block text-[11px] text-muted-foreground">Shows on the PDF. Off: only the quantity changes.</span>
                                </span>
                            </label>
                            <div className="flex items-center gap-2 sm:justify-end">
                                {(onPickSaved || onPickInventory) && (
                                    <button type="button" className="btn btn-outline min-h-[48px] shrink-0 px-3 sm:min-h-[42px]" onClick={() => setPicker(true)} title="Pick this line's item from the price book or inventory">
                                        <TagIcon className="h-4 w-4" /> Price book
                                    </button>
                                )}
                                <button type="button" className="btn btn-primary min-h-[48px] flex-1 sm:min-h-[42px] sm:flex-none" onClick={apply} disabled={!canUse}>
                                    Use this quantity
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <ItemPickerModal
                open={picker}
                onClose={() => setPicker(false)}
                savedItems={savedItems}
                inventoryItems={inventoryItems}
                showInventory={showInventory && !!onPickInventory}
                showPriceBook={!!onPickSaved}
                onPickSaved={s => pickedFromBook(() => { onPickSaved?.(s); followItem(`${s.name} ${s.description || ''}`); })}
                onPickInventory={inv => pickedFromBook(() => { onPickInventory?.(inv); followItem(`${inv.name} ${inv.unit || ''}`); })}
                title={`Item for line ${lineNumber}`}
                currency={currency}
            />
        </>,
        document.body,
    );
};

export default QuickMeasureSheet;
