import React, { useState, useEffect, useRef } from 'react';
import { MicIcon } from './Icons.tsx';

// FIX: Add type definitions for the non-standard Speech Recognition API to resolve TypeScript errors.
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
  // FIX: Changed SpeechRecognitionError to the defined SpeechRecognitionErrorEvent type to resolve the name not found error.
  readonly error?: SpeechRecognitionErrorEvent;
}

// Based on MDN for SpeechRecognitionErrorEvent
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}


interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start(): void;
  stop(): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface AIVoiceInputProps {
  onTranscript: (transcript: string) => void;
}

export const AIVoiceInput: React.FC<AIVoiceInputProps> = ({ onTranscript }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const manuallyStoppedRef = useRef(false);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = false;
      
      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript;
        onTranscript(transcript.trim());
      };
      
      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
             alert(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (!manuallyStoppedRef.current) {
          setTimeout(() => {
            if (recognitionRef.current && !manuallyStoppedRef.current && isListening) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.error("Could not restart recognition:", e);
                setIsListening(false);
              }
            }
          }, 100);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } else {
      console.warn("Speech Recognition API is not supported in this browser.");
    }

    return () => {
      if (recognitionRef.current) {
        manuallyStoppedRef.current = true;
        recognitionRef.current.stop();
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
    };
  }, [onTranscript]);

  const handleClick = async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
        alert("Sorry, your browser does not support speech recognition.");
        return;
    }

    if (isListening) {
      manuallyStoppedRef.current = true;
      recognition.stop();
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        manuallyStoppedRef.current = false;
        recognition.start();
        setIsListening(true);

      } catch (err) {
        console.error("Microphone access error:", err);
        if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'not-allowed')) {
          alert("Microphone access was denied. Please allow microphone permissions in your browser's site settings to use the voice feature.");
        } else {
          alert("Could not access the microphone. Please ensure it is connected and not in use by another application.");
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
        <button
          className={`group w-16 h-16 rounded-xl flex items-center justify-center transition-colors bg-card border border-border hover:bg-secondary`}
          type="button"
          onClick={handleClick}
          title={isListening ? 'Stop listening' : 'Start listening'}
        >
          {isListening ? (
            <div className="w-6 h-6 rounded-sm animate-spin bg-primary" style={{ animationDuration: '3s' }}/>
          ) : (
            <MicIcon className="w-6 h-6 text-foreground/70" />
          )}
        </button>
        <p className="h-4 text-xs text-foreground/70">
          {isListening ? 'Listening...' : 'Voice'}
        </p>
    </div>
  );
};

export default AIVoiceInput;