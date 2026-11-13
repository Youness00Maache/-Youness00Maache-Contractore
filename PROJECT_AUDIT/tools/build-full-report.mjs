import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

const DIR = process.argv[2];
const OUT = process.argv[3];

const PARTS = [
  { file: '01_core_app_routing_auth_dashboard.md', title: 'Core app: routing, auth, data and dashboard', short: 'Core app', prefix: 'CORE' },
  { file: '02_documents_forms_templates_pdf.md', title: 'Document forms, templates and PDF generation', short: 'Documents & PDF', prefix: 'DOC' },
  { file: '03_ai_assistant_system.md', title: 'AI assistant system', short: 'AI assistant', prefix: 'AI' },
  { file: '04_clients_communication_gmail_sharing.md', title: 'Clients, Gmail, client portal and sharing', short: 'Clients & Gmail', prefix: 'COMM' },
  { file: '05_inventory_analytics_forum_settings_billing.md', title: 'Inventory, analytics, forum, settings and billing', short: 'Other screens & billing', prefix: 'VIEW' },
  { file: '06_database_security_build_infra.md', title: 'Database, security, build and repo health', short: 'DB, security & infra', prefix: 'SEC/DB/INFRA' },
];
const FILE_TO_PART = Object.fromEntries(PARTS.map((p, i) => [p.file, i + 1]));
const ISSUE_RX = /\b((?:CORE|DOC|AI|COMM|VIEW|SEC|DB|INFRA)-\d{3})\b/;
const SEVS = ['Critical', 'High', 'Medium', 'Low'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

// ---------- 1. Collect issues ----------
const issues = [];
for (const [i, p] of PARTS.entries()) {
  const lines = fs.readFileSync(path.join(DIR, p.file), 'utf8').split(/\r?\n/);
  lines.forEach((line, n) => {
    const m = line.match(/^#+\s*((?:CORE|DOC|AI|COMM|VIEW|SEC|DB|INFRA)-\d+)\s*[:.\-–—]?\s*(.*)$/);
    if (!m) return;
    const win = lines.slice(n + 1, n + 8).join(' ');
    let sev = (win.match(/Severity:?\**:?\s*\**\s*(Critical|High|Medium|Low)/i) || [])[1] || 'Low';
    sev = sev[0].toUpperCase() + sev.slice(1).toLowerCase();
    const status = ((win.match(/Status:?\**:?\s*\**\s*(CONFIRMED|LIKELY)/i) || [])[1] || '').toUpperCase();
    issues.push({ id: m[1], title: m[2].trim(), sev, status, part: i + 1 });
  });
}
const sevOf = Object.fromEntries(issues.map(x => [x.id, x.sev]));
const issueIds = new Set(issues.map(x => x.id));

// ---------- 2. Markdown renderer ----------
function makeMarked(partNo) {
  const marked = new Marked({ gfm: true });
  let openIssueDepth = 0;
  const fixHref = href => {
    if (!href) return href;
    let m = href.match(/^(?:\.\/)?(0[1-6]_[^#)]+\.md)(?:#(.*))?$/);
    let part = partNo, frag = null;
    if (m) { part = FILE_TO_PART[m[1]] || partNo; frag = m[2] || ''; }
    else if (href.startsWith('#')) frag = href.slice(1);
    else if (/^(?:\.\/)?00_ISSUE_INDEX\.md/.test(href)) return '#issue-index';
    else if (/^(?:\.\/)?06b_.*\.sql$/.test(href)) return '#p6-2b-consolidated-idempotent-schema-migration-copy-as-is';
    else return href;
    const im = frag && frag.toUpperCase().match(/^((?:CORE|DOC|AI|COMM|VIEW|SEC|DB|INFRA)-\d{3})/);
    if (im && issueIds.has(im[1])) return '#' + im[1].toLowerCase();
    return frag ? `#p${part}-${frag}` : `#part-${part}`;
  };
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = inner.replace(/<[^>]+>/g, '');
        let pre = '';
        if (openIssueDepth && depth <= openIssueDepth) { pre = '</section>'; openIssueDepth = 0; }
        if (depth === 1) return pre; // replaced by our own chapter title
        const im = text.match(/^\s*((?:CORE|DOC|AI|COMM|VIEW|SEC|DB|INFRA)-\d{3})/);
        if (im && issueIds.has(im[1])) {
          openIssueDepth = depth;
          const sev = sevOf[im[1]];
          const rest = inner.replace(im[1], '').replace(/^\s*[:.\-–—]\s*/, '');
          return `${pre}<section class="issue sev-${sev.toLowerCase()}" id="${im[1].toLowerCase()}"><h${depth} class="issue-h"><span class="iid">${im[1]}</span><span class="badge b-${sev.toLowerCase()}">${sev}</span><span class="ititle">${rest}</span></h${depth}>`;
        }
        const id = `p${partNo}-${slug(text)}`;
        return `${pre}<h${depth} id="${id}">${inner}</h${depth}>`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        return `<a href="${esc(fixHref(href))}"${title ? ` title="${esc(title)}"` : ''}>${inner}</a>`;
      },
      table(token) {
        // default rendering, wrapped for styling
        let h = '<div class="tbl"><table><thead><tr>';
        for (const c of token.header) h += `<th>${this.parser.parseInline(c.tokens)}</th>`;
        h += '</tr></thead><tbody>';
        for (const row of token.rows) {
          h += '<tr>' + row.map(c => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('') + '</tr>';
        }
        return h + '</tbody></table></div>';
      },
    },
  });
  return { marked, close: () => (openIssueDepth ? (openIssueDepth = 0, '</section>') : '') };
}

// Post-process: auto-link issue IDs and badge statuses in plain text (not in pre/code/a/headings).
function decorate(html) {
  const parts = html.split(/(<[^>]+>)/);
  const stack = { pre: 0, code: 0, a: 0, h: 0 };
  return parts.map(p => {
    if (p.startsWith('<')) {
      const m = p.match(/^<(\/)?(pre|code|a|h[1-6])\b/i);
      if (m) { const k = m[2][0] === 'h' && m[2].length === 2 ? 'h' : m[2].toLowerCase(); stack[k] += m[1] ? -1 : 1; }
      return p;
    }
    if (stack.pre || stack.code || stack.a) return p;
    let t = p.replace(/\b(CONFIRMED|LIKELY)\b/g, (_, w) => `<span class="st st-${w.toLowerCase()}">${w}</span>`);
    if (!stack.h) t = t.replace(/\b((?:CORE|DOC|AI|COMM|VIEW|SEC|DB|INFRA)-\d{3})\b/g, id => issueIds.has(id) ? `<a class="ref" href="#${id.toLowerCase()}">${id}</a>` : id);
    return t;
  }).join('')
    .replace(/(<strong>Severity:?<\/strong>:?\s*)(Critical|High|Medium|Low)\b/gi,
      (_, a, s) => `${a}<span class="badge b-${s.toLowerCase()}">${s[0].toUpperCase() + s.slice(1).toLowerCase()}</span>`);
}

// ---------- 3. Front matter from README ----------
const readme = fs.readFileSync(path.join(DIR, '00_README.md'), 'utf8');
let front = readme.slice(readme.indexOf('## 1. What you were working on'));
front = front
  .replace(/each report has the full walkthrough/g, 'each Part below has the full walkthrough')
  .replace(/The code for every fix is in the linked report\./g, 'The code for every fix is in the issue write-ups in Parts 1–6.')
  .replace(/in file 0(\d)/g, (_, n) => `in Part ${n}`)
  .replace(/\(file 0(\d)\)/g, (_, n) => `(Part ${n})`)
  .replace(/file 0(\d)/g, (_, n) => `Part ${n}`)
  .replace(/`06b_proposed_consolidated_schema\.sql`/g, 'the consolidated migration (Part 6, §2b)')
  .replace(/each linked report/g, 'each Part');
const fm = makeMarked(0);
let frontHtml = decorate(fm.marked.parse(front) + fm.close());

// ---------- 4. Parts ----------
let partsHtml = '';
const toc = [];
for (const [i, p] of PARTS.entries()) {
  const n = i + 1;
  let md = fs.readFileSync(path.join(DIR, p.file), 'utf8');
  const { marked, close } = makeMarked(n);
  const count = issues.filter(x => x.part === n);
  const bySev = SEVS.map(s => count.filter(x => x.sev === s).length);
  const subs = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
  toc.push({ n, title: p.title, subs, total: count.length, bySev });
  partsHtml += `<section class="part" id="part-${n}">
  <div class="part-head"><div class="part-no">Part ${n}</div><h1>${esc(p.title)}</h1>
  <div class="part-stats">${count.length} issues · ${SEVS.map((s, k) => `<span class="badge b-${s.toLowerCase()}">${bySev[k]} ${s}</span>`).join(' ')}</div></div>
  ${decorate(marked.parse(md) + close())}
  </section>`;
}

// ---------- 5. Dashboard + index ----------
const totals = SEVS.map(s => issues.filter(x => x.sev === s).length);
const maxPart = Math.max(...toc.map(t => t.total));
const colors = { Critical: '#b42318', High: '#d9730d', Medium: '#ca9a04', Low: '#64748b' };
const bars = toc.map(t => {
  let x = 0;
  const segs = SEVS.map((s, k) => {
    const w = (t.bySev[k] / maxPart) * 100;
    const r = w ? `<div class="seg" style="width:${w}%;background:${colors[s]}" title="${t.bySev[k]} ${s}">${t.bySev[k] >= 3 ? t.bySev[k] : ''}</div>` : '';
    x += w; return r;
  }).join('');
  return `<div class="bar-row"><div class="bar-label">Part ${t.n} · ${esc(PARTS[t.n - 1].short)}</div><div class="bar">${segs}</div><div class="bar-total">${t.total}</div></div>`;
}).join('');

const indexHtml = SEVS.map(s => {
  const rows = issues.filter(x => x.sev === s);
  return `<h3 id="index-${s.toLowerCase()}">${s} <span class="muted">(${rows.length})</span></h3>
  <div class="tbl"><table class="idx"><thead><tr><th>ID</th><th>Issue</th><th>Status</th><th>Area</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><a class="ref" href="#${r.id.toLowerCase()}">${r.id}</a></td><td>${new Marked().parseInline(r.title)}</td><td>${r.status ? `<span class="st st-${r.status.toLowerCase()}">${r.status}</span>` : '–'}</td><td>${esc(PARTS[r.part - 1].short)}</td></tr>`).join('')}
  </tbody></table></div>`;
}).join('');

const date = '10 November 2026';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ContractorDocs Project Audit</title>
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--accent:#1d3fbb;--accent-soft:#eef2ff;
--crit:#b42318;--high:#d9730d;--med:#a16207;--low:#64748b;}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:var(--ink);font:10.5pt/1.55 "Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:0 16px 64px}
a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
h1,h2,h3,h4,h5{line-height:1.25;color:var(--ink);break-after:avoid}
h2{font-size:17pt;margin:30px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--ink)}
h3{font-size:13pt;margin:22px 0 8px}
h4{font-size:11.5pt;margin:18px 0 6px}
h5{font-size:10.5pt;margin:14px 0 4px}
p,li{orphans:3;widows:3}
code{font:8.8pt/1.45 "Cascadia Mono",Consolas,"Courier New",monospace;font-variant-ligatures:none;font-feature-settings:"calt" 0,"liga" 0;background:#f1f5f9;border-radius:4px;padding:1px 4px;overflow-wrap:anywhere}
pre{font-variant-ligatures:none;font-feature-settings:"calt" 0,"liga" 0;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:8.4pt;line-height:1.5}
pre code{background:none;color:inherit;padding:0;font-size:inherit}
blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:0 6px 6px 0}
.tbl{width:100%;overflow-x:auto;margin:10px 0 16px}
table{border-collapse:collapse;width:100%;font-size:8.8pt;line-height:1.4}
th{background:var(--ink);color:#fff;text-align:left;font-weight:600;padding:6px 8px}
td{border-bottom:1px solid var(--line);padding:5px 8px;vertical-align:top;overflow-wrap:anywhere}
tr:nth-child(even) td{background:var(--soft)}
thead{display:table-header-group} tr{break-inside:avoid}
.muted{color:var(--muted);font-weight:400}
.badge{display:inline-block;font-size:7.8pt;font-weight:700;letter-spacing:.02em;padding:1px 7px;border-radius:999px;color:#fff;vertical-align:1px;white-space:nowrap}
.b-critical{background:var(--crit)}.b-high{background:var(--high)}.b-medium{background:#ca9a04}.b-low{background:var(--low)}
.st{display:inline-block;font-size:7.4pt;font-weight:700;padding:0 6px;border-radius:4px;border:1px solid;white-space:nowrap}
.st-confirmed{color:#166534;border-color:#86efac;background:#f0fdf4}.st-likely{color:#92400e;border-color:#fcd34d;background:#fffbeb}
a.ref{font-weight:600;white-space:nowrap}
/* cover */
.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;padding:56px 0 40px;break-after:page}
.cover .kicker{font-size:10pt;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}
.cover h1{font-size:40pt;line-height:1.05;margin:14px 0 10px;letter-spacing:-.02em}
.cover .sub{font-size:14pt;color:var(--muted);max-width:640px}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:36px 0 0}
.stat{border:1px solid var(--line);border-radius:10px;padding:14px;border-top:5px solid var(--ink)}
.stat .n{font-size:26pt;font-weight:800;line-height:1}.stat .l{font-size:9pt;color:var(--muted);margin-top:6px}
.stat.c{border-top-color:var(--crit)}.stat.h{border-top-color:var(--high)}.stat.m{border-top-color:#ca9a04}.stat.lo{border-top-color:var(--low)}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:9.5pt;color:var(--muted);border-top:1px solid var(--line);padding-top:16px}
.meta b{color:var(--ink);font-weight:600}
.alert{margin-top:28px;border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:14px 16px;font-size:10pt}
.alert b{color:var(--crit)}
/* toc */
.toc{break-after:page}
.toc ol{list-style:none;padding:0;margin:0}
.toc > ol > li{border-bottom:1px solid var(--line);padding:10px 0}
.toc .tp{display:flex;justify-content:space-between;gap:12px;font-weight:600;font-size:11.5pt}
.toc .subs{font-size:9pt;color:var(--muted);margin-top:3px}
.toc .subs a{color:var(--muted)}
/* dashboard */
.bars{margin:12px 0 6px}
.bar-row{display:grid;grid-template-columns:190px 1fr 36px;align-items:center;gap:10px;margin:6px 0;font-size:9.5pt}
.bar{display:flex;height:20px;background:var(--soft);border-radius:4px;overflow:hidden}
.seg{color:#fff;font-size:7.8pt;font-weight:700;display:flex;align-items:center;justify-content:center}
.bar-total{font-weight:700;text-align:right}
.legend{display:flex;gap:14px;font-size:8.8pt;color:var(--muted);margin-bottom:8px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
/* parts */
.part{break-before:page}
.part-head{background:var(--ink);color:#fff;border-radius:12px;padding:22px 24px;margin:8px 0 20px}
.part-head h1{color:#fff;font-size:22pt;margin:4px 0 10px}
.part-no{font-size:9pt;letter-spacing:.18em;text-transform:uppercase;color:#a5b4fc;font-weight:700}
.part-stats{font-size:9.5pt;color:#cbd5e1}
.front-sec{break-before:page}
/* issue cards */
section.issue{border:1px solid var(--line);border-left:5px solid var(--low);border-radius:8px;padding:2px 16px 8px;margin:16px 0;background:#fff}
section.issue.sev-critical{border-left-color:var(--crit)}section.issue.sev-high{border-left-color:var(--high)}section.issue.sev-medium{border-left-color:#ca9a04}
.issue-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:12px 0 8px!important;border:0!important;font-size:12pt!important;padding:0!important}
.iid{font-family:"Cascadia Code",Consolas,monospace;font-size:10pt;background:var(--ink);color:#fff;padding:1px 7px;border-radius:4px}
.ititle{flex:1 1 300px}
@page{size:A4;margin:16mm 14mm 18mm;
 @bottom-left{content:"ContractorDocs · Project Audit · ${date}";font:8pt "Segoe UI",sans-serif;color:#94a3b8}
 @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt "Segoe UI",sans-serif;color:#94a3b8}}
@page:first{@bottom-left{content:none}@bottom-right{content:none}}
@media print{main{max-width:none;padding:0}.cover{min-height:262mm}a.ref,a{color:var(--accent)}.tbl{overflow:visible}}
@media (max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}.cover h1{font-size:28pt}.bar-row{grid-template-columns:110px 1fr 30px}}
</style></head><body><main>

<section class="cover">
  <div>
    <div class="kicker">Full project audit</div>
    <h1>ContractorDocs</h1>
    <div class="sub">How the app works, every feature and button checked, everything that is broken or incomplete, and the concrete code fix for each problem.</div>
    <div class="stats">
      <div class="stat"><div class="n">${issues.length}</div><div class="l">Issues found</div></div>
      <div class="stat c"><div class="n">${totals[0]}</div><div class="l">Critical</div></div>
      <div class="stat h"><div class="n">${totals[1]}</div><div class="l">High</div></div>
      <div class="stat m"><div class="n">${totals[2]}</div><div class="l">Medium</div></div>
      <div class="stat lo"><div class="n">${totals[3]}</div><div class="l">Low</div></div>
    </div>
    <div class="alert"><b>Fix before anything else:</b> the app points at a Supabase project that no longer resolves (so login and data fail), a live Gemini API key is stored in plain text in the repo, the AI calls a retired model, and much of the live code is not committed. See §2.</div>
  </div>
  <div class="meta">
    <span>Project</span><b>ContractorDocs (contractordocs.app): React 18 + Vite + Supabase, deployed on Vercel</b>
    <span>Repository</span><b>Youness00Maache/Contractore, branch my-branch (last commit 25ae5cc, plus uncommitted work through Oct 2026)</b>
    <span>Date</span><b>${date}</b>
    <span>Scope</span><b>All live source code, 4 edge functions, 12 SQL files, build and config. No source files were changed.</b>
  </div>
</section>

<section class="toc"><h2 style="margin-top:8px">Contents</h2><ol>
  <li><div class="tp"><a href="#front">Executive summary: what you were building, critical blockers, how the app works, root causes, fix roadmap</a></div></li>
  <li><div class="tp"><a href="#dashboard">Issue dashboard and complete issue index</a><span class="muted">${issues.length}</span></div></li>
  ${toc.map(t => `<li><div class="tp"><a href="#part-${t.n}">Part ${t.n} · ${esc(t.title)}</a><span class="muted">${t.total} issues</span></div>
  <div class="subs">${t.subs.map(s => `<a href="#p${t.n}-${slug(new Marked().parseInline(s))}">${esc(s.replace(/`/g, ''))}</a>`).join(' · ')}</div></li>`).join('')}
</ol>
<p class="muted" style="font-size:9pt;margin-top:16px">How to read each issue: <span class="badge b-critical">Critical</span> <span class="badge b-high">High</span> <span class="badge b-medium">Medium</span> <span class="badge b-low">Low</span> severity. <span class="st st-confirmed">CONFIRMED</span> means the defect is visible in the code; <span class="st st-likely">LIKELY</span> means it depends on the live database or runtime. Every issue lists its location (file:line), what's wrong, the user impact, the root cause and a code fix. Issue IDs are clickable throughout.</p>
</section>

<section id="front"><h2 style="margin-top:0">Executive summary</h2>
${frontHtml}
</section>

<section class="front-sec" id="dashboard"><h2 style="margin-top:0">Issue dashboard</h2>
<div class="legend">${SEVS.map(s => `<span><i style="background:${colors[s]}"></i>${s} (${totals[SEVS.indexOf(s)]})</span>`).join('')}</div>
<div class="bars">${bars}</div>
<h2 id="issue-index">Complete issue index</h2>
<p class="muted">All ${issues.length} issues by severity. Click an ID to jump to its full write-up and fix. Some problems were found independently in more than one area and appear under several IDs; the root-cause table in the executive summary groups them.</p>
${indexHtml}
</section>

${partsHtml}
</main></body></html>`;

fs.writeFileSync(OUT, html);
console.log('issues', issues.length, totals, 'bytes', html.length);
