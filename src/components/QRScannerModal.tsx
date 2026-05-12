import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { XCircleIcon } from './Icons';

interface QRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScanSuccess: (decodedText: string) => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({
    isOpen,
    onClose,
    onScanSuccess,
}) => {
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        // Configuration
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
        };

        const scanner = new Html5QrcodeScanner(
            "qr-reader",
            config,
            false // verbose flag
        );

        scanner.render(
            (decodedText) => {
                // We got a successful scan, stop the camera and fire callback
                setScanError(null);
                scanner.clear();
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                // Ignore scanning errors (like "No QR code found"), but could log if needed
            }
        );

        // Cleanup on unmount or close
        return () => {
            scanner.clear().catch(e => console.log('Failed to clear scanner', e));
        };
    }, [isOpen, onScanSuccess]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-md bg-white dark:bg-card border border-white/20 dark:border-border rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 z-10"
                >
                    <XCircleIcon className="w-6 h-6" />
                </button>

                <div className="mb-4">
                    <h2 className="text-xl font-bold text-foreground mb-1 pr-8">
                        Scan Item QR Code
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Position the QR code inside the frame to scan.
                    </p>
                </div>

                {/* The div that html5-qrcode targets */}
                <div id="qr-reader" className="w-[100%] max-w-[100%] overflow-hidden rounded-xl bg-black border-2 border-primary/20"></div>

                {scanError && (
                    <p className="text-red-500 text-sm mt-4 text-center">{scanError}</p>
                )}
            </div>
        </div>
    );
};

export default QRScannerModal;
