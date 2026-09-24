'use client';

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { Save, Coins, Settings2, DollarSign } from 'lucide-react';
import type { SystemSetting, CurrencySetting } from '@/lib/types/database';
import {
  updateSystemSettingsAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';

const initialActionState: ActionState = { error: null, success: false };

interface Props {
  initialSettings: SystemSetting[];
  currencySettings: CurrencySetting | null;
}

function getSetting<T = unknown>(
  settings: SystemSetting[],
  key: string,
  fallback: T
): T {
  const found = settings.find((s) => s.key === key);
  return (found?.value as T) ?? fallback;
}

export function ConfiguracionClient({ initialSettings, currencySettings }: Props) {
  const { showToast } = useToast();
  const [state, formAction] = useFormState(
    updateSystemSettingsAction,
    initialActionState
  );

  if (state.success) {
    showToast('Configuración guardada', 'success');
  }

  const fieldErrors = state.fieldErrors ?? {};

  const businessName = getSetting(initialSettings, 'business_name', 'Mi Negocio');
  const businessPhone = getSetting(initialSettings, 'business_phone', '');
  const catalogUrl = getSetting(initialSettings, 'catalog_url', '');
  const whatsappTemplate = getSetting(
    initialSettings,
    'whatsapp_message_template',
    ''
  );
  const pointsPerUnit = getSetting(
    initialSettings,
    'points_per_currency_unit',
    1
  );
  const allowNegative = getSetting(
    initialSettings,
    'allow_negative_stock',
    false
  );
  const lowStockThreshold = getSetting(
    initialSettings,
    'low_stock_threshold',
    5
  );
  const paymentCycle = getSetting(initialSettings, 'payment_cycle', 'weekly');
  const paymentCycleStartDay = getSetting(
    initialSettings,
    'payment_cycle_start_day',
    1
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Ajustes generales del sistema.
        </p>
      </div>

      {/* Moneda principal */}
      <div className="rounded-lg border bg-background p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Moneda principal</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Se usa para reportes, utilidades y consolidación.
              </p>
              <div className="mt-2 flex items-center gap-2">
                {currencySettings?.primary_currency ? (
                  <>
                    <Badge tone="success">
                      {currencySettings.primary_currency.code}
                    </Badge>
                    <span className="text-sm">
                      {currencySettings.primary_currency.name} (
                      {currencySettings.primary_currency.symbol})
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No configurada
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link href="/admin/monedas">
            <Button variant="outline" size="sm">
              Gestionar monedas
            </Button>
          </Link>
        </div>
      </div>

      {/* Formulario */}
      <form action={formAction} className="space-y-6">
        {/* Datos del negocio */}
        <div className="rounded-lg border bg-background p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Datos del negocio</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre del negocio"
              name="business_name"
              defaultValue={String(businessName)}
              error={fieldErrors.business_name}
              required
            />
            <Input
              label="Teléfono del negocio (WhatsApp)"
              name="business_phone"
              placeholder="+52 55 1234 5678"
              defaultValue={String(businessPhone)}
              error={fieldErrors.business_phone}
              hint="Se usa para enlaces wa.me prellenados."
            />
          </div>
          <div className="mt-4">
            <Input
              label="URL pública del catálogo"
              name="catalog_url"
              type="url"
              placeholder="https://midominio.com/catalogo"
              defaultValue={String(catalogUrl)}
              error={fieldErrors.catalog_url}
            />
          </div>
          <div className="mt-4">
            <Textarea
              label="Plantilla de mensaje WhatsApp"
              name="whatsapp_message_template"
              rows={3}
              placeholder="Hola, te comparto nuestro catálogo actualizado:"
              defaultValue={String(whatsappTemplate)}
              error={fieldErrors.whatsapp_message_template}
              hint="Se usará como prefijo al compartir el catálogo. El enlace se añade automáticamente."
            />
          </div>
        </div>

        {/* Inventario y puntos */}
        <div className="rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold">Inventario y puntos</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Puntos por unidad de moneda"
              name="points_per_currency_unit"
              type="number"
              min={0}
              max={1000}
              step="0.01"
              defaultValue={Number(pointsPerUnit)}
              error={fieldErrors.points_per_currency_unit}
              hint="Puntos otorgados por cada unidad de moneda gastada."
            />
            <Input
              label="Umbral de stock bajo"
              name="low_stock_threshold"
              type="number"
              min={0}
              defaultValue={Number(lowStockThreshold)}
              error={fieldErrors.low_stock_threshold}
              hint="Productos con stock ≤ este valor se marcan como bajo."
            />
          </div>
          <div className="mt-4">
            <Checkbox
              name="allow_negative_stock"
              label="Permitir stock negativo"
              hint="No recomendado. Solo si tu operación lo requiere."
              defaultChecked={Boolean(allowNegative)}
            />
          </div>
        </div>

        {/* Ciclo de pagos a vendedores */}
        <div className="rounded-lg border bg-background p-5">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">
              Ciclo de pagos a vendedores y mensajeros
            </h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            El ciclo solo agrupa los pagos visualmente. Tú decides cuándo pagar.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Frecuencia del ciclo"
              name="payment_cycle"
              defaultValue={String(paymentCycle)}
              error={fieldErrors.payment_cycle}
            >
              <option value="manual">Manual (sin ciclo definido)</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
            </Select>
            <Input
              label="Día de inicio del ciclo"
              name="payment_cycle_start_day"
              type="number"
              min={1}
              max={31}
              defaultValue={Number(paymentCycleStartDay)}
              error={fieldErrors.payment_cycle_start_day}
              hint="1-7 para semanas (1=lunes). 1-31 para meses."
            />
          </div>
        </div>

        {state.error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit">
            <Save className="h-4 w-4" />
            Guardar configuración
          </Button>
        </div>
      </form>
    </div>
  );
}