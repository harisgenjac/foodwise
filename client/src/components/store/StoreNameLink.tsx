import { Link } from "react-router-dom";

interface StoreNameLinkProps {
  storeId: number;
  name: string;
  // Extra layout classes from the caller, e.g. "block" inside a truncated cell.
  className?: string;
}

// A store name that links to the store's profile; long names are truncated, the full name is in the title.
function StoreNameLink({ storeId, name, className = "" }: StoreNameLinkProps) {
  return (
    <Link
      to={`/stores/${storeId}`}
      title={name}
      className={`min-w-0 truncate rounded font-semibold text-neutral-800 transition-colors hover:text-brand-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${className}`}
    >
      {name}
    </Link>
  );
}

export default StoreNameLink;
