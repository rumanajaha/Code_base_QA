export default function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small-brand" : ""}`}>
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        codebase<span className="brand-period">.</span>
      </span>
    </span>
  );
}
