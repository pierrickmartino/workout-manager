import Link from "next/link";

import { fetchHistory, type LoggedSession, type LoggedSet } from "@/lib/logs";

// Lists the user's completed Logged Sessions — the record side of the plan/record
// split — newest first, each with its Logged Sets and perceived difficulty.
export default async function HistoryPage() {
  const envelope = await fetchHistory();

  if (!envelope.success || !envelope.data) {
    return (
      <section>
        <h1>History</h1>
        <p role="alert">Could not load your history: {envelope.error ?? "unknown error"}</p>
      </section>
    );
  }

  const history = envelope.data;

  return (
    <section>
      <h1>Training history</h1>

      {history.length === 0 ? (
        <p>
          You haven&apos;t logged any sessions yet.{" "}
          <Link href="/sessions/new">Generate a workout →</Link>
        </p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0 }}>
          {history.map((entry) => (
            <li key={entry.id} style={{ marginBottom: "1.5rem" }}>
              <LoggedSessionCard entry={entry} />
            </li>
          ))}
        </ol>
      )}

      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </section>
  );
}

function LoggedSessionCard({ entry }: { entry: LoggedSession }) {
  return (
    <article>
      <h2 style={{ textTransform: "capitalize", marginBottom: "0.25rem" }}>
        {entry.training_type} session
      </h2>
      <p style={{ margin: "0 0 0.5rem" }}>{entry.performed_on}</p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Exercise</th>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Reps</th>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Load</th>
            <th style={{ textAlign: "left" }}>Difficulty (RPE)</th>
          </tr>
        </thead>
        <tbody>
          {entry.logged_sets.map((loggedSet) => (
            <LoggedSetRow key={loggedSet.position} loggedSet={loggedSet} />
          ))}
        </tbody>
      </table>
    </article>
  );
}

function LoggedSetRow({ loggedSet }: { loggedSet: LoggedSet }) {
  return (
    <tr>
      <td style={{ paddingRight: "1rem" }}>{loggedSet.exercise_name}</td>
      <td style={{ paddingRight: "1rem" }}>{loggedSet.reps}</td>
      <td style={{ paddingRight: "1rem" }}>{loggedSet.load ?? "—"}</td>
      <td>{loggedSet.perceived_difficulty ?? "—"}</td>
    </tr>
  );
}
