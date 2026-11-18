import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

export function useExpoUpdates(): void {
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        fetchedRef.current = true;
      } catch {
        // offline or missing EAS Update config
      }
    })();
  }, []);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    return AppState.addEventListener("change", (state) => {
      if (state !== "active" || !fetchedRef.current) return;
      fetchedRef.current = false;
      void Updates.reloadAsync().catch(() => undefined);
    }).remove;
  }, []);
}