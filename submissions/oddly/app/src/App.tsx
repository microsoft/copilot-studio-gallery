import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, Check, Copy, ExternalLink, Heart, Menu, MessageCircle, Plus, Search, Settings2, Sparkles, Sun, PenLine, X, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Monster } from "./Monster";
import { safeUrl, transcript } from "./messages";
import type { Message } from "./messages";
import { demoAnswer, recipes } from "./demo";
import type { AgentSession } from "./client";
import type { AgentConfig } from "./settings";

interface Chat { id: string; title: string; messages: Message[]; live: boolean }
const newChat = (live = false): Chat => ({ id: crypto.randomUUID(), title: "A little new beginning", messages: [], live });
const emptyConfig: AgentConfig = { environmentId: "", schemaName: "" };

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url => safeUrl(url) ?? ""}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={12} /></a> : <span>{children}</span>,
      img: ({ alt }) => <span className="notice">[Image not loaded{alt ? `: ${alt}` : ""}]</span>,
    }}>{text}</ReactMarkdown>;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => [newChat()]);
  const [activeId, setActiveId] = useState("");
  const active = chats.find(chat => chat.id === activeId) ?? chats[0];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [selectedConfig, setSelectedConfig] = useState<AgentConfig | null>(null);
  const configured = selectedConfig !== null;
  const [editingConnection, setEditingConnection] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(emptyConfig);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<"chats" | "saved">("chats");
  const [saved, setSaved] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sessions = useRef(new Map<string, AgentSession>());
  const baseSession = useRef<AgentSession | null>(null);

  useEffect(() => {
    if (active.messages.length && atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" });
  }, [active.messages, busy, atBottom]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  function update(id: string, transform: (messages: Message[]) => Message[]) {
    setChats(previous => previous.map(chat => chat.id === id ? { ...chat, messages: transform(chat.messages) } : chat));
  }
  function select(chat: Chat) {
    if (lock.current) return;
    setActiveId(chat.id); setTab("chats"); setMenu(false); setQuery(""); setAtBottom(true); setError(""); setDraft("");
  }
  function fresh() {
    if (lock.current) return;
    const chat = newChat(configured);
    setChats(previous => [chat, ...previous]); select(chat);
    if (baseSession.current) sessions.current.set(chat.id, baseSession.current.fork());
    composer.current?.focus();
  }
  async function send(value = draft) {
    const content = value.trim();
    if (!content || lock.current || tab !== "chats") return;
    if (active.live && !sessions.current.has(active.id)) { setError("This conversation is not connected. Start a new chat to reconnect."); return; }
    const id = active.id;
    const turn = crypto.randomUUID();
    lock.current = true; setBusy(true); setDraft(""); setError(""); setAtBottom(true); setQuery("");
    setChats(previous => previous.map(chat => chat.id === id ? {
      ...chat, title: chat.messages.some(message => message.role === "user") ? chat.title : content.slice(0, 40),
      messages: [...chat.messages, { id: `${turn}:user`, role: "user", text: content }],
    } : chat));
    try {
      if (active.live) {
        const replies = await sessions.current.get(id)!.send(content, navigator.language);
        update(id, messages => [...messages, ...replies.map((text, index): Message => ({
          id: `${turn}:answer:${index}`, role: "assistant", text,
        }))]);
      } else {
        const answer = demoAnswer(content);
        const words = answer.split(" ");
        for (let count = 0; count < words.length; count += 5) {
          await new Promise(resolve => setTimeout(resolve, 24));
          const text = words.slice(0, count + 5).join(" ");
          update(id, messages => {
            const message: Message = { id: `${turn}:demo`, role: "assistant", text };
            return messages.some(entry => entry.id === message.id) ? messages.map(entry => entry.id === message.id ? message : entry) : [...messages, message];
          });
        }
      }
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : "The agent request failed."} Your message may already have reached the agent. Check before sending it again.`);
    } finally {
      lock.current = false; setBusy(false); composer.current?.focus();
    }
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const [{ AgentSession }, { loadConnector }] = await Promise.all([import("./client"), import("./connector")]);
      const selected = {
        environmentId: config.environmentId.trim(), schemaName: config.schemaName.trim(),
      };
      const session = new AgentSession(selected, loadConnector());
      const chat = newChat(true);
      baseSession.current = session; sessions.current.set(chat.id, session); setSelectedConfig(selected); setEditingConnection(false);
      setChats(previous => [chat, ...previous]); setActiveId(chat.id); setTab("chats"); setAtBottom(true); setDraft("");
      dialog.current?.close(); setMenu(false); setQuery(""); setToast("Agent selected. Your first message checks the live connection.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The native connector could not be loaded.");
    } finally { lock.current = false; setBusy(false); }
  }
  function disconnect() {
    if (lock.current) return;
    baseSession.current = null; sessions.current.clear(); setSelectedConfig(null);
    setSaved(previous => previous.filter(message => !chats.some(chat => chat.live && chat.messages.some(entry => entry.id === message.id))));
    const chat = newChat();
    setChats(previous => [chat, ...previous.filter(entry => !entry.live)]); select(chat);
    dialog.current?.close(); setToast("Back to sample mode. Live chats cleared from this page; player sign-in is unchanged.");
  }
  async function copy(message: Message) {
    try { await navigator.clipboard.writeText(message.text); setToast("Copied. A little goodness to go."); }
    catch { setError("Clipboard access was denied. Select the answer text to copy it manually."); }
  }
  function save(message: Message) {
    setSaved(previous => previous.some(entry => entry.id === message.id) ? previous.filter(entry => entry.id !== message.id) : [...previous, message]);
  }
  function download() {
    const blob = new Blob([`# Oddly${active.live ? "" : " (scripted sample)"}\n\n${transcript(active.messages)}`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "oddly-chat.md"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const displayed = (tab === "saved" ? saved : active.messages).filter(message =>
    !query || message.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  const welcome = tab === "chats" && !active.messages.length;
  const hasLiveReply = active.live && active.messages.some(message => message.role === "assistant");

  return <div className={`app ${quiet ? "quiet" : ""}`}>
    {menu && <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? "is-open" : ""}`} aria-label="Your thinking space">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (!lock.current) { setTab("chats"); setMenu(false); } }}>
        <span className="brand-icon"><Monster /></span><span>oddly<span className="brand-dot">✳</span><small>A LITTLE SPACE FOR BIG IDEAS</small></span>
      </a>
      <button className="new-chat" onClick={() => void fresh()} disabled={busy}><Plus size={18} /> A new little adventure <span>New chat</span></button>
      <div className="nav-heading">YOUR LITTLE UNIVERSE <span>FOR THIS SESSION</span></div>
      <button className={`nav-item ${tab === "chats" ? "selected" : ""}`} onClick={() => { setTab("chats"); setMenu(false); setQuery(""); }}><MessageCircle size={17} /> Conversations <span>{chats.length}</span></button>
      <button className={`nav-item ${tab === "saved" ? "selected" : ""}`} onClick={() => { setTab("saved"); setMenu(false); setQuery(""); }}><Heart size={17} /> Little keepers <span>{saved.length}</span></button>
      <div className="chat-list" aria-label="Conversations">
        <span className="list-label">RECENT WANDERINGS</span>
        {chats.map(chat => <button key={chat.id} className={`chat-link ${chat.id === active.id && tab === "chats" ? "current" : ""}`} onClick={() => select(chat)} disabled={busy}><span className={`chat-dot ${chat.live ? "live-dot" : ""}`} /><span>{chat.title}</span></button>)}
      </div>
      <div className="sidebar-bottom">
        <div className="little-note"><Sparkles size={17} /><p>A little odd.<br />A lot of possibility.</p><span className="note-star">✳</span></div>
        <button className="nav-item" onClick={() => { setQuiet(value => !value); }} aria-pressed={quiet}><Sun size={17} /> Quiet mode <span className={`toggle ${quiet ? "on" : ""}`} /></button>
        <button className="agent-card" onClick={() => dialog.current?.showModal()}><span className="agent-icon"><Zap size={18} /></span><span><strong>{configured ? "Your agent is selected" : "Bring your own agent"}</strong><small>{configured ? "Manage connection" : "Connect Copilot Studio"}</small></span><ArrowRight size={16} /></button>
        <p className="sidebar-foot">Made of code. Full of possibility.</p>
      </div>
    </aside>

    <main>
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span className="breadcrumb">Oddly, yours <span>/</span> <strong>{tab === "saved" ? "Little keepers" : "Your little thinking space"}</strong></span></div>
        <div className="header-actions"><span className={`status-pill ${hasLiveReply ? "live" : ""}`}><span />{hasLiveReply ? "Live agent" : active.live ? "Agent selected" : "Sample mode"}</span><button className="icon-button" aria-label="Connection settings" onClick={() => dialog.current?.showModal()}><Settings2 size={18} /></button></div>
      </header>
      <div className="mode-banner"><span><span className="tiny-spark">✦</span>{active.live ? "Your agent, through the native connector. Answers arrive a whole thought at a time." : "A little peek at what's possible. Sample replies, no sign-in needed."}</span><button onClick={() => dialog.current?.showModal()}>{configured ? "Connection" : "Connect your agent"}<ArrowRight size={14} /></button></div>

      <div className="workspace-toolbar">
        <span><span className="section-dot" />{tab === "saved" ? "THE GOOD STUFF, KEPT CLOSE" : "ROOM TO THINK. SPACE TO PLAY."}</span>
        <div><button className="icon-button" aria-label="Search messages" aria-expanded={searchOpen} onClick={() => setSearchOpen(value => !value)}><Search size={17} /></button><button className="icon-button" aria-label="Export conversation as Markdown" onClick={download} disabled={!active.messages.length || tab !== "chats" || busy}><ArrowDownToLine size={17} /></button></div>
      </div>
      {searchOpen && <div className="search-bar"><Search size={16} /><input autoFocus aria-label="Search message text" placeholder="Find a little something..." value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(""); }}><X size={16} /></button></div>}

      <div className="scroll-area" ref={scroller} onScroll={() => { const element = scroller.current; if (element) setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 100); }}>
        {welcome ? <section className="welcome">
          <div className="mascot-scene"><span className="orbit-note note-one">a little different</span><span className="orbit-note note-two">entirely on your side</span><span className="doodle-star star-one">✳</span><span className="doodle-star star-two">✦</span><Monster className="hero-monster" /><span className="hello-tag">Oddly says hi!</span></div>
          <div className="eyebrow">YOUR IDEAS ARE IN GOOD COMPANY</div>
          <h1>Big thoughts.<br /><span>Small wonders.<svg viewBox="0 0 310 18" aria-hidden="true"><path d="M4 13Q140-3 305 9M24 17q144-13 257-1" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span></h1>
          <p className="welcome-description">Untangle a thought. Make a plan. Dream up something weird.<br className="desktop-break" /> This is your cozy corner to figure things out.</p>
          <div className="prompt-recipes">{recipes.map((recipe, index) => {
            const Icon = index === 0 ? Sun : index === 1 ? PenLine : Sparkles;
            return <button key={recipe.title} className={`recipe ${recipe.color}`} onClick={() => void send(recipe.prompt)} disabled={busy}><span className="recipe-top"><span className="recipe-icon"><Icon size={21} strokeWidth={1.6} /></span><ArrowUp className="recipe-arrow" size={18} /></span><strong>{recipe.title}</strong><small>{recipe.subtitle}</small></button>;
          })}</div>
          <span className="welcome-footnote"><Heart size={12} /> A thoughtful copilot. A delightfully odd little sidekick.</span>
        </section> : <section className="conversation" aria-label={tab === "saved" ? "Saved answers" : "Conversation"}>
          <div className="conversation-title"><span className="eyebrow">{tab === "saved" ? "YOUR PERSONAL POCKET OF GOODNESS" : active.live ? "COPILOT STUDIO · NATIVE CONNECTOR" : "SCRIPTED SAMPLE · NO LIVE AGENT"}</span><h1>{tab === "saved" ? "Good thoughts. Kept close." : active.title}</h1></div>
          {!displayed.length && <div className="empty-state"><Monster className="empty-monster" /><h2>{query ? "Nothing hiding here." : "Something worth keeping."}</h2><p>{query ? "Try a different search." : "Tap the heart on an answer to save it here for this session."}</p></div>}
          {displayed.map(message => <article key={message.id} className={`message ${message.role}`}>
            <div className="message-author">{message.role === "assistant" ? <Monster className="message-monster" /> : <span className="you-avatar">Y</span>}<strong>{message.role === "assistant" ? "Oddly" : "You"}</strong>{message.role === "assistant" && <span>{active.live && tab !== "saved" ? "YOUR COPILOT" : "YOUR LITTLE SIDEKICK"}</span>}</div>
            {message.text && <div className="message-body">{message.role === "user" ? <p>{message.text}</p> : <Markdown text={message.text} />}</div>}
            {message.role === "assistant" && message.text && !busy && <div className="message-actions"><button onClick={() => void copy(message)}><Copy size={14} /> Copy</button><button onClick={() => save(message)} aria-pressed={saved.some(entry => entry.id === message.id)}><Heart size={14} fill={saved.some(entry => entry.id === message.id) ? "currentColor" : "none"} />{saved.some(entry => entry.id === message.id) ? "Saved" : "Keep this"}</button></div>}
          </article>)}
          {busy && <div className="thinking" role="status"><span /><span /><span />{active.live ? "Your copilot is working..." : "Oddly is finding a sample thought..."}</div>}
        </section>}
      </div>
      {!atBottom && !welcome && <button className="jump-bottom" onClick={() => { setAtBottom(true); scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }}><ArrowDown size={15} /> Latest thought</button>}
      {error && <div className="error-box" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
      {tab === "chats" && <footer className="composer-wrap"><form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea ref={composer} value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} rows={2} placeholder="What's on your mind? Weird is welcome." aria-label="Message your copilot" disabled={busy} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
        <div className="composer-bottom"><span><Sparkles size={15} />{active.live ? "Your Copilot Studio agent" : "A little curiosity goes a long way"}</span><button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message"><ArrowUp size={21} /></button></div>
      </form><div className="composer-caption"><span>{active.live ? "AI can make mistakes. Double-check the important bits." : "Sample mode · Scripted replies, not AI. Your words stay on this page."}</span><span>Enter to send <span className="key-divider">·</span> Shift + Enter for a new line</span></div></footer>}
      <div className="toast" role="status">{toast && <><Check size={15} />{toast}</>}</div>
    </main>
    <dialog ref={dialog} className="connection-dialog" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="dialog-heading"><span className="eyebrow">YOUR AGENT. A LITTLE MORE YOU.</span><button className="icon-button" aria-label="Close connection settings" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <h2>Bring your own agent.</h2><p>Use a published standard-harness Copilot Studio agent through the native managed-app connector. Microsoft handles sign-in and consent in the player. No app registration. No WebChat.</p>
      {configured && !editingConnection ? <><div className="connected-note"><Check size={18} /> Agent selected. The first message in each chat checks the live connection.</div><p className="connection-summary"><strong>Agent schema name</strong><br /><code>{selectedConfig.schemaName}</code></p><button className="primary-button" disabled={busy} onClick={() => { setEditingConnection(true); setError(""); }}>Edit connection</button><button className="secondary-button" disabled={busy} onClick={disconnect}>Use sample mode & clear live chats</button><p className="dialog-privacy">This does not sign you out of the managed player or delete remote history.</p></> : <form onSubmit={event => void connect(event)}>
        <div className="config-grid">{([
          ["environmentId", "Environment ID", "From your Copilot Studio URL"],
          ["schemaName", "Agent schema name", "From Settings > Agent details"],
        ] as const).map(([key, label, placeholder]) => <label key={key}>{label}<input required autoComplete="off" spellCheck={false} value={config[key]} placeholder={placeholder} disabled={busy} onChange={event => setConfig(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
        <div className="setup-note"><strong>A little setup first</strong><p>Bind the <strong>Microsoft Copilot Studio</strong> connector in action mode using the native Managed Apps CLI. Open its authenticated Local Play or hosted player and accept the platform's connection consent. Bare localhost supports sample mode only.</p><p>The currently generated connector does not support GitHub Copilot harness agents. Choose a published <strong>standard-harness</strong> agent with Microsoft authentication. Answers are text-only, without streaming, tool trails, or interactive cards.</p><a href="https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/connect-to-data" target="_blank" rel="noopener noreferrer">Native connector setup <ExternalLink size={13} /></a></div>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Loading connector..." : "Use this agent"}<ArrowRight size={17} /></button>
        <p className="dialog-privacy">Settings and chats stay in page memory. The player owns authentication. Live prompts go to your agent, whose tools may take actions. Nothing is sent until you send a message.</p>
      </form>}
    </dialog>
  </div>;
}
