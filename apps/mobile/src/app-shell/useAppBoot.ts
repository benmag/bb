import { useEffect, useState } from "react";
import { getProfileStore } from "@/lib/native";
import { revealApp } from "./LaunchSplash";
import { resetLocalState, resetOnLaunch } from "./e2e";

export interface AppBootState {
  ready: boolean;
}

export function useAppBoot(): AppBootState {
  const [state, setState] = useState<AppBootState>({ ready: false });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getProfileStore().load();
      if (resetOnLaunch) await resetLocalState();
    })()
      .then(() => {
        if (!cancelled) {
          revealApp();
          setState({ ready: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          revealApp();
          setState({ ready: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
