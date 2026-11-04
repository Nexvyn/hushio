export function BrowseSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="h-[320px] rounded-[18px] bg-wash bt-skeleton" />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[52px] items-center gap-3 px-2">
            <span className="h-10 w-10 shrink-0 rounded-md bg-wash" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="block h-3 w-[36%] rounded bg-wash" />
              <span className="block h-2.5 w-[20%] rounded bg-wash" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
