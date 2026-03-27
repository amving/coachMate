import { currentMatchSecond, formatClock, formatDateLabel, type ParentMatchView } from "@coachmate/shared";
import { useEffect, useState } from "react";

import {
  postParentAction,
  subscribeToParentView
} from "../services/parentPortalService";

function useInviteData(token: string) {
  const [view, setView] = useState<ParentMatchView | null>(null);

  useEffect(() => subscribeToParentView(token, setView), [token]);

  useEffect(() => {
    if (token) {
      void postParentAction({
        token,
        label: "Ouder",
        action: "open"
      }).catch(() => undefined);
    }
  }, [token]);

  return { view };
}

export function InvitePage({ token }: { token: string }) {
  const { view } = useInviteData(token);
  const [label, setLabel] = useState("Ouder");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  if (!view) {
    return (
      <main className="page">
        <section className="card hero">
          <h1>CoachMate ouderpagina</h1>
          <p>Deze uitnodiging wordt geladen. Controleer anders of de gedeelde link nog geldig is.</p>
        </section>
      </main>
    );
  }

  const child = view.players.find((player) => player.isInvitePlayer) ?? null;
  const attendingPlayers = view.players.filter((player) => player.attendanceStatus === "attending");
  const currentSecond = Math.min(view.durationMinutes * 60, currentMatchSecond(view.clock.elapsedSeconds, view.clock.isRunning, view.clock.runningSince, now));

  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">CoachMate live</p>
        <h1>{view.opponentName}</h1>
        <p>{formatDateLabel(view.kickoffAt)} - {view.location}</p>
        <div className="scoreboard">
          <strong>{view.scoreFor}</strong>
          <span>-</span>
          <strong>{view.scoreAgainst}</strong>
        </div>
        <div className="chips">
          <span className="chip chip-active">{view.status}</span>
          <span className="chip">{formatClock(currentSecond)}</span>
          <span className="chip">{view.lastWrite.label}</span>
        </div>
      </section>

      <section className="card">
        <h2>Jouw naam op de zijlijn</h2>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Bijv. Mama Noor" />
      </section>

      {child ? (
        <section className="card">
          <h2>Aanwezigheid van {child.firstName}</h2>
          <div className="chips">
            <button className={child.attendanceStatus === "attending" ? "chip chip-active" : "chip"} onClick={() => postParentAction({ token, label, action: "setAttendance", payload: { status: "attending" } })}>Ja</button>
            <button className={child.attendanceStatus === "absent" ? "chip chip-active" : "chip"} onClick={() => postParentAction({ token, label, action: "setAttendance", payload: { status: "absent" } })}>Nee</button>
            <button className={child.attendanceStatus === "pending" ? "chip chip-active" : "chip"} onClick={() => postParentAction({ token, label, action: "setAttendance", payload: { status: "pending" } })}>Open</button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2>Live meebeheer</h2>
        <div className="stack-sm">
          <button className="primary" onClick={() => postParentAction({ token, label, action: "toggleClock" })}>{view.clock.isRunning ? "Klok pauzeren" : "Klok starten"}</button>
          <button className="danger" onClick={() => postParentAction({ token, label, action: "addGoal", payload: { side: "opponent", scorerPlayerId: null } })}>Tegendoelpunt</button>
        </div>
        <div className="chips">
          {attendingPlayers.map((player) => (
            <button key={player.id} className="chip" onClick={() => postParentAction({ token, label, action: "addGoal", payload: { side: "coachmate", scorerPlayerId: player.id } })}>
              Goal {player.firstName}
            </button>
          ))}
          <button className="chip" onClick={() => postParentAction({ token, label, action: "addGoal", payload: { side: "coachmate", scorerPlayerId: null } })}>Goal zonder scorer</button>
        </div>
      </section>

      <section className="card">
        <h2>Invalbeurten</h2>
        <div className="stack">
          {attendingPlayers.map((player) => {
            const activeShift = view.shifts.find((shift) => shift.playerId === player.id && shift.endedAtSecond === null);
            return (
              <div key={player.id} className="row">
                <div>
                  <strong>#{player.jerseyNumber} {player.firstName}</strong>
                  <p>{activeShift ? "Speelt nu" : "Wisselspeler / klaar voor start"}</p>
                </div>
                <button className={activeShift ? "danger" : "primary"} onClick={() => postParentAction({ token, label, action: "toggleShift", payload: { playerId: player.id } })}>
                  {activeShift ? "Stop" : "Start"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Keepersplanning</h2>
        <div className="stack">
          {view.goalkeeperSlots.map((slot) => {
            return (
              <div key={slot.id} className="row">
                <div>
                  <strong>{formatClock(slot.startSecond)} - {formatClock(slot.endSecond)}</strong>
                  <p>{slot.playerName || "Nog niemand"}</p>
                </div>
                <span className="chip">{view.goalkeeperPlanMode}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Doelpuntenlog</h2>
        <div className="stack">
          {view.goals.map((goal) => {
            return (
              <div key={goal.id} className="row">
                <div>
                  <strong>{goal.side === "coachmate" ? "CoachMate" : "Tegenstander"} - {formatClock(goal.second)}</strong>
                  <p>{goal.scorerName || "Geen scorer"} - {goal.actorLabel}</p>
                </div>
                <button className="chip" onClick={() => postParentAction({ token, label, action: "removeGoal", payload: { goalId: goal.id } })}>Undo</button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
