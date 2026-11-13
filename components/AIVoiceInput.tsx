import React, { useEffect, useRef, useState } from 'react';
import { MicIcon } from './Icons.tsx';

declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

interface AIVoiceInputProps {
    /** Called with each finished phrase (append it to your text). */
    onTranscript: (transcript: string) => void;
    /** Live, not-yet-final words (optional preview). */
    onInterim?: (text: string) => void;
    disabled?: boolean;
    /** compact = icon button (chat composer); labeled = button with a caption (forms). */
    variant?: 'compact' | 'labeled';
    className?: string;
}

/**
 * Continuous dictation (AI-011): the recognizer is created once, keeps listening across pauses
 * (browsers end a session after silence, so it restarts until the user presses Stop), and
 * parent re-renders never stop it because the callbacks are read from refs.
 */
export const AIVoiceInput: React.FC<AIVoiceInputProps> = ({ onTranscript, onInterim, disabled, variant = 'labeled', className = '' }) => {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const [problem, setProblem] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const wantListeningRef = useRef(false);
    const transcriptRef = useRef(onTranscript);
    const interimRef = useRef(onInterim);
    transcriptRef.current = onTranscript;
    interimRef.current = onInterim;

    useEffect(() => {
        const API = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
        if (!API) { setIsSupported(false); return; }
        const rec = new API();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        rec.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = String(result[0]?.transcript || '').trim();
                if (!text) continue;
                if (result.isFinal) transcriptRef.current(text);
                else interim += `${text} `;
            }
            interimRef.current?.(interim.trim());
        };
        rec.onerror = (event: any) => {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            wantListeningRef.current = false;
            setIsListening(false);
            interimRef.current?.('');
            setProblem(event.error === 'not-allowed' || event.error === 'service-not-allowed'
                ? 'Microphone access is blocked. Allow it in your browser settings.'
                : 'Voice input stopped. Tap the mic to try again.');
        };
        rec.onend = () => {
            if (wantListeningRef.current) {
                try { rec.start(); return; } catch { /* fall through */ }
            }
            wantListeningRef.current = false;
            setIsListening(false);
            interimRef.current?.('');
        };
        recognitionRef.current = rec;
        return () => {
            wantListeningRef.current = false;
            try { rec.abort(); } catch { /* ignore */ }
            recognitionRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (disabled && wantListeningRef.current) {
            wantListeningRef.current = false;
            try { recognitionRef.current?.stop(); } catch { /* ignore */ }
        }
    }, [disabled]);

    const toggle = () => {
        setProblem(null);
        if (!isSupported) {
            setProblem('Voice typing works in Chrome, Edge and Safari.');
            return;
        }
        const rec = recognitionRef.current;
        if (!rec) return;
        if (isListening) {
            wantListeningRef.current = false;
            try { rec.stop(); } catch { /* ignore */ }
            setIsListening(false);
            return;
        }
        try {
            wantListeningRef.current = true;
            rec.start();
            setIsListening(true);
        } catch {
            wantListeningRef.current = false;
            setIsListening(false);
        }
    };

    const label = isListening ? 'Stop dictation' : 'Dictate with your voice';
    const button = (
        <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            title={problem || label}
            aria-label={label}
            aria-pressed={isListening}
            className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${isListening
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'} ${variant === 'compact' ? className : ''}`}
        >
            {isListening ? (
                <>
                    <span className="absolute inset-0 animate-ping rounded-xl bg-destructive/20" aria-hidden />
                    <span className="relative h-3.5 w-3.5 rounded-sm bg-destructive" aria-hidden />
                </>
            ) : (
                <MicIcon className={`h-5 w-5 ${isSupported ? '' : 'opacity-40'}`} />
            )}
        </button>
    );

    if (variant === 'compact') {
        return (
            <span className="relative inline-flex">
                {button}
                {(problem || isListening) && (
                    <span
                        role="status"
                        className={`pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[220px] rounded-lg px-2.5 py-1.5 text-[11px] font-medium shadow-lift ${problem ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-background'}`}
                    >
                        {problem || 'Listening… tap to stop'}
                    </span>
                )}
            </span>
        );
    }
    return (
        <div className={`flex flex-col items-center gap-1 text-center ${className}`}>
            {button}
            <p className={`text-[11px] font-medium ${problem ? 'text-destructive' : 'text-muted-foreground'}`}>
                {problem || (isListening ? 'Listening… tap to stop' : 'Voice')}
            </p>
        </div>
    );
};

export default AIVoiceInput;
