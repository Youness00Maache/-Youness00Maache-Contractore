/**
 * Timeline source: a day on site. The Daily Job Report, the time sheets and the material logs of the same calendar day
 * (their own `date` field) become ONE entry that opens to the hours (per worker), the people, the materials and the
 * report text. Without a daily report the day still shows ("Hours and materials for Mon, Nov 3"). Pure.
 */
import { materialCost } from '../../finance.ts';
import { toNumber } from '../../../utils/money.ts';
import { arr, countWord, dateFieldWhen, dayOf, hoursText, isoOf, makeEvent, moneyText, num, plainText, rec, safely, str, toYmd } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineDoc, TimelineEvent, TimelineRow } from '../timelineTypes.ts';
import { dayHeading } from '../timelineFormat.ts';

const REPORT = 'Daily Job Report';
const SHEET = 'Time Sheet';
const MATERIALS = 'Material Log';

const dayKey = (doc: TimelineDoc, tz: string): string => toYmd(str(doc.data?.date)) || dayOf(doc.createdAt, tz) || '';

export const dailyReportEvents = ({ docs }: { docs: readonly TimelineDoc[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const byDay = new Map<string, TimelineDoc[]>();
    for (const doc of docs) {
        if (doc.type !== REPORT && doc.type !== SHEET && doc.type !== MATERIALS) continue;
        const key = dayKey(doc, ctx.tz);
        if (!key) continue;
        byDay.set(key, [...(byDay.get(key) || []), doc]);
    }

    const out: TimelineEvent[] = [];
    for (const [day, group] of byDay) {
        const reports = group.filter(d => d.type === REPORT);
        const sheets = group.filter(d => d.type === SHEET);
        const logs = group.filter(d => d.type === MATERIALS);

        // hours: the time sheets when there are any, else what the daily report says
        const perWorker = new Map<string, { regular: number; overtime: number }>();
        for (const s of sheets) {
            const name = str(s.data.workerName) || 'A worker';
            const cur = perWorker.get(name) || { regular: 0, overtime: 0 };
            cur.regular += Math.max(0, toNumber(s.data.hoursWorked));
            cur.overtime += Math.max(0, toNumber(s.data.overtimeHours));
            perWorker.set(name, cur);
        }
        const sheetHours = [...perWorker.values()].reduce((sum, w) => sum + w.regular + w.overtime, 0);
        const reportHours = reports.reduce((sum, r) => sum + Math.max(0, toNumber(r.data.laborHours)), 0);
        const hours = sheetHours > 0 ? sheetHours : reportHours;
        const reportCrew = Math.max(0, ...reports.map(r => num(r.data.crewSize) ?? 0));
        const people = perWorker.size > 0 ? perWorker.size : reportCrew;

        // materials: every item of every log of the day
        const items = logs.flatMap(l => (arr(l.data.items).length ? arr(l.data.items) : arr(l.data.materials)).map(rec).filter(i => str(i.name) || str(i.description)));
        const materialsCost = logs.reduce((sum, l) => sum + materialCost({ items: arr(l.data.items), materials: arr(l.data.materials) }), 0);

        const bits: string[] = [];
        if (hours > 0) bits.push(hoursText(hours));
        if (people > 0) bits.push(countWord(people, 'person', 'people'));
        if (items.length) bits.push(`${countWord(items.length, 'material')}${materialsCost > 0 ? ` (${moneyText(materialsCost, ctx.currency)})` : ''}`);

        const rows: TimelineRow[] = [];
        const weather = reports.map(r => [str(r.data.weather), str(r.data.temperature)].filter(Boolean).join(', ')).find(Boolean);
        if (weather) rows.push({ label: 'Weather', value: weather });
        if (reportCrew > 0 && perWorker.size === 0) rows.push({ label: 'On site', value: countWord(reportCrew, 'person', 'people') });
        for (const [name, w] of perWorker) rows.push({ label: name, value: `${hoursText(w.regular)}${w.overtime > 0 ? ` + ${hoursText(w.overtime)} overtime` : ''}` });
        if (perWorker.size === 0 && reportHours > 0) rows.push({ label: 'Labor', value: hoursText(reportHours) });
        items.slice(0, 8).forEach(i => {
            const qty = num(i.quantity);
            const name = str(i.name) || str(i.description);
            rows.push({ label: 'Material', value: `${qty !== null ? `${qty} × ` : ''}${name}${str(i.supplier) ? ` (${str(i.supplier)})` : ''}` });
        });
        if (items.length > 8) rows.push({ label: 'Material', value: `and ${items.length - 8} more` });

        const body = reports.map(r => plainText(r.data.content, 700)).filter(Boolean).join('\n\n');
        const heading = dayHeading(day, dayOf(new Date(ctx.now).toISOString(), ctx.tz) || day);
        const title = reports.length > 1 ? `${reports.length} daily reports for ${heading}`
            : reports.length === 1 ? `Daily report for ${heading}` : `Hours and materials for ${heading}`;

        // when: the latest save that happened on that day, else the day itself
        const whens = group.map(d => dateFieldWhen(d.data?.date, isoOf(d.createdAt) || new Date(ctx.now).toISOString(), ctx.tz));
        const timed = whens.filter(w => !w.dayOnly).map(w => w.at).sort();
        const at = timed.length ? timed[timed.length - 1] : whens[0].at;
        const first = reports[0] || sheets[0] || logs[0];

        out.push(makeEvent({
            id: `day:${day}:report`, at, dayOnly: timed.length === 0, kind: 'daily_report', source: 'dailyReports', group: 'field',
            title, detail: bits.join(' · ') || undefined, body: body || undefined, rows, actor: reports.length ? 'you' : 'crew',
            link: { type: 'document', docId: first.id, formType: first.type }, pending: group.some(d => d.pending) || undefined,
        }));
    }
    return out;
});
