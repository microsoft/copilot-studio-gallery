import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { changeStatus, createIdea, errorMessage, loadIdeas, PRIORITIES, STATUSES } from "./ideas";
import type { Idea, Priority, Status } from "./ideas";

export default function App() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [pendingId, setPendingId] = useState<number>();
  const [connected, setConnected] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const loadVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const rows = await loadIdeas();
      if (version === loadVersion.current) { setIdeas(rows); setConnected(true); }
    }
    catch (e) { if (version === loadVersion.current) { setError(errorMessage(e)); setConnected(false); } }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const details = String(data.get("details") ?? "").trim();
    const chosen = String(data.get("priority") ?? "");
    const selectedPriority = PRIORITIES.find((value) => value === chosen);
    if (!title || !selectedPriority) { setError("Enter a title and select a valid priority."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await createIdea({ Title: title, Details: details, Status: "New", Priority: selectedPriority });
      form.reset(); dialog.current?.close(); setNotice("Idea added to the team board.");
      await refresh();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  }
  async function move(idea: Idea, status: Status) {
    setPendingId(idea.ID); setError(""); setNotice("");
    try {
      await changeStatus(idea.ID, status);
      setIdeas((current) => current.map((item) => item.ID === idea.ID ? { ...item, Status: status } : item));
      setNotice(`Moved "${idea.Title}" to ${status}.`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setPendingId(undefined); }
  }
  const visible = ideas.filter((idea) => (!priority || idea.Priority === priority)
    && `${idea.Title} ${idea.Details ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  function card(idea: Idea) {
    return <article className="idea" key={idea.ID}>
      <div className="idea-top"><span className={`priority priority-${idea.Priority.toLowerCase()}`}>{idea.Priority} priority</span><span className="idea-id">#{idea.ID}</span></div>
      <h3>{idea.Title}</h3>
      <p className="idea-details">{idea.Details || "No details added yet."}</p>
      <footer><span className="idea-source">TEAM IDEA</span><label className="sr-only" htmlFor={`status-${idea.ID}`}>Status for {idea.Title}</label>
        <select id={`status-${idea.ID}`} value={idea.Status} disabled={pendingId !== undefined || saving || loading || !connected} onChange={(e) => {
          const value = STATUSES.find((status) => status === e.target.value);
          if (value) void move(idea, value);
        }}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      </footer>
    </article>;
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#board"><span className="brand-icon" aria-hidden="true">✦</span><span>team<span className="brand-light">ideas</span></span></a>
      <p className="sidebar-label">YOUR WORKSPACE</p>
      <a className="nav-active" href="#board"><span aria-hidden="true">▦</span> Ideas board <span className="nav-count">{ideas.length}</span></a>
      <div className="sidebar-note"><span className="sparkle" aria-hidden="true">✧</span><h2>Small ideas.<br />Meaningful change.</h2><p>A place for the little improvements that make a big difference.</p></div>
      <div className="connection"><span className={connected ? "connected-dot" : "disconnected-dot"}></span><span>{connected ? "Connected to SharePoint" : "SharePoint setup required"}</span></div>
    </aside>
    <main id="board">
      <header className="page-header"><div><p className="eyebrow">MAKE WORK BETTER, TOGETHER</p><h1>Your next great idea<br /><span>starts here.</span></h1><p className="intro">Capture a spark. Explore the possibilities. Make it happen.</p></div><button className="primary" disabled={!connected || loading || saving || pendingId !== undefined} onClick={() => dialog.current?.showModal()}><span aria-hidden="true">＋</span> Share an idea</button></header>
      <section className="stats" aria-label="Board summary">{[
        { label: "Ideas shared", count: ideas.length, icon: "✦" },
        { label: "Being explored", count: ideas.filter((i) => i.Status === "Exploring").length, icon: "◎" },
        { label: "On the roadmap", count: ideas.filter((i) => i.Status === "Planned").length, icon: "↗" },
      ].map((stat) => <div className="stat" key={stat.label}><span className="stat-icon" aria-hidden="true">{stat.icon}</span><div><strong>{stat.count}</strong><span>{stat.label}</span></div></div>)}</section>
      <div className="toolbar"><label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Search ideas</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an idea..." /></label>
        <label><span className="sr-only">Filter priority</span><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{PRIORITIES.map((p: Priority) => <option key={p}>{p}</option>)}</select></label>
        <div className="view-switch" role="group" aria-label="Board view"><button aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div>
        <button className="refresh" disabled={loading || saving || pendingId !== undefined} onClick={() => void refresh()}>↻ Refresh</button>
      </div>
      {error && <div className="error" role="alert"><strong>We couldn’t complete that request.</strong><p>{error}</p></div>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {loading ? <p role="status" className="empty">Loading your team’s ideas...</p> : connected && visible.length === 0 ?
        <div className="empty"><h2>{ideas.length ? "No ideas match these filters." : "Every improvement starts with an idea."}</h2><p>{ideas.length ? "Try another search or priority." : "Be the first to share something your team could do better."}</p></div> :
        <section className={view === "board" ? "board" : "idea-list"} aria-label="Team ideas">
          {view === "board" ? STATUSES.map((status) => <section key={status} className="column"><h2><span className={`status-dot status-${status.toLowerCase()}`}></span>{status}<span className="column-count">{visible.filter((i) => i.Status === status).length}</span></h2><div className="column-cards">{visible.filter((i) => i.Status === status).map(card)}</div>{connected && <p className="column-hint">{status === "New" ? "Fresh perspectives welcome" : status === "Exploring" ? "A little curiosity goes a long way" : "Good things are on the horizon"}</p>}</section>) : visible.map(card)}
        </section>}
      <p className="board-footnote">Built for better teamwork · Shows up to 200 ideas · Your data stays in your SharePoint list</p>
    </main>
    <dialog ref={dialog} onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <form onSubmit={submit}><p className="eyebrow">A SPARK WORTH SHARING</p><h2>What could we do better?</h2>
        <label htmlFor="idea-title">Give your idea a title</label><input id="idea-title" name="title" required maxLength={255} placeholder="A small change with a big impact..." autoFocus />
        <label htmlFor="idea-details">Tell us a little more</label><textarea id="idea-details" name="details" maxLength={10000} rows={4} placeholder="What’s the opportunity? How would it help?" />
        <label htmlFor="idea-priority">Priority</label><select id="idea-priority" name="priority" defaultValue="Medium">{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="dialog-actions"><button type="button" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Sharing..." : "Share idea"}</button></div>
      </form>
    </dialog>
  </div>;
}
