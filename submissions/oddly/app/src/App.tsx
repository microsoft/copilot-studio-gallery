import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, Check, Copy, ExternalLink, Heart, Menu, MessageCircle, Plus, RefreshCw, Search, Sparkles, Sun, PenLine, Trash2, UserRound, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Monster } from "./Monster";
import { safeUrl, transcript } from "./messages";
import type { Message } from "./messages";
import { demoAnswer, recipes } from "./demo";
import { forgetAgentSelection, readAgentSelection, rememberAgentSelection, sameAgent, validateConfig } from "./settings";
import { MemoryClient, MemoryUnavailableError, MemoryUncertainError } from "./memories";
import type { Keeper, RememberMode } from "./memories";
import { AgentSession } from "./client";
import type { AgentConfig } from "./settings";

interface Chat { id: string; title: string; messages: Message[]; live: boolean }
interface Connection { session: AgentSession; memory: MemoryClient }
interface MemoryState {
  status: "idle" | "loading" | "ready" | "unavailable" | "error" | "uncertain";
  keepers: Keeper[];
  message: string;
  pending?: { id: string; kind: "remember" | "forget" };
}
type KeeperAction = { kind: "remember"; message: Message; keeper: Keeper; mode: RememberMode } | { kind: "forget"; keeper: Keeper };
interface KeptAnswer { keeperId: string; state: "saving" | "uncertain" | "remembered" }
const emptyMemory: MemoryState = { status: "idle", keepers: [], message: "" };
const newChat = (live = false): Chat => ({ id: crypto.randomUUID(), title: "New chat", messages: [], live });
const emptyConfig: AgentConfig = { environmentId: "", schemaName: "" };
const selectionStorage = () => window.localStorage;

async function createConnection(config: AgentConfig): Promise<Connection> {
  const { loadConnector } = await import("./connector");
  const connector = loadConnector();
  return { session: new AgentSession(config, connector), memory: new MemoryClient(config, connector) };
}

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url => safeUrl(url) ?? ""}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={12} /></a> : <span>{children}</span>,
      img: ({ alt }) => <span className="notice">[Image not loaded{alt ? `: ${alt}` : ""}]</span>,
    }}>{text}</ReactMarkdown>;
}

function UserAvatar() {
  const [initials, setInitials] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (window.parent === window && !("__platformBridge" in window)) return;
    let active = true;
    import("./runtime").then(runtime => runtime.getUserInitials()).then(value => {
      if (active) setInitials(value);
    }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, []);
  return <span className="you-avatar" aria-label="You" title={unavailable ? "Profile unavailable; showing a generic avatar." : "You"}>{initials || <UserRound size={14} aria-hidden="true" />}</span>;
}

export default function App() {
  const [remembered] = useState(() => readAgentSelection(selectionStorage));
  const [chats, setChats] = useState<Chat[]>(() => [newChat()]);
  const [activeId, setActiveId] = useState("");
  const active = chats.find(chat => chat.id === activeId) ?? chats[0];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pendingRequest = useRef<AbortController | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<AgentConfig | null>(null);
  const configured = selectedConfig !== null;
  const [editingConnection, setEditingConnection] = useState(false);
  const [config, setConfig] = useState<AgentConfig>(remembered.config ?? emptyConfig);
  const [selectionNotice, setSelectionNotice] = useState(remembered.notice);
  const [pendingAgent, setPendingAgent] = useState<AgentConfig | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<"chats" | "saved">("chats");
  const [saved, setSaved] = useState<Message[]>([]);
  const [memory, setMemory] = useState<MemoryState>(emptyMemory);
  const [keptAnswers, setKeptAnswers] = useState<Record<string, KeptAnswer>>({});
  const [keeperAction, setKeeperAction] = useState<KeeperAction | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const keeperDialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const sessions = useRef(new Map<string, AgentSession>());
  const baseSession = useRef<AgentSession | null>(null);
  const restoration = useRef<Promise<Connection> | null>(null);
  const activation = useRef(0);
  const memoryClient = useRef<MemoryClient | null>(null);
  const memoryRequest = useRef<AbortController | null>(null);
  const memoryLock = useRef(false);

  useEffect(() => () => {
    pendingRequest.current?.abort();
    memoryRequest.current?.abort();
    memoryClient.current = null;
  }, []);
  useEffect(() => {
    const selected = remembered.config;
    if (!selected) return;
    if (window.parent === window && !("__platformBridge" in window)) {
      setSelectionNotice("Your agent selection is remembered. Open the authenticated Managed Apps player to use it; this preview stays in sample mode.");
      return;
    }
    let active = true;
    const version = activation.current;
    restoration.current ??= createConnection(selected);
    restoration.current.then(connection => {
      if (active && activation.current === version) activate(selected, connection, false);
    }).catch(() => {
      if (active && activation.current === version) {
        setSelectionNotice("Your remembered agent could not be restored. Open Connection to select it again in the authenticated player.");
      }
    });
    return () => { active = false; };
  }, [remembered]);
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
    if (active.live && !sessions.current.has(active.id)) { setError("This chat is not connected. Start a new chat to reconnect."); return; }
    const id = active.id;
    const turn = crypto.randomUUID();
    lock.current = true; setBusy(true); setDraft(""); setError(""); setAtBottom(true); setQuery("");
    setChats(previous => previous.map(chat => chat.id === id ? {
      ...chat, title: chat.messages.some(message => message.role === "user") ? chat.title : content.slice(0, 40),
      messages: [...chat.messages, { id: `${turn}:user`, role: "user", text: content }],
    } : chat));
    try {
      if (active.live) {
        const controller = new AbortController();
        pendingRequest.current = controller;
        const replies = await sessions.current.get(id)!.send(content, controller.signal);
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
      pendingRequest.current = null;
      lock.current = false; setBusy(false); composer.current?.focus();
    }
  }
  function activate(selected: AgentConfig, connection: Connection, remember = true) {
    const chat = newChat(true);
    pendingRequest.current?.abort();
    memoryRequest.current?.abort();
    memoryClient.current = connection.memory; memoryLock.current = false;
    setMemory(emptyMemory); setKeptAnswers({}); setKeeperAction(null); keeperDialog.current?.close();
    baseSession.current = connection.session;
    sessions.current.clear();
    sessions.current.set(chat.id, connection.session);
    setChats(previous => [chat, ...previous.filter(entry => !entry.live)]);
    setSelectedConfig(selected); setConfig(selected); setEditingConnection(false); setPendingAgent(null);
    setActiveId(chat.id); setTab("chats"); setAtBottom(true); setDraft("");
    setSelectionNotice(remember ? rememberAgentSelection(selectionStorage, selected) : "");
    dialog.current?.close(); setMenu(false); setQuery("");
    setToast("Agent selected. Recalling its memories...");
    void loadMemories(connection.memory);
  }
  async function applyConnection(selected: AgentConfig) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const version = ++activation.current;
    try {
      const connection = await createConnection(selected);
      if (activation.current === version) activate(selected, connection);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The native connector could not be loaded.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const selected = { environmentId: config.environmentId.trim(), schemaName: config.schemaName.trim() };
    try { validateConfig(selected); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Enter a valid agent selection."); return; }
    if (selectedConfig && sameAgent(selectedConfig, selected)) {
      setEditingConnection(false); dialog.current?.close(); return;
    }
    if (selectedConfig) { setPendingAgent(selected); setError(""); return; }
    await applyConnection(selected);
  }
  function disconnect() {
    if (lock.current) return;
    activation.current++;
    memoryRequest.current?.abort(); memoryClient.current = null; memoryLock.current = false;
    setMemory(emptyMemory); setKeptAnswers({}); setKeeperAction(null); keeperDialog.current?.close();
    baseSession.current = null; sessions.current.clear(); setSelectedConfig(null);
    setPendingAgent(null); setEditingConnection(false); setConfig(emptyConfig);
    setSelectionNotice(forgetAgentSelection(selectionStorage));
    const chat = newChat();
    setChats(previous => [chat, ...previous.filter(entry => !entry.live)]); select(chat);
    dialog.current?.close(); setToast("Back to sample mode. Live chats cleared from this page; player sign-in is unchanged.");
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setToast("Copied. A little goodness to go."); }
    catch { setError("Clipboard access was denied. Select the answer text to copy it manually."); }
  }
  function save(message: Message) {
    if (tab === "saved" || !active.live) {
      setSaved(previous => previous.some(entry => entry.id === message.id) ? previous.filter(entry => entry.id !== message.id) : [...previous, message]);
      return;
    }
    if (keptAnswers[message.id]) { setTab("saved"); setQuery(""); return; }
    if (memoryLock.current || !memoryClient.current) return;
    if (message.text.length > 8000) { setError("Keep an idea of up to 8,000 characters. Ask your agent for a shorter answer first."); return; }
    setKeeperAction({ kind: "remember", message, keeper: { id: crypto.randomUUID(), title: "", content: message.text }, mode: "idea" });
    keeperDialog.current?.showModal();
  }
  async function loadMemories(client = memoryClient.current) {
    if (!client || memoryLock.current) return;
    const controller = new AbortController();
    memoryLock.current = true; memoryRequest.current = controller;
    setMemory(previous => ({ ...previous, status: "loading", message: "Oddly is finding your saved ideas.", pending: undefined }));
    try {
      const keepers = await client.list(controller.signal);
      if (memoryClient.current !== client) return;
      setMemory({ status: "ready", keepers, message: "" });
      setKeptAnswers(previous => Object.fromEntries(Object.entries(previous).map(([id, value]) => [
        id, { ...value, state: keepers.some(keeper => keeper.id.toLowerCase() === value.keeperId.toLowerCase()) ? "remembered" : "uncertain" },
      ])));
    } catch (failure) {
      if (memoryClient.current === client) setMemory(previous => ({
        ...previous, pending: undefined, status: failure instanceof MemoryUnavailableError ? "unavailable" : "error",
        message: failure instanceof Error ? failure.message : "The memory request failed. Check player consent, agent access, and publication.",
      }));
    } finally {
      if (memoryClient.current === client) { memoryLock.current = false; memoryRequest.current = null; }
    }
  }
  async function changeMemory(action: KeeperAction) {
    const client = memoryClient.current;
    if (!client || memoryLock.current) return;
    keeperDialog.current?.close(); setKeeperAction(null);
    const controller = new AbortController();
    memoryLock.current = true; memoryRequest.current = controller;
    const pending = { id: action.keeper.id, kind: action.kind };
    setMemory(previous => ({ ...previous, status: "loading", pending, message: action.kind === "remember" ? "Oddly is busy saving your idea. You can save another once this one is confirmed." : "Oddly is forgetting this memory. Memory actions will be available again once it's confirmed." }));
    if (action.kind === "remember") setKeptAnswers(previous => ({ ...previous, [action.message.id]: { keeperId: action.keeper.id, state: "saving" } }));
    if (tab === "chats") composer.current?.focus();
    try {
      const keepers = action.kind === "remember"
        ? await client.remember(action.keeper, action.mode, controller.signal)
        : await client.forget(action.keeper.id, controller.signal);
      if (memoryClient.current !== client) return;
      setMemory({ status: "ready", keepers, message: "" });
      setKeptAnswers(previous => Object.fromEntries(Object.entries(previous)
        .filter(([, value]) => action.kind !== "forget" || value.keeperId.toLowerCase() !== action.keeper.id.toLowerCase())
        .map(([id, value]) => [id, { ...value, state: keepers.some(keeper => keeper.id.toLowerCase() === value.keeperId.toLowerCase()) ? "remembered" : "uncertain" }])));
      setToast(action.kind === "remember" ? "Your idea was recalled from agent memory." : "This memory is no longer recalled by your agent.");
    } catch (failure) {
      if (memoryClient.current !== client) return;
      const uncertain = failure instanceof MemoryUncertainError;
      setMemory(previous => ({ ...previous, pending: undefined, status: uncertain ? "uncertain" : "error", message: failure instanceof Error ? failure.message : "The memory change could not be confirmed." }));
      if (action.kind === "remember") setKeptAnswers(previous => uncertain
        ? { ...previous, [action.message.id]: { keeperId: action.keeper.id, state: "uncertain" } }
        : Object.fromEntries(Object.entries(previous).filter(([id]) => id !== action.message.id)));
    } finally {
      if (memoryClient.current === client) { memoryLock.current = false; memoryRequest.current = null; }
    }
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
  const memoryBusy = memory.status === "loading";
  const liveKeepersView = tab === "saved" && configured;
  const recalled = memory.keepers.filter(keeper => !query || `${keeper.title}\n${keeper.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return <div className="app">
    {menu && <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? "is-open" : ""}`} aria-label="Your thinking space">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (!lock.current) { setTab("chats"); setMenu(false); } }}>
        <span className="brand-icon"><Monster /></span><span>oddly<span className="brand-dot">✳</span><small>A LITTLE SPACE FOR BIG IDEAS</small></span>
      </a>
      <button className="new-chat" onClick={() => void fresh()} disabled={busy}><Plus size={18} /> New chat</button>
      <div className="nav-heading">YOUR LITTLE UNIVERSE <span>FOR THIS SESSION</span></div>
      <button className={`nav-item ${tab === "chats" ? "selected" : ""}`} onClick={() => { setTab("chats"); setMenu(false); setQuery(""); }}><MessageCircle size={17} /> Chats <span>{chats.length}</span></button>
      <button className={`nav-item ${tab === "saved" ? "selected" : ""}`} onClick={() => { setTab("saved"); setMenu(false); setQuery(""); }}><Heart size={17} /> Memories <span>{saved.length + memory.keepers.length}</span></button>
      <div className="chat-list" aria-label="Chats">
        <span className="list-label">RECENT CHATS</span>
        {chats.map(chat => <button key={chat.id} className={`chat-link ${chat.id === active.id && tab === "chats" ? "current" : ""}`} onClick={() => select(chat)} disabled={busy}><span className={`chat-dot ${chat.live ? "live-dot" : ""}`} /><span>{chat.title}</span></button>)}
      </div>
      <div className="sidebar-bottom">
        <div className="little-note"><Sparkles size={17} /><p>A little odd.<br />A lot of possibility.</p><span className="note-star">✳</span></div>
        <p className="sidebar-foot">Made of code. Full of possibility.</p>
      </div>
    </aside>

    <main>
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span className="breadcrumb">Oddly, yours <span>/</span> <strong>{tab === "saved" ? "Memories" : "Your little thinking space"}</strong></span></div>
        <div className="header-actions"><span className={`status-pill ${hasLiveReply || liveKeepersView && memory.status === "ready" ? "live" : ""}`}><span />{liveKeepersView ? "Agent memories" : hasLiveReply ? "Live agent" : active.live ? "Agent selected" : "Sample mode"}</span></div>
      </header>
      <div className="mode-banner"><span><span className="tiny-spark">✦</span>{liveKeepersView ? "Good thoughts, recalled from your agent. Sample bookmarks stay on this page." : active.live ? "Your agent, through the native connector. Answers arrive a whole thought at a time." : "A little peek at what's possible. Sample replies, no sign-in needed."}</span><button onClick={() => dialog.current?.showModal()}>{configured ? "Connection" : "Connect your agent"}</button></div>

      <div className="workspace-toolbar">
        <div><button className="icon-button" aria-label="Search messages" aria-expanded={searchOpen} onClick={() => setSearchOpen(value => !value)}><Search size={17} /></button><button className="icon-button" aria-label="Export chat as Markdown" onClick={download} disabled={!active.messages.length || tab !== "chats" || busy}><ArrowDownToLine size={17} /></button></div>
      </div>
      {searchOpen && <div className="search-bar"><Search size={16} /><input autoFocus aria-label="Search message text" placeholder="Find a little something..." value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(""); }}><X size={16} /></button></div>}

      <div className="scroll-area" ref={scroller} onScroll={() => { const element = scroller.current; if (element) setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 100); }}>
        {welcome ? <section className="welcome">
          <div className="mascot-scene"><span className="orbit-note note-one">a little different</span><span className="orbit-note note-two">entirely on your side</span><span className="doodle-star star-one">✳</span><span className="doodle-star star-two">✦</span><Monster className="hero-monster" /><span className="hello-tag">Oddly says hi!</span></div>
          <div className="eyebrow">YOUR IDEAS ARE IN GOOD COMPANY</div>
          <h1>Big thoughts.<br /><span>Small wonders.<svg viewBox="0 0 310 18" aria-hidden="true"><path d="M4 13Q140-3 305 9M24 17q144-13 257-1" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span></h1>
          <p className="welcome-description">Catch a thought. Follow a spark. Dream up something weird.<br className="desktop-break" /> This is your cozy corner to grow an idea.</p>
          <div className="prompt-recipes">{recipes.map((recipe, index) => {
            const Icon = index === 0 ? Sun : index === 1 ? PenLine : Sparkles;
            return <button key={recipe.title} className={`recipe ${recipe.color}`} onClick={() => void send(recipe.prompt)} disabled={busy}><span className="recipe-top"><span className="recipe-icon"><Icon size={21} strokeWidth={1.6} /></span><ArrowUp className="recipe-arrow" size={18} /></span><strong>{recipe.title}</strong><small>{recipe.subtitle}</small></button>;
          })}</div>
          <span className="welcome-footnote"><Heart size={12} /> A thoughtful copilot. A delightfully odd little sidekick.</span>
        </section> : <section className="conversation" aria-label={tab === "saved" ? "Memories" : "Chat"}>
          <div className="conversation-title"><span className="eyebrow">{tab === "saved" ? "Little ideas worth remembering." : active.live ? "COPILOT STUDIO · NATIVE CONNECTOR" : "SCRIPTED SAMPLE · NO LIVE AGENT"}</span><h1>{tab === "saved" ? "Memories" : active.title}</h1></div>
          {liveKeepersView && <section className="agent-keepers" aria-label="Agent memories">
            <div className="keeper-heading"><h2>With your agent</h2><button className="secondary-button" disabled={memoryBusy} onClick={() => void loadMemories()}><RefreshCw size={14} /> Refresh memories</button></div>
            <p className="keeper-caption">Recalled ideas, not a transcript archive or guaranteed complete export. Memory must be enabled on this agent.</p>
            {memory.message && <div className="notice" role={memoryBusy ? "status" : "alert"}>{memory.message}{memoryBusy && <span className="memory-hint">You can keep chatting.</span>}{memory.keepers.length > 0 && <span className="memory-hint">Previously recalled ideas are shown below.</span>}{memoryBusy && <button className="memory-continue" onClick={() => { setTab("chats"); setQuery(""); }}>Continue chatting <ArrowRight size={13} /></button>}</div>}
            {memory.status === "ready" && !recalled.length && <p className="keeper-caption">{query ? "No recalled ideas match this search." : "No Oddly memories were recalled. Choose Remember this on a live answer to give an idea a home here."}</p>}
            {recalled.map(keeper => <article key={keeper.id} className="keeper-card">
              <h3>{keeper.title}</h3><div className="message-body"><Markdown text={keeper.content} /></div>
              <div className="message-actions"><button onClick={() => void copy(keeper.content)}><Copy size={14} /> Copy</button><button disabled={memoryBusy || memory.status !== "ready"} onClick={() => { setKeeperAction({ kind: "forget", keeper }); keeperDialog.current?.showModal(); }}><Trash2 size={14} /> Forget</button></div>
            </article>)}
          </section>}
          {tab === "saved" && <div className="sample-keepers-heading"><h2>Sample bookmarks</h2><p className="keeper-caption">Scripted sample answers, kept on this page only. Never sent to your agent.</p></div>}
          {!displayed.length && (!liveKeepersView || saved.length > 0) && <div className="empty-state"><Monster className="empty-monster" /><h2>{query ? "Nothing hiding here." : "Something worth keeping."}</h2><p>{query ? "Try a different search." : "Tap the heart on a sample answer to save it here for this session."}</p></div>}
          {displayed.map(message => <article key={message.id} className={`message ${message.role}`}>
            <div className="message-author">{message.role === "assistant" ? <Monster className="message-monster" /> : <UserAvatar />}<strong>{message.role === "assistant" ? "Oddly" : "You"}</strong>{message.role === "assistant" && <span>{active.live && tab !== "saved" ? "YOUR COPILOT" : "YOUR LITTLE SIDEKICK"}</span>}</div>
            {message.text && <div className="message-body">{message.role === "user" ? <p>{message.text}</p> : <Markdown text={message.text} />}</div>}
            {message.role === "assistant" && message.text && !busy && <div className="message-actions"><button onClick={() => void copy(message.text)}><Copy size={14} /> Copy</button><button disabled={active.live && tab !== "saved" && memoryBusy} onClick={() => save(message)} aria-pressed={tab !== "saved" && active.live ? keptAnswers[message.id]?.state === "remembered" && memory.status === "ready" : saved.some(entry => entry.id === message.id)}><Heart size={14} />{tab !== "saved" && active.live ? keptAnswers[message.id]?.state === "saving" ? "Saving..." : keptAnswers[message.id] ? keptAnswers[message.id].state === "remembered" && memory.status === "ready" ? "Remembered" : "Check memories" : "Remember this" : saved.some(entry => entry.id === message.id) ? "Bookmarked sample" : "Bookmark sample"}</button></div>}
          </article>)}
          {busy && <div className="thinking" role="status"><span /><span /><span />{active.live ? "Oddly is thinking..." : "Oddly is finding a sample thought..."}</div>}
          {busy && active.live && <button className="secondary-button" onClick={() => pendingRequest.current?.abort()}>Stop waiting (agent may continue)</button>}
        </section>}
      </div>
      {!atBottom && !welcome && <button className="jump-bottom" onClick={() => { setAtBottom(true); scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }}><ArrowDown size={15} /> Latest thought</button>}
      {tab === "chats" && configured && memory.status !== "ready" && memory.status !== "idle" && <div className="memory-notice" role={memoryBusy ? "status" : "alert"}><span>{memoryBusy ? <>{memory.message}<span className="memory-hint">You can keep chatting.</span></> : `Memories: ${memory.message}`}</span><button onClick={() => { setTab("saved"); setQuery(""); }}>View memories</button></div>}
      {selectionNotice && <div className="selection-notice" role="status">{selectionNotice}<button className="icon-button" aria-label="Dismiss selection notice" onClick={() => setSelectionNotice("")}><X size={16} /></button></div>}
      {error && <div className="error-box" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
      {tab === "chats" && <footer className="composer-wrap"><form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea ref={composer} value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} rows={2} placeholder="What's on your mind? Weird is welcome." aria-label="Message your copilot" disabled={busy} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
        <div className="composer-bottom"><span><Sparkles size={15} />{active.live ? "Your Copilot Studio agent" : "A little curiosity goes a long way"}</span><button className="send-button" type="submit" disabled={!draft.trim() || busy} aria-label="Send message"><ArrowUp size={21} /></button></div>
      </form><div className="composer-caption"><span>{active.live ? "AI can make mistakes. Double-check the important bits." : "Sample mode · Scripted replies, not AI. Your words stay on this page."}</span><span>Enter to send <span className="key-divider">·</span> Shift + Enter for a new line</span></div></footer>}
      <div className="toast" role="status">{toast && <><Check size={15} />{toast}</>}</div>
    </main>
    <dialog ref={dialog} className="connection-dialog" onCancel={event => { if (busy) event.preventDefault(); else setPendingAgent(null); }}>
      <div className="dialog-heading"><span className="eyebrow">YOUR AGENT. A LITTLE MORE YOU.</span><button className="icon-button" aria-label="Close connection settings" disabled={busy} onClick={() => { setPendingAgent(null); dialog.current?.close(); }}><X size={20} /></button></div>
      <h2>Bring your own agent.</h2><p>Use a published Copilot Studio agent supported by the workflow Agent Node connector. Microsoft handles sign-in and consent in the player. No app registration. No WebChat.</p>
      {pendingAgent ? <><p className="connection-summary"><strong>Switch to another agent?</strong><br /><code>{pendingAgent.schemaName}</code><br /><strong>Environment ID</strong><br /><code>{pendingAgent.environmentId}</code><br />Your current live chats and recalled memories will be cleared from this page. Remote conversations and memories will not be deleted. Any memory operation already sent may still finish for the previous agent.</p>{error && <p className="notice" role="alert">{error}</p>}<button className="primary-button" disabled={busy} onClick={() => void applyConnection(pendingAgent)}>{busy ? "Selecting agent..." : "Switch agent & clear live chats"}</button><button className="secondary-button" disabled={busy} onClick={() => { setPendingAgent(null); setEditingConnection(false); if (selectedConfig) setConfig(selectedConfig); }}>Keep current agent</button></> : configured && !editingConnection ? <><div className="connected-note"><Check size={18} /> Agent selected. Memories are recalled in the background.</div><p className="connection-summary"><strong>Agent schema name</strong><br /><code>{selectedConfig.schemaName}</code><br /><strong>Environment ID</strong><br /><code>{selectedConfig.environmentId}</code></p><button className="primary-button" disabled={busy} onClick={() => { setEditingConnection(true); setError(""); }}>Switch agent</button><button className="secondary-button" disabled={busy} onClick={disconnect}>Use sample mode & forget selection</button><p className="dialog-privacy">This clears live chats and recalled memories from this page and forgets the browser's selection. It does not sign you out of the managed player or delete remote history or memories. Requests already sent may still finish.</p></> : <form onSubmit={event => void connect(event)}>
        <div className="config-grid">{([
          ["environmentId", "Environment ID", "From your Copilot Studio URL"],
          ["schemaName", "Agent schema name", "From Settings > Agent details"],
        ] as const).map(([key, label, placeholder]) => <label key={key}>{label}<input required autoComplete="off" spellCheck={false} value={config[key]} placeholder={placeholder} disabled={busy} onChange={event => setConfig(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
        <div className="setup-note"><strong>A little setup first</strong><p>Bind the <strong>Agents / Agent Node</strong> connector (<code>shared_agentnode</code>) in action mode using the native Managed Apps CLI, with <code>InvokeAgent</code> allowed. Open its authenticated Local Play or hosted player and accept the platform's connection consent. Bare localhost supports sample mode only.</p><p><strong>Live chat is experimental:</strong> Oddly follows the connector's completion URL through the native host, respecting its retry interval, for up to three minutes. Stop waiting ends the local wait, not the agent's work. Your first message verifies whether your host and connection permit completion retrieval.</p><p>This uses the workflow Agent Node, not the classic Execute Agent and wait operation. Answers are text-only, without streaming, tool trails, or interactive cards.</p><a href="https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/connect-to-data" target="_blank" rel="noopener noreferrer">Native connector setup <ExternalLink size={13} /></a></div>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Loading connector..." : "Use this agent"}<ArrowRight size={17} /></button>
        <p className="dialog-privacy">Only the environment ID and agent schema name are remembered in this browser. Selecting an agent, or returning to it in the player, automatically asks it to recall memories and may consume credits. Live memories use the agent's native Memory setting; chats and sample bookmarks stay in page memory. The player owns authentication. Requests go to your agent, whose tools may take actions.</p>
      </form>}
    </dialog>
    <dialog ref={keeperDialog} className="connection-dialog keeper-dialog" onCancel={() => setKeeperAction(null)}>
      <div className="dialog-heading"><span className="eyebrow">A LITTLE THOUGHT, WITH A HOME.</span><button className="icon-button" aria-label="Close memory confirmation" onClick={() => { setKeeperAction(null); keeperDialog.current?.close(); }}><X size={20} /></button></div>
      {keeperAction && <form onSubmit={event => { event.preventDefault(); void changeMemory(keeperAction); }}>
        <h2>{keeperAction.kind === "remember" ? "Remember this idea?" : "Forget this memory?"}</h2>
        <p className="keeper-caption">{keeperAction.kind === "remember" ? "Oddly will save this idea in the background and check that it's remembered. You can keep chatting." : "Oddly will forget just this memory and check that it's gone. You can keep chatting; other memories stay untouched."}</p>
        {keeperAction.kind === "remember" ? <><label className="keeper-title-label">A name for this thought<input required maxLength={120} autoComplete="off" placeholder="Give this idea a name" value={keeperAction.keeper.title} onChange={event => { const title = event.target.value; setKeeperAction(previous => previous?.kind === "remember" ? { ...previous, keeper: { ...previous.keeper, title } } : previous); }} /></label><fieldset className="keeper-options"><legend>What should your agent remember?</legend>{(["idea", "summary"] as const).map(mode => <label key={mode}><input type="radio" name="remember-mode" checked={keeperAction.mode === mode} onChange={() => setKeeperAction(previous => previous?.kind === "remember" ? { ...previous, mode } : previous)} />{mode === "idea" ? "The full text below" : "A short summary"}</label>)}</fieldset><p className="keeper-caption">{keeperAction.mode === "idea" ? "Send the text below as-is, without shortening it first." : "Ask your agent to summarize the text below before saving it."} Native memory may still summarize what it recalls.</p></> : <h3>{keeperAction.keeper.title}</h3>}
        <div className="keeper-preview message-body"><Markdown text={keeperAction.keeper.content} /></div>
        <p className="dialog-privacy">Native memory is not a permanent archive. Copilot Studio deletes it after 28 days of inactivity with the agent. Changes are never retried automatically.</p>
        <button className="primary-button" type="submit" disabled={keeperAction.kind === "remember" && !keeperAction.keeper.title.trim()}>{keeperAction.kind === "remember" ? "Remember this" : "Forget this memory"}</button>
        <button className="secondary-button" type="button" onClick={() => { setKeeperAction(null); keeperDialog.current?.close(); }}>Keep things as they are</button>
      </form>}
    </dialog>
  </div>;
}
