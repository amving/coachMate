import type { ParentActionRequest, ParentMatchView } from "@coachmate/shared";
import { doc, onSnapshot } from "firebase/firestore";

import { db, isFirebaseConfigured } from "../firebase/client";

const parentActionApiUrl = import.meta.env.VITE_PARENT_ACTION_API_URL ?? "";

function noop() {
  return undefined;
}

export function subscribeToParentView(token: string, onData: (view: ParentMatchView | null) => void) {
  if (!isFirebaseConfigured || !token) {
    onData(null);
    return noop;
  }

  return onSnapshot(doc(db, "parentViews", token), (snapshot) => {
    onData(snapshot.exists() ? (snapshot.data() as ParentMatchView) : null);
  });
}

export async function postParentAction(body: ParentActionRequest) {
  if (!parentActionApiUrl) {
    throw new Error("VITE_PARENT_ACTION_API_URL ontbreekt");
  }

  const response = await fetch(parentActionApiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Parent action mislukt: ${response.status}`);
  }
}
