import { InvitePage } from "./pages/InvitePage";

function tokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "invite" && parts[1]) {
    return parts[1];
  }
  return "";
}

export default function App() {
  const token = tokenFromPath();

  if (!token) {
    return (
      <main className="page">
        <section className="card hero">
          <p className="eyebrow">CoachMate</p>
          <h1>Ouderpagina</h1>
          <p>Open deze pagina via een persoonlijke link die de coach per speler en wedstrijd deelt.</p>
        </section>
      </main>
    );
  }

  return <InvitePage token={token} />;
}
