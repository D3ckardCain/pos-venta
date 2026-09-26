'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import {
  Award,
  Users,
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  Plus,
  Minus,
  Settings,
  KeyRound,
  History,
  AlertTriangle,
  MessageCircle,
  Send,
  Save,
  Clock,
  Percent,
  Link2,
  Share2,
} from 'lucide-react';
import type { Currency } from '@/lib/types/database';
import {
  adjustPointsAction,
  generateRedemptionCodeAction,
  applyExpirationAction,
  updatePointsSettingsAction,
  exportCustomersPointsExcel,
  exportPointsMovementsExcel,
  type ActionState,
  type CustomerWithPoints,
  type PointsMovementRow,
  type PointsSettings,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils/currency';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  initialCustomers: CustomerWithPoints[];
  initialMovements: PointsMovementRow[];
  initialSettings: PointsSettings;
  primaryCurrency: Currency | null;
}

type ViewTab = 'customers' | 'movements';

export function PuntosClient({
  initialCustomers,
  initialMovements,
  initialSettings,
  primaryCurrency,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [tab, setTab] = useState<ViewTab>('customers');
  const [settings, setSettings] = useState<PointsSettings>(initialSettings);

  const kpis = useMemo(() => {
    let withPoints = 0;
    let active = 0;
    let lifetime = 0;
    for (const c of initialCustomers) {
      if (c.points > 0) withPoints++;
      active += c.points;
      lifetime += c.lifetime_points;
    }
    const redeemed = initialMovements
      .filter((m) => m.movement_type === 'canje')
      .reduce((s, m) => s + Math.abs(m.points), 0);
    const expired = initialMovements
      .filter((m) => m.movement_type === 'expiracion')
      .reduce((s, m) => s + Math.abs(m.points), 0);

    return {
      withPoints,
      active,
      lifetime,
      redeemed,
      expired,
    };
  }, [initialCustomers, initialMovements]);

  const pointValue =
    settings.points_per_currency_unit > 0
      ? 1 / settings.points_per_currency_unit
      : 0;

  const [adjustingCustomer, setAdjustingCustomer] =
    useState<CustomerWithPoints | null>(null);
  const [generatingCodeFor, setGeneratingCodeFor] =
    useState<CustomerWithPoints | null>(null);
  const [applyingExpiration, setApplyingExpiration] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleApplyExpiration() {
    setApplyingExpiration(true);
    try {
      const res = await applyExpirationAction();
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if ((res.affected_customers ?? 0) === 0) {
        showToast('No había puntos vencidos para procesar', 'info');
      } else {
        showToast(
          `Se expiraron ${res.total_points_expired} puntos de ${res.affected_customers} cliente(s)`,
          'success'
        );
      }
      router.refresh();
    } finally {
      setApplyingExpiration(false);
    }
  }

  async function handleExportCustomers() {
    setIsExporting(true);
    try {
      const res = await exportCustomersPointsExcel({});
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Clientes exportados', 'success');
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportMovements() {
    setIsExporting(true);
    try {
      const res = await exportPointsMovementsExcel({});
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.fileBase64 && res.filename) {
        downloadExcelFromBase64(res.fileBase64, res.filename);
        showToast('Movimientos exportados', 'success');
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Puntos</h1>
          <p className="text-sm text-muted-foreground">
            Programa de fidelidad: acumulación, canje y caducidad.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleApplyExpiration}
            disabled={applyingExpiration}
          >
            <Clock className="h-4 w-4" />
            Aplicar caducidad
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
            Configuración
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Con puntos"
          value={String(kpis.withPoints)}
          hint="Clientes con saldo > 0"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Puntos activos"
          value={String(kpis.active)}
          hint={
            primaryCurrency
              ? `≈ ${formatCurrency(kpis.active * pointValue, primaryCurrency)}`
              : ''
          }
          icon={<Award className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Puntos históricos"
          value={String(kpis.lifetime)}
          hint="Total otorgado"
          icon={<TrendingUp className="h-4 w-4" />}
          tone="info"
        />
        <KpiCard
          label="Puntos canjeados"
          value={String(kpis.redeemed)}
          hint={
            primaryCurrency
              ? `≈ ${formatCurrency(kpis.redeemed * pointValue, primaryCurrency)}`
              : ''
          }
          icon={<TrendingDown className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Puntos expirados"
          value={String(kpis.expired)}
          hint="Total caducado"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <span className="font-medium">Regla actual: </span>
        {settings.points_per_currency_unit} punto(s) por cada unidad de moneda.
        {primaryCurrency && (
          <>
            {' '}
            = <strong>{formatCurrency(pointValue, primaryCurrency)}</strong> por
            punto.
          </>
        )}
        {settings.points_expiration_days > 0 ? (
          <>
            {' '}
            · Los puntos caducan a los{' '}
            <strong>{settings.points_expiration_days} días</strong>.
          </>
        ) : (
          <> · Los puntos no caducan por defecto.</>
        )}
        {' · '}
        Código de canje válido por{' '}
        <strong>{settings.points_redemption_code_minutes} minutos</strong>.
      </div>

      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab('customers')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'customers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" />
          Clientes ({initialCustomers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === 'movements'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          Movimientos ({initialMovements.length})
        </button>
      </div>

      {tab === 'customers' && (
        <CustomersTab
          customers={initialCustomers}
          primaryCurrency={primaryCurrency}
          pointValue={pointValue}
          onAdjust={(c) => setAdjustingCustomer(c)}
          onGenerateCode={(c) => setGeneratingCodeFor(c)}
          onExport={handleExportCustomers}
          isExporting={isExporting}
        />
      )}

      {tab === 'movements' && (
        <MovementsTab
          movements={initialMovements}
          onExport={handleExportMovements}
          isExporting={isExporting}
        />
      )}

      {adjustingCustomer && (
        <AdjustPointsModal
          customer={adjustingCustomer}
          primaryCurrency={primaryCurrency}
          pointValue={pointValue}
          onClose={() => setAdjustingCustomer(null)}
        />
      )}

      {generatingCodeFor && (
        <GenerateCodeModal
          customer={generatingCodeFor}
          onClose={() => setGeneratingCodeFor(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          primaryCurrency={primaryCurrency}
          onClose={() => setSettingsOpen(false)}
          onSaved={(newSettings) => {
            setSettings(newSettings);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// TAB: CLIENTES
// ============================================
function CustomersTab({
  customers,
  primaryCurrency,
  pointValue,
  onAdjust,
  onGenerateCode,
  onExport,
  isExporting,
}: {
  customers: CustomerWithPoints[];
  primaryCurrency: Currency | null;
  pointValue: number;
  onAdjust: (c: CustomerWithPoints) => void;
  onGenerateCode: (c: CustomerWithPoints) => void;
  onExport: () => void;
  isExporting: boolean;
}) {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [filterPoints, setFilterPoints] = useState<
    'all' | 'with' | 'without' | 'min100'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    let list = [...customers];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.code ?? '').toLowerCase().includes(q)
      );
    }
    if (filterPoints === 'with') list = list.filter((c) => c.points > 0);
    if (filterPoints === 'without') list = list.filter((c) => c.points === 0);
    if (filterPoints === 'min100') list = list.filter((c) => c.points >= 100);
    return list;
  }, [customers, search, filterPoints]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeFilters = (search ? 1 : 0) + (filterPoints !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterPoints('all');
    setPage(1);
  }

  // ============================================
  // Copiar link público al portapapeles
  // ============================================
  async function handleCopyLink(c: CustomerWithPoints) {
    if (!c.public_secret_code) {
      showToast('Este cliente no tiene código público generado', 'error');
      return;
    }
    const base =
      typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${base}/mis-puntos/${c.public_secret_code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copiado al portapapeles', 'success');
    } catch {
      // Fallback si el portapapeles no está disponible
      window.prompt('Copia este link:', url);
    }
  }

  // ============================================================
  // Enviar link de puntos por WhatsApp
  // ============================================================
    function handleSendPoints(c: CustomerWithPoints) {
    if (!c.public_secret_code) {
      showToast('Este cliente no tiene código público generado', 'error');
      return;
    }
    if (!c.phone) {
      showToast('Este cliente no tiene teléfono registrado', 'error');
      return;
    }

    // URL pública base: prioriza la variable de entorno (Cloudflare)
    // y cae a window.location.origin como fallback (localhost)
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    const url = `${base}/mis-puntos/${c.public_secret_code}`;

    const valueText = primaryCurrency
      ? formatCurrency(c.points * pointValue, primaryCurrency)
      : `${c.points} puntos`;

    const message =
      `Hola ${c.full_name}, te comparto tus puntos de fidelidad:\n\n` +
      `Tienes *${c.points} puntos* acumulados${primaryCurrency ? `, que equivalen a *${valueText}*` : ''}.\n\n` +
      `Míralos aquí:\n${url}`;

    const encoded = encodeURIComponent(message);
    const cleanPhone = c.phone.replace(/\D/g, '');
    window.location.href = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
  }

  const columns: Column<CustomerWithPoints>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: (c) => (
        <div>
          <p className="font-medium">{c.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {c.code ?? '—'}
            {c.phone ? ` · ${c.phone}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'points',
      header: 'Puntos',
      render: (c) => (
        <span className="font-mono text-sm font-semibold text-emerald-600">
          {c.points}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Equivalen a',
      render: (c) =>
        primaryCurrency ? (
          <span className="font-mono text-sm">
            {formatCurrency(c.points * pointValue, primaryCurrency)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'lifetime',
      header: 'Históricos',
      render: (c) => (
        <span className="font-mono text-sm text-muted-foreground">
          {c.lifetime_points}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Ajustar puntos"
            onClick={() => onAdjust(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600"
          >
            <Award className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Generar código de canje"
            onClick={() => onGenerateCode(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Copiar link público de puntos"
            onClick={() => handleCopyLink(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Enviar puntos por WhatsApp"
            onClick={() => handleSendPoints(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por nombre, email, teléfono o código…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterPoints}
              onChange={(e) => {
                setFilterPoints(e.target.value as typeof filterPoints);
                setPage(1);
              }}
              className="w-44"
            >
              <option value="all">Puntos: todos</option>
              <option value="with">Con puntos</option>
              <option value="without">Sin puntos</option>
              <option value="min100">100 puntos o más</option>
            </Select>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-3.5 w-3.5" />
                Limpiar ({activeFilters})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onExport}
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {paged.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay clientes'}
            description={
              search
                ? 'Prueba con otro término.'
                : 'Registra clientes para comenzar.'
            }
            icon={<Users className="h-8 w-8" />}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={paged} rowKey={(c) => c.id} />
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Mostrando <strong>{paged.length}</strong> de{' '}
                  <strong>{total}</strong>
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  {[10, 25, 50, 100].map((s) => (
                    <option key={s} value={s}>
                      {s} / página
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span className="px-2 text-sm">
                  Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================
// TAB: MOVIMIENTOS
// ============================================
function MovementsTab({
  movements,
  onExport,
  isExporting,
}: {
  movements: PointsMovementRow[];
  onExport: () => void;
  isExporting: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'acumulacion' | 'canje' | 'expiracion' | 'ajuste'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    let list = [...movements];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.customer_name ?? '').toLowerCase().includes(q) ||
          (m.customer_phone ?? '').toLowerCase().includes(q) ||
          (m.description ?? '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all')
      list = list.filter((m) => m.movement_type === filterType);
    return list;
  }, [movements, search, filterType]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeFilters = (search ? 1 : 0) + (filterType !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterType('all');
    setPage(1);
  }

  const columns: Column<PointsMovementRow>[] = [
    {
      key: 'created_at',
      header: 'Fecha',
      render: (m) => (
        <span className="text-sm">
          {new Date(m.created_at).toLocaleString('es-MX')}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (m) => (
        <div>
          <p className="text-sm font-medium">{m.customer_name ?? '—'}</p>
          {m.customer_phone && (
            <p className="text-xs text-muted-foreground">{m.customer_phone}</p>
          )}
        </div>
      ),
    },
    {
      key: 'movement_type',
      header: 'Tipo',
      render: (m) => <MovementTypeBadge type={m.movement_type} />,
    },
    {
      key: 'points',
      header: 'Puntos',
      render: (m) => (
        <span
          className={`font-mono text-sm font-semibold ${
            m.points > 0 ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {m.points > 0 ? `+${m.points}` : m.points}
        </span>
      ),
    },
    {
      key: 'balance_after',
      header: 'Saldo',
      render: (m) => (
        <span className="font-mono text-sm">{m.balance_after}</span>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (m) => (
        <span className="text-sm text-muted-foreground">
          {m.description ?? '—'}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (m) => (
        <span className="text-xs text-muted-foreground">
          {m.user_name ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por cliente, teléfono o descripción…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as typeof filterType);
                setPage(1);
              }}
              className="w-44"
            >
              <option value="all">Tipo: todos</option>
              <option value="acumulacion">Acumulación</option>
              <option value="canje">Canje</option>
              <option value="expiracion">Expiración</option>
              <option value="ajuste">Ajuste</option>
            </Select>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-3.5 w-3.5" />
                Limpiar ({activeFilters})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onExport}
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {paged.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Los movimientos aparecerán aquí."
            icon={<History className="h-8 w-8" />}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={paged} rowKey={(m) => m.id} />
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Mostrando <strong>{paged.length}</strong> de{' '}
                  <strong>{total}</strong>
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  {[25, 50, 100, 200].map((s) => (
                    <option key={s} value={s}>
                      {s} / página
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span className="px-2 text-sm">
                  Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================
// MODAL AJUSTAR PUNTOS
// ============================================
function AdjustPointsModal({
  customer,
  primaryCurrency,
  pointValue,
  onClose,
}: {
  customer: CustomerWithPoints;
  primaryCurrency: Currency | null;
  pointValue: number;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [state, formAction] = useFormState(
    adjustPointsAction,
    initialActionState
  );
  const [points, setPoints] = useState('0');

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Puntos ajustados', 'success');
        router.refresh();
        onClose();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  const pointsNum = Number(points) || 0;
  const newBalance = customer.points + pointsNum;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ajustar puntos - ${customer.full_name}`}
      description="Los ajustes quedan registrados en el historial."
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="customer_id" value={customer.id} />

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Puntos actuales</p>
          <p className="mt-1 text-2xl font-semibold">{customer.points}</p>
          {primaryCurrency && (
            <p className="text-xs text-muted-foreground">
              ≈ {formatCurrency(customer.points * pointValue, primaryCurrency)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPoints(String(pointsNum - 50))}
          >
            <Minus className="h-3.5 w-3.5" />
            50
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPoints(String(pointsNum + 50))}
          >
            <Plus className="h-3.5 w-3.5" />
            50
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPoints(String(pointsNum + 100))}
          >
            <Plus className="h-3.5 w-3.5" />
            100
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPoints('0')}
          >
            Reiniciar
          </Button>
        </div>

        <Input
          label="Puntos a ajustar"
          name="points"
          type="number"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          error={state.fieldErrors?.points}
          required
          hint={
            primaryCurrency
              ? `Equivale a ${formatCurrency(pointsNum * pointValue, primaryCurrency)}`
              : 'Positivo para añadir, negativo para canjear.'
          }
        />

        {pointsNum !== 0 && (
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">Nuevo saldo</p>
            <p className="mt-1 text-xl font-semibold">
              {newBalance}
              {primaryCurrency && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (≈ {formatCurrency(newBalance * pointValue, primaryCurrency)})
                </span>
              )}
            </p>
          </div>
        )}

        <Textarea
          label="Motivo"
          name="reason"
          rows={3}
          placeholder="Ej: Compensación por error, canje manual…"
          error={state.fieldErrors?.reason}
          required
        />

        {state.error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton loadingText="Aplicando...">Aplicar</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// MODAL GENERAR CÓDIGO DE CANJE
// ============================================
function GenerateCodeModal({
  customer,
  onClose,
}: {
  customer: CustomerWithPoints;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await generateRedemptionCodeAction(customer.id);
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      if (res.code) {
        setCode(res.code);
        setExpiresAt(res.expires_at ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  function sendByWhatsApp() {
    if (!code || !customer.phone) return;
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const message =
      `Hola ${customer.full_name}, tu código para canjear tus puntos es:\n\n` +
      `*${code}*\n\n` +
      `Válido por ${expiresAt ? 'unos minutos' : 'poco tiempo'}. Muéstralo al vendedor cuando estés en la tienda.`;
    const encoded = encodeURIComponent(message);

    // Intenta abrir la app nativa; si no está, el navegador pregunta.
    window.location.href = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Código de canje - ${customer.full_name}`}
      description="Envía este código al cliente por WhatsApp. Expira en pocos minutos."
    >
      <div className="space-y-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Generando código…
          </p>
        ) : code ? (
          <>
            <div className="rounded-lg border bg-primary/5 p-6 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Código de canje
              </p>
              <p className="mt-2 font-mono text-4xl font-bold tracking-widest text-primary">
                {code}
              </p>
              {expiresAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expira: {new Date(expiresAt).toLocaleTimeString('es-MX')}
                </p>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Puntos del cliente</p>
              <p className="mt-1 text-lg font-semibold">{customer.points}</p>
            </div>

            {customer.phone ? (
              <Button onClick={sendByWhatsApp} className="w-full">
                <MessageCircle className="h-4 w-4" />
                Enviar por WhatsApp
              </Button>
            ) : (
              <div
                role="alert"
                className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-700"
              >
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Este cliente no tiene teléfono registrado. Añádelo primero.
              </div>
            )}

            <Button variant="outline" onClick={generate} className="w-full">
              <Send className="h-4 w-4" />
              Regenerar código
            </Button>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No se pudo generar el código.
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// MODAL CONFIGURACIÓN
// ============================================
function SettingsModal({
  settings,
  primaryCurrency,
  onClose,
  onSaved,
}: {
  settings: PointsSettings;
  primaryCurrency: Currency | null;
  onClose: () => void;
  onSaved: (s: PointsSettings) => void;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [state, formAction] = useFormState(
    updatePointsSettingsAction,
    initialActionState
  );
  const [perUnit, setPerUnit] = useState(
    String(settings.points_per_currency_unit)
  );
  const [expDays, setExpDays] = useState(
    String(settings.points_expiration_days)
  );
  const [codeMin, setCodeMin] = useState(
    String(settings.points_redemption_code_minutes)
  );

  useEffect(() => {
    if (state.timestamp > 0) {
      if (state.success) {
        showToast('Configuración guardada', 'success');
        onSaved({
          points_per_currency_unit: Number(perUnit) || 0,
          points_expiration_days: Number(expDays) || 0,
          points_redemption_code_minutes: Number(codeMin) || 15,
        });
        router.refresh();
      } else if (state.error) {
        showToast(state.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timestamp]);

  const perUnitNum = Number(perUnit) || 0;
  const pointValue = perUnitNum > 0 ? 1 / perUnitNum : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Configuración de puntos"
      description="Ajusta cómo se acumulan, caducan y validan los puntos."
      size="md"
    >
      <form action={formAction} className="space-y-4">
        <div>
          <Input
            label="Puntos por unidad de moneda"
            name="points_per_currency_unit"
            type="number"
            step="0.01"
            min="0"
            value={perUnit}
            onChange={(e) => setPerUnit(e.target.value)}
            error={state.fieldErrors?.points_per_currency_unit}
            required
            hint="Puntos otorgados por cada unidad de moneda gastada."
          />
          {primaryCurrency && perUnitNum > 0 && (
            <div className="mt-2 rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <Percent className="mr-1 inline h-3.5 w-3.5" />
              Cada punto vale{' '}
              <strong>{formatCurrency(pointValue, primaryCurrency)}</strong>. Es
              decir, con {perUnitNum} puntos obtienes{' '}
              {formatCurrency(1, primaryCurrency)}.
            </div>
          )}
        </div>

        <Input
          label="Días de caducidad"
          name="points_expiration_days"
          type="number"
          step="1"
          min="0"
          value={expDays}
          onChange={(e) => setExpDays(e.target.value)}
          error={state.fieldErrors?.points_expiration_days}
          required
          hint="0 = los puntos no caducan nunca. Mayor a 0 = caducan después de esos días."
        />

        <Input
          label="Minutos de validez del código de canje"
          name="points_redemption_code_minutes"
          type="number"
          step="1"
          min="1"
          value={codeMin}
          onChange={(e) => setCodeMin(e.target.value)}
          error={state.fieldErrors?.points_redemption_code_minutes}
          required
          hint="Por defecto 15 minutos. Después el código se invalida."
        />

        {state.error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton loadingText="Guardando...">
            <Save className="h-4 w-4" />
            Guardar
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// AUXILIARES
// ============================================
function MovementTypeBadge({ type }: { type: string }) {
  const map: Record<
    string,
    {
      tone: 'success' | 'warning' | 'destructive' | 'info' | 'default';
      label: string;
    }
  > = {
    acumulacion: { tone: 'success', label: 'Acumulación' },
    canje: { tone: 'warning', label: 'Canje' },
    expiracion: { tone: 'destructive', label: 'Expiración' },
    ajuste: { tone: 'info', label: 'Ajuste' },
  };
  const cfg = map[type] ?? { tone: 'default' as const, label: type };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'info' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'warning'
      ? 'bg-amber-50 text-amber-600'
      : tone === 'info'
      ? 'bg-blue-50 text-blue-600'
      : tone === 'danger'
      ? 'bg-red-50 text-red-600'
      : 'bg-primary/10 text-primary';
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
          {hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function downloadExcelFromBase64(base64: string, filename: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}