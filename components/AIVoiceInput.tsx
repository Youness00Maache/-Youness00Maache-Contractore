
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
  const manuallyStoppedRef = useRef(false);

  useEffect(() => {
    // Check for support
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false; // Better for mobile compatibility
      recognition.interimResults = false;
      recognition.lang = 'en-US'; // Default, ideally passed from props/settings
      
      recognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript;
        onTranscript(transcript.trim());
      };
      
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech') {
            setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript]);

  const handleClick = async () => {
    const recognition = recognitionRef.current;
    
    if (!recognition) {
        // Fallback message for unsupported browsers (like iOS Safari currently)
        alert("Voice input is not fully supported in this browser. Please try Chrome on Android or Desktop.");
        return;
    }

    if (isListening) {
      manuallyStoppedRef.current = true;
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        // Simple check to ensure microphone permission is possible
        // Note: On some mobile browsers, getUserMedia might be required to prompt permission first
        // but SpeechRecognition API usually handles its own permission prompt.
        manuallyStoppedRef.current = false;
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error("Start recognition error:", err);
        setIsListening(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
        <button
          className={`group w-16 h-16 rounded-xl flex items-center justify-center transition-all bg-card border border-border hover:bg-secondary ${isListening ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
          type="button"
          onClick={handleClick}
          title={isListening ? 'Stop listening' : 'Start listening'}
        >
          {isListening ? (
            <div className="w-6 h-6 rounded-full bg-red-500 animate-ping" />
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
