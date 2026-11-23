import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MAX_TAGS_PER_NODE, normalizeTag, normalizeTags } from "@/lib/mindmap-data";

interface TagEditorProps {
  tags: string[];
  /** Tags used anywhere in the map, offered as completions. */
  suggestions: string[];
  onChange: (tags: string[]) => void;
  /** The user picked a tag chip: show the nodes that carry it. */
  onFind: (tag: string) => void;
}

const chipButton =
  "py-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * The selected node's tags as chips, and a field to add more. Enter or a comma adds what was typed
 * (several at once when pasted with commas), Backspace in the empty field removes the last tag, and
 * leaving the field adds a half-typed tag rather than losing it. Each add or remove is one undo step.
 */
export function TagEditor({ tags, suggestions, onChange, onFind }: TagEditorProps) {
  const uid = useId();
  const listId = `${uid}-suggestions`;
  const hintId = `${uid}-hint`;
  const [draft, setDraft] = useState("");
  /** What the last add or remove did, for assistive technology. */
  const [note, setNote] = useState("");
  const full = tags.length >= MAX_TAGS_PER_NODE;

  const say = (text: string) => setNote((current) => (current === text ? `${text}\u200B` : text));

  const add = (raw: string) => {
    if (!raw.trim()) return;
    const added = [...new Set(raw.split(",").map(normalizeTag))]
      .filter((tag): tag is string => tag !== null && !tags.includes(tag))
      .slice(0, Math.max(0, MAX_TAGS_PER_NODE - tags.length));
    if (added.length === 0) {
      say(full ? `This node already has ${MAX_TAGS_PER_NODE} tags.` : "No new tag: it is already on this node or has no letters or digits.");
      return;
    }
    onChange(normalizeTags([...tags, ...added]));
    say(`Added ${added.map((tag) => `#${tag}`).join(", ")}.`);
  };

  const remove = (tag: string) => {
    onChange(tags.filter((entry) => entry !== tag));
    say(`Removed #${tag}.`);
  };

  const commitDraft = () => {
    add(draft);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      event.preventDefault();
      remove(tags[tags.length - 1]);
    }
  };

  /** A pasted or completed value with commas adds every finished tag and keeps the unfinished tail. */
  const onInput = (value: string) => {
    if (!value.includes(",")) {
      setDraft(value);
      return;
    }
    const parts = value.split(",");
    const tail = parts.pop() ?? "";
    add(parts.join(","));
    setDraft(tail);
  };

  const completions = suggestions.filter((tag) => !tags.includes(tag));

  return (
    <div className="space-y-1.5">
      {tags.length > 0 && (
        <ul aria-label="Tags on this node" className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex items-stretch overflow-hidden rounded-full border border-border bg-muted text-xs text-foreground">
              <button type="button" aria-label={`#${tag}, find nodes with this tag`} onClick={() => onFind(tag)} className={`${chipButton} rounded-l-full pr-1 pl-2 [overflow-wrap:anywhere]`}>
                #{tag}
              </button>
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)} className={`${chipButton} grid w-6 place-items-center rounded-r-full`}>
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="text"
        list={listId}
        value={draft}
        onChange={(event) => onInput(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commitDraft}
        placeholder={full ? `${MAX_TAGS_PER_NODE} tags at most` : "Add a tag"}
        aria-label="Add a tag"
        aria-describedby={hintId}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={full}
      />
      <datalist id={listId}>
        {completions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <p id={hintId} className="text-xs text-muted-foreground">
        Enter or a comma adds the tag; Backspace in the empty field removes the last one. Tags are kept lower-case.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}
