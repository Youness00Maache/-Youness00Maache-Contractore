import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { XCircleIcon, PrinterIcon } from './Icons';
import { Button } from './ui/Button';
import { InventoryItem, UserProfile } from '../types';

interface PrintTagsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: InventoryItem;
    userProfile?: UserProfile;
}

const PrintTagsModal: React.FC<PrintTagsModalProps> = ({
    isOpen,
    onClose,
    item,
    userProfile,
}) => {
    const [showLogo, setShowLogo] = useState(true);
    const [showItemName, setShowItemName] = useState(true);
    const [showSpecs, setShowSpecs] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    if (!isOpen) return null;

    const handlePrint = () => {
        window.print();
    };

    // Generating 30 tags to mockup a standard Avery A4 sheet of stickers
    const tags = Array.from({ length: 30 });

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
                <div
                    className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-card border border-white/20 dark:border-border rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                        <XCircleIcon className="w-6 h-6" />
                    </button>

                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-foreground mb-1 pr-8">
                            Print Physical Tags
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Customize and print QR code stickers for '{item.name}'. Designed for standard 30-per-page A4 sticker sheets.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="space-y-4 bg-secondary/30 p-4 rounded-xl border border-border">
                                <h3 className="font-semibold px-1">Label Customization</h3>

                                <label className="flex items-center justify-between px-1 cursor-pointer">
                                    <span className="text-sm font-medium">Include Company Logo</span>
                                    <input
                                        type="checkbox"
                                        checked={showLogo}
                                        onChange={(e) => setShowLogo(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between px-1 cursor-pointer">
                                    <span className="text-sm font-medium">Include Item Name</span>
                                    <input
                                        type="checkbox"
                                        checked={showItemName}
                                        onChange={(e) => setShowItemName(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between px-1 cursor-pointer">
                                    <span className="text-sm font-medium">Include Specifications</span>
                                    <input
                                        type="checkbox"
                                        checked={showSpecs}
                                        onChange={(e) => setShowSpecs(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                                    />
                                </label>
                            </div>

                            <Button
                                onClick={handlePrint}
                                className="w-full flex items-center justify-center gap-2"
                            >
                                <PrinterIcon className="w-5 h-5" />
                                Print Tags
                            </Button>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3 text-muted-foreground text-sm">Live Preview</h3>
                            <div className="bg-white border border-border rounded-xl shadow-sm p-4 w-[250px] mx-auto">
                                <div className="border-2 border-dashed border-gray-200 p-3 rounded-lg flex flex-col items-center justify-center bg-white text-black text-center min-h-[140px]">
                                    {showLogo && userProfile?.logoUrl && (
                                        <img src={userProfile.logoUrl} alt="Logo" className="max-h-6 mb-2 object-contain" />
                                    )}
                                    <QRCodeSVG value={item.id} size={64} level="M" />
                                    {showItemName && (
                                        <p className="text-xs font-bold mt-2 truncate w-full text-black">{item.name}</p>
                                    )}
                                    {showSpecs && item.category && (
                                        <p className="text-[10px] text-gray-500 mt-0.5 truncate w-full">{item.category}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Printable Area - Using standard A4 dimensions for 30 labels (3 columns x 10 rows) */}
            <div className="hidden print:block w-[210mm] h-[297mm] bg-white m-0 p-[10mm]">
                <div className="grid grid-cols-3 gap-x-[7mm] gap-y-[0mm] h-full content-start">
                    {tags.map((_, i) => (
                        <div key={i} className="h-[25.4mm] w-[60mm] flex flex-col items-center justify-center text-center overflow-hidden font-sans border border-transparent">
                            {showLogo && userProfile?.logoUrl && (
                                <img src={userProfile.logoUrl} alt="Logo" className="max-h-[5mm] mb-[1mm] object-contain" />
                            )}
                            <QRCodeSVG value={item.id} size={50} level="M" />
                            {showItemName && (
                                <p className="text-[9px] font-bold mt-[1mm] truncate w-full text-black leading-tight m-0">{item.name}</p>
                            )}
                            {showSpecs && item.category && (
                                <p className="text-[7.5px] text-gray-500 mt-[0.5mm] truncate w-full m-0">{item.category}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};

export default PrintTagsModal;
