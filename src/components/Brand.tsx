import { ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/">
      <span className="brand-mark"><ScanSearch size={20} strokeWidth={2.2} /></span>
      <span>
        Traceprint
        {!compact && <small>Fingerprint comparison lab</small>}
      </span>
    </Link>
  );
}
