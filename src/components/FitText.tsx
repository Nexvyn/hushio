type FitTextProps = {
  text: string;
  lines?: 1 | 2;
  className?: string;
};

export function FitText({ text, lines = 1, className = "" }: FitTextProps) {
  return (
    <span title={text} className={`${lines === 2 ? "fit-text-2" : "fit-text"} ${className}`}>
      {text}
    </span>
  );
}
