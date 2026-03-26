import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient, DiceRollResponse } from '../services/api';

// ============================================
// Dice Roll Hook
// Manages the full dice roll cycle:
// request -> API call -> animation delay -> result
// ============================================

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

interface UseDiceRollOptions {
  sessionId: string;
  onRollComplete?: (result: DiceRollResponse) => void;
  onError?: (error: string) => void;
}

interface UseDiceRollReturn {
  /** Trigger a dice roll */
  rollDice: (diceType: DiceType, actionType: string, modifiers?: number) => Promise<DiceRollResponse | null>;
  /** Whether a roll is in progress */
  isRolling: boolean;
  /** The result of the last roll */
  result: DiceRollResponse | null;
  /** Error from last roll attempt */
  error: string | null;
  /** Clear the current result */
  clearResult: () => void;
  /** The dice type currently being rolled */
  currentDiceType: DiceType | null;
}

export function useDiceRoll({ sessionId, onRollComplete, onError }: UseDiceRollOptions): UseDiceRollReturn {
  const [isRolling, setIsRolling] = useState(false);
  const [result, setResult] = useState<DiceRollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDiceType, setCurrentDiceType] = useState<DiceType | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rollDice = useCallback(async (
    diceType: DiceType,
    actionType: string,
    modifiers?: number,
  ): Promise<DiceRollResponse | null> => {
    setIsRolling(true);
    setError(null);
    setResult(null);
    setCurrentDiceType(diceType);

    try {
      const response = await apiClient.game.rollDice(sessionId, {
        diceType,
        actionType,
        modifiers,
      });

      if (!mountedRef.current) return null;

      setResult(response);
      onRollComplete?.(response);
      return response;
    } catch (err) {
      if (!mountedRef.current) return null;

      const message = err instanceof Error ? err.message : 'Dice roll failed';
      setError(message);
      onError?.(message);
      return null;
    } finally {
      if (mountedRef.current) {
        setIsRolling(false);
      }
    }
  }, [sessionId, onRollComplete, onError]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setCurrentDiceType(null);
  }, []);

  return {
    rollDice,
    isRolling,
    result,
    error,
    clearResult,
    currentDiceType,
  };
}
