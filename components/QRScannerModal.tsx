import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraIcon } from './Icons.tsx';
import { Modal } from './viewKit.tsx';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the raw decoded text (use parseInventoryCode to get an item id). */
  onScanSuccess: (decodedText: string) => void;
  title?: string;
}

/** Re-exported for backward compatibility; lives in utils/stockMath.ts so callers don't load the camera library. */
export { parseInventoryCode } from '../utils/stockMath.ts';

type CamState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';

/**
 * Camera QR scanner. The camera starts once per open (the callback is kept in a ref, so parent
 * re-renders never restart it: VIEW-026) and is always stopped on close/unmount.
 */
const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onScanSuccess, title = 'Scan a label' }) => {
  const reactId = useId();
  const regionId = `qr-region-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const cbRef = useRef(onScanSuccess);
  cbRef.current = onScanSuccess;
  const [state, setState] = useState<CamState>('starting');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let done = false;
    let scanner: Html5Qrcode | null = null;
    let started = false;
    setState('starting');
    setMessage('');

    const start = async () => {
      // wait one frame so the region element exists in the portal
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        setMessage('This browser cannot use the camera. Type the code printed under the QR instead.');
        return;
      }
      try {
        scanner = new Html5Qrcode(regionId, { verbose: false } as any);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w: number, h: number) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; }, aspectRatio: 1 } as any,
          (decoded) => {
            if (done) return;
            done = true;
            if (navigator.vibrate) navigator.vibrate(60);
            cbRef.current(decoded);
          },
          () => { /* frame without a code: ignore */ },
        );
        started = true;
        if (cancelled) { scanner.stop().catch(() => undefined); return; }
        setState('scanning');
      } catch (e: any) {
        if (cancelled) return;
        const msg = String(e?.message || e || '');
        if (/permission|notallowed|denied/i.test(msg)) {
          setState('denied');
          setMessage('Camera access was blocked. Allow camera access in your browser settings, or type the code below.');
        } else if (/notfound|no camera|requested device not found|overconstrained/i.test(msg)) {
          setState('unavailable');
          setMessage('No camera was found on this device. Type the code below instead.');
        } else {
          setState('error');
          setMessage('The camera could not be started. Type the code below instead.');
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      if (scanner) {
        const s = scanner;
        const stop = started ? s.stop().catch(() => undefined) : Promise.resolve();
        stop.finally(() => { try { s.clear(); } catch { /* already cleared */ } });
      }
    };
  }, [isOpen, regionId]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) cbRef.current(manual.trim());
  };

  return (
    <Modal open={isOpen} onClose={onClose} size="sm" title={title} description="Point the camera at the QR code on the label.">
      <div className="space-y-4">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <div id={regionId} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {state !== 'scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <CameraIcon className={`h-10 w-10 ${state === 'starting' ? 'animate-pulse opacity-80' : 'opacity-60'}`} />
              <p className="text-sm">{state === 'starting' ? 'Starting camera…' : message}</p>
            </div>
          )}
        </div>
        <form onSubmit={submitManual} className="flex gap-2">
          <label htmlFor={`${regionId}-manual`} className="sr-only">Code</label>
          <input id={`${regionId}-manual`} className="input flex-1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste the code / link" autoComplete="off" />
          <button type="submit" className="btn btn-outline" disabled={!manual.trim()}>Open</button>
        </form>
      </div>
    </Modal>
  );
};

export default QRScannerModal;
