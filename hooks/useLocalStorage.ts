import { useState, useEffect, Dispatch, SetStateAction, useCallback } from 'react';

export function useLocalStorage<T,>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: Dispatch<SetStateAction<T>> = useCallback((value) => {
    try {
      setStoredValue(prev => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (e) {
          if (e instanceof Error && e.name === 'QuotaExceededError') {
            console.warn(`localStorage quota exceeded for key "${key}". Clearing old data...`);
            // Try to clear some space - delete the oldest item
            try {
              const allKeys = Object.keys(window.localStorage);
              if (allKeys.length > 0) {
                const oldestKey = allKeys[0];
                window.localStorage.removeItem(oldestKey);
                // Retry saving
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
              }
            } catch (clearError) {
              console.error('Could not free up localStorage space:', clearError);
            }
          } else {
            throw e;
          }
        }
        return valueToStore;
      });
    } catch (error) {
      console.error('localStorage error:', error);
    }
  }, [key]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        try {
            setStoredValue(JSON.parse(e.newValue || 'null'));
        } catch (error) {
            console.error('Error parsing stored value:', error);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return [storedValue, setValue];
}
