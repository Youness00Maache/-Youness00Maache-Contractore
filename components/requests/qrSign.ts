/**
 * Printable "Request a quote" QR sign (truck window, yard sign, counter card) and a PNG of the QR code
 * (Google Business Profile, flyers). Works from the <svg> rendered by qrcode.react.
 */
import { esc, safeUrl } from '../../utils/escapeHtml.ts';

/** Standalone SVG markup (xmlns added, so it renders as an image too). */
export const svgMarkup = (svg: SVGSVGElement): string => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
};

/** Link text without the protocol, for print ("contractordocs.app/r/acme-7k2mq"). */
export const displayUrl = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\?.*$/, '');

export const qrSignHtml = (input: { svg: string; url: string; company: string; logoUrl?: string; phone?: string }): string => {
    const logo = input.logoUrl ? safeUrl(input.logoUrl) : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(input.company || 'Request a quote')}</title>
<style>
@page { size: letter portrait; margin: 0.5in; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
.sheet { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 9.6in; text-align: center; }
.logo { max-height: 1.1in; max-width: 3.5in; object-fit: contain; margin-bottom: 0.2in; }
.company { font-size: 26pt; font-weight: 700; margin: 0 0 0.25in; }
h1 { font-size: 54pt; line-height: 1; margin: 0 0 0.15in; letter-spacing: -0.02em; }
.sub { font-size: 18pt; margin: 0 0 0.4in; color: #334155; }
.qr { width: 4.6in; height: 4.6in; padding: 0.15in; border: 3px solid #0f172a; border-radius: 0.2in; }
.qr svg { width: 100%; height: 100%; display: block; }
.url { margin-top: 0.3in; font-size: 16pt; font-weight: 600; word-break: break-all; }
.phone { margin-top: 0.1in; font-size: 16pt; color: #334155; }
</style></head><body><div class="sheet">
${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
<p class="company">${esc(input.company)}</p>
<h1>Request a quote</h1>
<p class="sub">Scan with your phone camera. Add photos of the job.</p>
<div class="qr">${input.svg}</div>
<p class="url">${esc(displayUrl(input.url))}</p>
${input.phone ? `<p class="phone">or call ${esc(input.phone)}</p>` : ''}
</div></body></html>`;
};

/** Prints an HTML page through a hidden iframe (only the sign is printed, not the app). */
export const printHtml = (html: string): Promise<void> =>
    new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('title', 'Print preview');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win?.document;
        if (!win || !doc) {
            iframe.remove();
            reject(new Error('Printing is not available in this browser.'));
            return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        let printed = false;
        const go = () => {
            if (printed) return;
            printed = true;
            try {
                win.focus();
                win.print();
                resolve();
            } catch (e) {
                reject(e);
            } finally {
                window.setTimeout(() => iframe.remove(), 60_000);
            }
        };
        const pending = Array.from(doc.images).filter(img => !img.complete);
        if (!pending.length) { window.setTimeout(go, 150); return; }
        let left = pending.length;
        const done = () => { left--; if (left <= 0) go(); };
        pending.forEach(img => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); });
        window.setTimeout(go, 3000);
    });

/** Renders the QR SVG to a PNG (white margin) and downloads it. */
export const downloadQrPng = async (svg: SVGSVGElement, fileName: string, size = 1200): Promise<void> => {
    const markup = svgMarkup(svg);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Could not draw the QR code.'));
            i.src = url;
        });
        const margin = Math.round(size * 0.08);
        const canvas = document.createElement('canvas');
        canvas.width = size + margin * 2;
        canvas.height = size + margin * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not draw the QR code.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, margin, margin, size, size);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
        URL.revokeObjectURL(url);
    }
};
