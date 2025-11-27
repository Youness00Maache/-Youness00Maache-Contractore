
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from './ui/Card.tsx';
import { Button } from './ui/Button.tsx';
import { StarIcon, CheckCircleIcon, XCircleIcon } from './Icons.tsx';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-blue-950/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <Card className="w-full max-w-md shadow-2xl border-blue-200 animate-in zoom-in-95 duration-200 relative overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-blue-600 to-indigo-600"></div>
        <div className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white cursor-pointer hover:bg-white/20 transition-colors" onClick={onClose}>
            <XCircleIcon className="w-6 h-6" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center mt-8">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-4 transform -rotate-6">
                <StarIcon className="w-8 h-8 text-yellow-400 fill-current" />
            </div>
            <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-bold text-blue-950">Upgrade to Pro</CardTitle>
                <CardDescription className="text-base">
                    <span className="font-semibold text-blue-600">{featureName}</span> is a Pro feature.
                </CardDescription>
            </CardHeader>
        </div>

        <CardContent className="space-y-4 pt-4">
            <p className="text-center text-muted-foreground text-sm mb-4">
                Unlock the full potential of your contracting business.
            </p>
            
            <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Unlimited Jobs & Clients</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Premium Document Templates</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Change Orders & Warranties</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Direct Gmail Integration</span>
                </div>
            </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 bg-blue-50/50 pt-6">
            <Button className="w-full h-12 text-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
                Get Pro for $19/mo
            </Button>
            <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Maybe Later
            </button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default UpgradeModal;
