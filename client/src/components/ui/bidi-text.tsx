interface BidiTextProps {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "p" | "div";
}

export function BidiText({ children, className = "", as: Tag = "span" }: BidiTextProps) {
  return (
    <Tag
      className={className}
      style={{ unicodeBidi: "plaintext", direction: "rtl" }}
    >
      {children}
    </Tag>
  );
}

export function LtrInline({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} dir="ltr" style={{ unicodeBidi: "embed", display: "inline-block" }}>
      {children}
    </span>
  );
}
