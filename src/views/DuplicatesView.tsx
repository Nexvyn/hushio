import { useMemo } from "react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Button } from "../components/Button";
import { PILL } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { type DuplicateGroup, findDuplicates, keepExactCopies, keepOne, placeLabel } from "../lib/duplicates";
import { plural } from "../lib/plural";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

function DuplicateCard({ group }: { group: DuplicateGroup }) {
  const first = group.copies[0].track;
  return (
    <article className="rounded-[14px] bg-wash p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink-1">{first.title}</p>
          <p className="truncate text-[12.5px] text-ink-2">{first.artist}</p>
        </div>
        <Button aria-label={`Keep one copy of ${first.title}`} onClick={() => keepOne(group)}>
          Keep one
        </Button>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-[13px] text-ink-2">
        {group.copies.map((copy, index) => (
          <li key={`${group.key}-${index}`} className="flex min-w-0 justify-between gap-3">
            <span className="truncate">{copy.track.title}</span>
            <span className="shrink-0">{placeLabel(copy.place)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function GroupList({ label, groups }: { label: string; groups: DuplicateGroup[] }) {
  return (
    <section aria-label={label} className="mt-7">
      <SectionHeader title={label} count={groups.length} />
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.key}>
            <DuplicateCard group={group} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DuplicatesView() {
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const { exact, likely } = useMemo(() => findDuplicates(liked, playlists), [liked, playlists]);
  const total = exact.length + likely.length;

  const removeAllExtra = () => {
    const extra = exact.reduce((sum, group) => sum + group.copies.length - 1, 0);
    keepExactCopies(exact);
    useUI.getState().toast(`Removed ${plural(extra, "extra copy", "extra copies")}`, "success");
  };

  return (
    <div className="pb-16">
      <CollectionHero
        title="Find duplicates"
        covers={[]}
        facts={total === 0 ? "Nothing saved twice" : plural(total, "group", "groups")}
      >
        {exact.length > 0 && (
          <button type="button" onClick={removeAllExtra} className={PILL}>
            Remove all extra copies
          </button>
        )}
      </CollectionHero>

      {total === 0 ? (
        <div className="mt-6">
          <EmptyState
            centered
            icon={Copy01Icon}
            title="No duplicates found"
            message="Songs saved more than once in Liked Songs or a playlist will show up here."
          />
        </div>
      ) : (
        <>
          {exact.length > 0 && <GroupList label="Exact duplicates" groups={exact} />}
          {likely.length > 0 && <GroupList label="Likely duplicates" groups={likely} />}
        </>
      )}
    </div>
  );
}
