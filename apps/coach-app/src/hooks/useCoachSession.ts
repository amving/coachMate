import type { User } from "firebase/auth";
import { useEffect, useState } from "react";

import { subscribeCoachAuth } from "../auth/client";

export function useCoachSession() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    return subscribeCoachAuth((nextUser) => {
      setUser(nextUser);
      setIsReady(true);
    });
  }, []);

  return {
    user,
    isReady
  };
}
