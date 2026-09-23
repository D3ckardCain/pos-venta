'use client';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  const windowSize = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - windowSize && i <= page + windowSize)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          Mostrando <strong>{from}</strong>-<strong>{to}</strong> de{' '}
          <strong>{total}</strong>
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
          aria-label="Registros por pagina"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / pagina
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
        >
          Anterior
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="px-2 text-sm text-muted-foreground">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={
                p === page
                  ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                  : 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted'
              }
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}