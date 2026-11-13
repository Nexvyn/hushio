import { useEffect, useState } from "react";
import { CheckmarkCircle01Icon, Copy01Icon, Group01Icon, Link01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { useListenTogetherSync } from "../lib/listenTogetherSync";
import { freshRoomCode, useListenTogether } from "../stores/listenTogether";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-wash px-4 text-[14px] font-medium text-ink-1 motion-safe:transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Icon icon={copied ? CheckmarkCircle01Icon : Copy01Icon} />
      {copied ? "Copied" : label}
    </button>
  );
}

export function ListenTogetherView() {
  const room = useListenTogether((state) => state.room);
  const join = useListenTogether((state) => state.join);
  const leave = useListenTogether((state) => state.leave);
  const approve = useListenTogether((state) => state.approve);
  const reject = useListenTogether((state) => state.reject);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useListenTogetherSync();

  useEffect(() => () => leave(), [leave]);

  const create = async () => {
    const fresh = freshRoomCode();
    setCode(fresh);
    await join(fresh, name, "host");
  };

  const enter = async () => {
    await join(code, name, "guest");
  };

  if (room.status === "joined") {
    return (
      <div className="pb-16">
        <PageHeader title="Listen together" meta={`Room ${room.code}`} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CopyButton value={room.code} label="Copy the code" />
          <Button onClick={leave}>Leave</Button>
        </div>
        {room.error && (
          <p role="alert" className="mt-4 text-[13px] text-danger-text">
            {room.error}
          </p>
        )}

        <section className="mt-8">
          <SectionHeader title="Now playing" />
          {room.state ? (
            <div className="flex items-center gap-3">
              {room.state.thumb ? (
                <img src={room.state.thumb} alt="" className="size-14 shrink-0 rounded-[9px] object-cover" />
              ) : (
                <span aria-hidden="true" className="size-14 shrink-0 rounded-[9px] bg-wash" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink-1">{room.state.title}</p>
                <p className="truncate text-[13px] text-ink-2">{room.state.artist}</p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">Nothing is playing yet.</p>
          )}
        </section>

        <section className="mt-8">
          <SectionHeader title="People" count={room.members.length} />
          <ul className="divide-y divide-separator overflow-hidden rounded-[11px] border border-separator bg-panel">
            {room.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className="text-ink-2">
                  <Icon icon={Group01Icon} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-1">{member.name}</span>
                {member.isHost && <span className="text-[12px] text-ink-2">Host</span>}
              </li>
            ))}
            {room.members.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-ink-2">Nobody else is here yet.</li>
            )}
          </ul>
        </section>

        {room.role === "host" && room.suggestions.length > 0 && (
          <section className="mt-8">
            <SectionHeader title="Suggestions" count={room.suggestions.length} />
            <ul className="divide-y divide-separator overflow-hidden rounded-[11px] border border-separator bg-panel">
              {room.suggestions.map((suggestion) => (
                <li key={suggestion.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink-1">{suggestion.title}</p>
                    <p className="truncate text-[12px] text-ink-2">
                      {suggestion.artist} · from {suggestion.fromName}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Accept ${suggestion.title}`}
                    onClick={() => approve(suggestion.id)}
                    className="hit-area flex h-9 w-9 items-center justify-center rounded-full text-ink-2 motion-safe:transition-colors hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Icon icon={CheckmarkCircle01Icon} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Turn down ${suggestion.title}`}
                    onClick={() => reject(suggestion.id)}
                    className="hit-area flex h-9 w-9 items-center justify-center rounded-full text-ink-2 motion-safe:transition-colors hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Icon icon={UserAdd01Icon} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader title="Listen together" meta="Play the same song at the same time" />
      <div className="mt-6 max-w-[560px] space-y-6">
        <label className="block text-[13px] font-medium text-ink-1">
          Your name
          <input
            type="text"
            value={name}
            maxLength={40}
            placeholder="Your name"
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-[12px] border border-separator bg-panel px-3 text-[14px] text-ink-1 placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>

        <section>
          <SectionHeader title="Start a room" />
          <p className="mb-3 text-[13px] text-ink-2">
            You get a short code. Anyone with the code can join and listen along.
          </p>
          <Button variant="primary" onClick={() => void create()}>
            <span className="flex items-center gap-2">
              <Icon icon={Group01Icon} />
              Create a room
            </span>
          </Button>
        </section>

        <section>
          <SectionHeader title="Join a room" />
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 text-[13px] font-medium text-ink-1">
              Room code
              <input
                type="text"
                value={code}
                maxLength={6}
                placeholder="ABC123"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="mt-1 h-10 w-full rounded-[12px] border border-separator bg-panel px-3 text-[14px] uppercase text-ink-1 placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </label>
            <Button onClick={() => void enter()}>
              <span className="flex items-center gap-2">
                <Icon icon={Link01Icon} />
                Join
              </span>
            </Button>
          </div>
        </section>

        {room.error && (
          <p role="alert" className="text-[13px] text-danger-text">
            {room.error}
          </p>
        )}
      </div>
    </div>
  );
}
