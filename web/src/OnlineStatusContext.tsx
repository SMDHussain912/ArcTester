import { ReactNode, createContext, useEffect, useState } from "react";

// Online/offline status context. Provides the client's current network status
// so that UI components can show an offline banner without importing main.tsx.
export const OnlineStatusContext = createContext<boolean>(true);

function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" && navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <OnlineStatusContext.Provider value={isOnline}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export { OnlineStatusProvider };
