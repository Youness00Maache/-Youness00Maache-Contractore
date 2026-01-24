
import React, { useState, useEffect, useRef } from 'react';
import { MicIcon } from './Icons.tsx';

// Define the global window interface to include both standard and webkit prefixed versions
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface AIVoiceInputProps {
  onTranscript: (transcript: string) => void;
}

export const AIVoiceInput: React.FC<AIVoiceInputProps> = ({ onTranscript }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    // Check for support
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      // Set continuous to true so it doesn't stop after a single sentence
      recognition.continuous = true; 
      recognition.interimResults = false;
      recognition.lang = 'en-US'; 
      
      recognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript;
        onTranscript(transcript.trim());
      };
      
      recognition.onerror = (event: any) => {
        // 'no-speech' is just a timeout, ignore it.
        if (event.error === 'no-speech') {
            return;
        }
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
            alert("Microphone access denied. Please allow microphone access.");
            setIsListening(false);
        }
      };

      // Only reset state if it wasn't a manual stop (though with continuous=true, onend usually means error or manual stop)
      recognition.onend = () => {
         // We trust the state to manage the UI, but if it stopped unexpectedly, we sync up.
         // If we wanted it to restart automatically, we'd do it here, but manual toggle is safer for UX.
         setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
        setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript]);

  const toggleListening = () => {
    if (!isSupported) {
        alert("Voice typing is not supported in this browser. Please use Chrome or Edge.");
        return;
    }

    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error("Start recognition error:", err);
        setIsListening(false);
      }
    }
  };

  // Stop icon SVG
  const StopIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );

  return (
    <div className="flex flex-col items-center gap-2 text-center">
        <button
          className={`group w-16 h-16 rounded-xl flex items-center justify-center transition-all bg-card border border-border hover:bg-secondary ${isListening ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
          type="button"
          onClick={toggleListening}
          title={isListening ? 'Stop recording' : 'Start voice typing'}
        >
          {isListening ? (
            <div className="text-red-500 animate-pulse">
                <StopIcon />
            </div>
          ) : (
            <MicIcon className={`w-6 h-6 ${isSupported ? 'text-foreground/70' : 'text-muted-foreground/30'}`} />
          )}
        </button>
        <p className="h-4 text-xs text-foreground/70 font-medium">
          {isListening ? 'Tap to Stop' : 'Voice'}
        </p>
    </div>
  );
};

export default AIVoiceInput;
