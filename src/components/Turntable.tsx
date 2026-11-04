type TurntableProps = { cover: string | null; spinning: boolean };

export function Turntable({ cover, spinning }: TurntableProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none relative h-[200px] w-[200px] shrink-0">
      <div className="absolute inset-0 rounded-full bg-[#15110f] shadow-lg">
        <span className="absolute inset-[18%] overflow-hidden rounded-full bg-white/10">
          {cover && (
            <img
              src={cover}
              alt=""
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
              className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 [:root[data-theme=dark]_&]:outline-white/10"
            />
          )}
        </span>
      </div>
      <span
        className={`absolute right-2 top-0 h-[120px] w-[3px] origin-top rounded-full bg-white/80 motion-safe:transition-transform motion-safe:duration-swap ${
          spinning ? "rotate-[18deg]" : "rotate-[-6deg]"
        }`}
      />
    </div>
  );
}
