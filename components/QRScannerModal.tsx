import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraIcon, ImageIcon, ZapIcon } from './Icons.tsx';
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
interface TorchControl { isSupported(): boolean; apply(on: boolean): Promise<void> }
interface CameraOption { id: string; label: string }

/**
 * Camera QR scanner. The camera starts once per open (the callback is kept in a ref, so parent
 * re-renders never restart it: VIEW-026) and is always stopped on close/unmount.
 * Like the original scanner it can also read a saved photo, switch cameras and turn on the flashlight;
 * those controls only appear when the device supports them.
 */
const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onScanSuccess, title = 'Scan a label' }) => {
  const reactId = useId();
  const regionId = `qr-region-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const fileRegionId = `${regionId}-file`;
  const cbRef = useRef(onScanSuccess);
  cbRef.current = onScanSuccess;
  const doneRef = useRef(false);
  const stoppedRef = useRef<Promise<void>>(Promise.resolve());
  const torchRef = useRef<TorchControl | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>('starting');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  /** Camera picked by the user (null = the back camera by default). */
  const [cameraId, setCameraId] = useState<string | null>(null);
  /** Camera actually running (shown as selected until the user picks one). */
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [torch, setTorch] = useState<{ on: boolean; busy: boolean } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');

  const deliver = (text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (navigator.vibrate) navigator.vibrate(60);
    cbRef.current(text);
  };

  useEffect(() => {
    if (!isOpen) return;
    doneRef.current = false;
    setFileError('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let started = false;
    setState('starting');
    setMessage('');
    setTorch(null);
    torchRef.current = null;

    const start = async () => {
      // wait one frame so the region element exists in the portal, and for a previous camera to release
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await stoppedRef.current;
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        setMessage('This browser cannot use the camera. Scan a photo or type the code printed under the QR instead.');
        return;
      }
      try {
        scanner = new Html5Qrcode(regionId, { verbose: false } as any);
        await scanner.start(
          cameraId || { facingMode: 'environment' },
          { fps: 10, qrbox: (w: number, h: number) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; }, aspectRatio: 1 } as any,
          (decoded) => deliver(decoded),
          () => { /* frame without a code: ignore */ },
        );
        started = true;
        if (cancelled) return;
        setState('scanning');
        const s = scanner;
        try { setActiveCameraId(s.getRunningTrackSettings().deviceId || cameraId); } catch { setActiveCameraId(cameraId); }
        try {
          const t = s.getRunningTrackCameraCapabilities().torchFeature();
          if (t.isSupported()) { torchRef.current = t; setTorch({ on: false, busy: false }); }
        } catch { /* no torch API */ }
        // Labels are only readable once camera permission is granted, so list cameras after a start
        // (enumerateDevices does not open a second stream, unlike Html5Qrcode.getCameras()).
        navigator.mediaDevices.enumerateDevices?.().then((list) => {
          if (cancelled) return;
          setCameras(list.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d) => ({ id: d.deviceId, label: d.label })));
        }, () => undefined);
      } catch (e: any) {
        if (cancelled) return;
        const msg = String(e?.message || e || '');
        if (/permission|notallowed|denied/i.test(msg)) {
          setState('denied');
          setMessage('Camera access was blocked. Allow camera access in your browser settings, or scan a photo / type the code below.');
        } else if (/notfound|no camera|requested device not found|overconstrained/i.test(msg)) {
          setState('unavailable');
          setMessage('No camera was found on this device. Scan a photo or type the code below instead.');
        } else {
          setState('error');
          setMessage('The camera could not be started. Scan a photo or type the code below instead.');
        }
      }
    };
    const run = start();

    return () => {
      cancelled = true;
      torchRef.current = null;
      // Let a start in progress finish, then release the camera. The next start (camera switch) waits
      // for this, so the old scanner's clear() never wipes the new video.
      stoppedRef.current = run.then(async () => {
        if (!scanner) return;
        const s = scanner;
        if (started) await s.stop().catch(() => undefined);
        try { s.clear(); } catch { /* already cleared */ }
      });
    };
  }, [isOpen, regionId, cameraId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    const t = torchRef.current;
    if (!t || !torch || torch.busy) return;
    const next = !torch.on;
    setTorch({ on: torch.on, busy: true });
    try {
      await t.apply(next);
      setTorch({ on: next, busy: false });
    } catch {
      setTorch({ on: torch.on, busy: false });
    }
  };

  const scanPhoto = async (file: File) => {
    setFileBusy(true);
    setFileError('');
    // A separate, hidden reader: the camera scanner cannot scan files while it is running.
    let reader: Html5Qrcode | null = null;
    try {
      reader = new Html5Qrcode(fileRegionId, { verbose: false } as any);
      const text = await reader.scanFile(file, false);
      deliver(text);
    } catch {
      setFileError('No QR code was found in that photo. Try a sharper, closer picture of the label.');
    } finally {
      try { reader?.clear(); } catch { /* ignore */ }
      setFileBusy(false);
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) cbRef.current(manual.trim());
  };

  const selectedCamera = cameraId ?? activeCameraId ?? '';

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
        <div id={fileRegionId} className="hidden" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-2">
          {cameras.length > 1 && (
            <select
              className="input h-10 w-full py-1.5 text-sm"
              value={cameras.some((c) => c.id === selectedCamera) ? selectedCamera : ''}
              onChange={(e) => e.target.value && setCameraId(e.target.value)}
              aria-label="Camera"
            >
              {!cameras.some((c) => c.id === selectedCamera) && <option value="">Back camera</option>}
              {cameras.map((c, i) => <option key={c.id} value={c.id}>{c.label || `Camera ${i + 1}`}</option>)}
            </select>
          )}
          {state === 'scanning' && torch && (
            <button type="button" className={`btn h-10 flex-1 ${torch.on ? 'btn-primary' : 'btn-outline'}`} onClick={toggleTorch} disabled={torch.busy} aria-pressed={torch.on}>
              <ZapIcon className="h-4 w-4" /> {torch.on ? 'Light on' : 'Light'}
            </button>
          )}
          <button type="button" className="btn btn-outline h-10 flex-1" onClick={() => fileRef.current?.click()} disabled={fileBusy}>
            <ImageIcon className="h-4 w-4" /> {fileBusy ? 'Reading photo…' : 'Scan a photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanPhoto(f); }}
          />
        </div>
        {fileError && <p className="text-sm text-destructive" role="alert">{fileError}</p>}

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
