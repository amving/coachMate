import type { MatchInvite, MatchRecord, Player, Season } from "@coachmate/shared";
import { useEffect, useState } from "react";

import { isFirebaseConfigured } from "../firebase/client";
import {
  subscribeToInvites,
  subscribeToMatches,
  subscribeToPlayers,
  subscribeToSeasons
} from "../services/coachMateService";

export function useCoachData() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [invites, setInvites] = useState<MatchInvite[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined;
    }

    const unsubscribeSeasons = subscribeToSeasons(setSeasons);
    const unsubscribePlayers = subscribeToPlayers(setPlayers);
    const unsubscribeMatches = subscribeToMatches(setMatches);
    const unsubscribeInvites = subscribeToInvites(setInvites);

    return () => {
      unsubscribeSeasons();
      unsubscribePlayers();
      unsubscribeMatches();
      unsubscribeInvites();
    };
  }, []);

  return {
    isConfigured: isFirebaseConfigured,
    seasons,
    players,
    matches,
    invites
  };
}
