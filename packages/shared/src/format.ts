export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatMinutes(totalSeconds: number): string {
  return `${Math.round(totalSeconds / 60)} min`;
}

export function formatDateLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function currentMatchSecond(
  elapsedSeconds: number,
  isRunning: boolean,
  runningSince: string | null,
  now = Date.now()
): number {
  if (!isRunning || !runningSince) {
    return elapsedSeconds;
  }

  const startedAt = new Date(runningSince).getTime();
  const extra = Number.isFinite(startedAt) ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  return elapsedSeconds + extra;
}
