'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const movementSchema = z.object({
  cash_session_id: z.string().uuid(),
  movement_type: z.enum(['entrada', 'salida', 'retiro', 'deposito', 'ajuste']),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  currency_id: z.string().uuid('Moneda requerida'),
  description: z.string().trim().min(3, 'Descripcion requerida').max(500),
});

const closeMethodSchema = z.object({
  session_id: z.string().uuid(),
  currency_id: z.string().uuid(),
  payment_method_id: z.string().uuid(),
  counted_amount: z.coerce.number().min(0, 'No puede ser negativo'),
  notes: z.string().trim().max(500).optional().nullable(),
});

const resolveDifferenceSchema = z.object({
  difference_id: z.string().uuid(),
  amount: z.coerce.number(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export interface ActionState {
  error: string | null;
  success: boolean;
  timestamp: number;
  fieldErrors?: Record<string, string>;
}

function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ============================================
// REGISTRAR MOVIMIENTO MANUAL
// ============================================

export async function createCashMovementAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    cash_session_id: formData.get('cash_session_id'),
    movement_type: formData.get('movement_type'),
    amount: formData.get('amount'),
    currency_id: formData.get('currency_id'),
    description: formData.get('description'),
  };

  const parsed = movementSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: session } = await supabase
    .from('cash_sessions')
    .select('status')
    .eq('id', parsed.data.cash_session_id)
    .single();

  if (!session) {
    return {
      error: 'Sesion no encontrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (session.status !== 'abierta') {
    return {
      error: 'La sesion no esta abierta',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: lastMovement } = await supabase
    .from('cash_movements')
    .select('balance_after')
    .eq('cash_session_id', parsed.data.cash_session_id)
    .eq('currency_id', parsed.data.currency_id)
    .neq('movement_type', 'cierre')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentBalance = Number(lastMovement?.balance_after ?? 0);

  const isAddition = ['entrada', 'deposito'].includes(parsed.data.movement_type);
  const newBalance = isAddition
    ? currentBalance + parsed.data.amount
    : currentBalance - parsed.data.amount;

  if (newBalance < 0) {
    return {
      error: `Saldo insuficiente en esa moneda. Saldo actual: ${currentBalance.toFixed(2)}`,
      success: false,
      timestamp: Date.now(),
    };
  }

  const userRes = await supabase.auth.getUser();

  const { error } = await supabase.from('cash_movements').insert({
    cash_session_id: parsed.data.cash_session_id,
    movement_type: parsed.data.movement_type,
    currency_id: parsed.data.currency_id,
    amount: parsed.data.amount,
    balance_after: newBalance,
    description: parsed.data.description,
    created_by: userRes.data.user?.id ?? null,
  });

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/cajas');
  revalidatePath(`/admin/cajas/sesiones/${parsed.data.cash_session_id}`);
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// CERRAR UN MÉTODO (moneda + método de pago)
// ============================================

export async function closeSessionMethodAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    session_id: formData.get('session_id'),
    currency_id: formData.get('currency_id'),
    payment_method_id: formData.get('payment_method_id'),
    counted_amount: formData.get('counted_amount'),
    notes: formData.get('notes') || null,
  };

  const parsed = closeMethodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(name)')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .single();

  const role = (profile as { role?: { name?: string } } | null)?.role?.name;
  if (role !== 'admin') {
    return {
      error: 'Solo el administrador puede cerrar metodos de pago',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: session } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('id', parsed.data.session_id)
    .single();

  if (!session) {
    return {
      error: 'Sesion no encontrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (session.status === 'cerrada') {
    return {
      error: 'La sesion ya esta cerrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: existingClose } = await supabase
    .from('cash_movements')
    .select('id')
    .eq('cash_session_id', parsed.data.session_id)
    .eq('currency_id', parsed.data.currency_id)
    .eq('payment_method_id', parsed.data.payment_method_id)
    .eq('movement_type', 'cierre')
    .maybeSingle();

  if (existingClose) {
    return {
      error: 'Este metodo de pago ya fue cerrado',
      success: false,
      timestamp: Date.now(),
    };
  }

  const { data: movements } = await supabase
    .from('cash_movements')
    .select('movement_type, amount')
    .eq('cash_session_id', parsed.data.session_id)
    .eq('currency_id', parsed.data.currency_id)
    .eq('payment_method_id', parsed.data.payment_method_id)
    .neq('movement_type', 'cierre');

  let expected = 0;
  for (const m of movements ?? []) {
    const amt = Number(m.amount);
    if (
      m.movement_type === 'entrada' ||
      m.movement_type === 'deposito' ||
      m.movement_type === 'venta'
    ) {
      expected += amt;
    } else if (
      m.movement_type === 'salida' ||
      m.movement_type === 'retiro' ||
      m.movement_type === 'devolucion'
    ) {
      expected -= amt;
    }
  }

  // Diferencia calculada desde la posición del admin:
  // Si contado < esperado → falta dinero → negativo → vendedor me debe.
  // Si contado > esperado → sobra dinero → positivo → yo le debo al vendedor.
  const difference = parsed.data.counted_amount - expected;

  const userRes = await supabase.auth.getUser();
  const userId = userRes.data.user?.id ?? null;

  const { data: closeMovement, error: closeError } = await supabase
    .from('cash_movements')
    .insert({
      cash_session_id: parsed.data.session_id,
      movement_type: 'cierre',
      currency_id: parsed.data.currency_id,
      amount: 0,
      balance_after: parsed.data.counted_amount,
      payment_method_id: parsed.data.payment_method_id,
      description: `Cierre. Esperado: ${expected.toFixed(2)}. Contado: ${parsed.data.counted_amount.toFixed(2)}. Diferencia: ${difference.toFixed(2)}`,
      created_by: userId,
    })
    .select('id')
    .single();

  if (closeError) {
    return { error: closeError.message, success: false, timestamp: Date.now() };
  }

  if (difference !== 0 && closeMovement) {
    await supabase.from('cash_differences').insert({
      cash_session_id: parsed.data.session_id,
      cash_movement_id: closeMovement.id,
      user_id: session.opened_by,
      currency_id: parsed.data.currency_id,
      payment_method_id: parsed.data.payment_method_id,
      expected_amount: expected,
      counted_amount: parsed.data.counted_amount,
      difference,
      resolved_amount: 0,
      status: 'pendiente',
      notes: parsed.data.notes || null,
    });
  }

  // Verificar si TODOS los métodos ya están cerrados
  const { data: allMethods } = await supabase
    .from('cash_movements')
    .select('currency_id, payment_method_id')
    .eq('cash_session_id', parsed.data.session_id)
    .neq('movement_type', 'cierre');

  const requiredSet = new Set<string>();
  for (const m of allMethods ?? []) {
    if (m.payment_method_id) {
      requiredSet.add(`${m.currency_id}::${m.payment_method_id}`);
    }
  }

  const { data: closedMethods } = await supabase
    .from('cash_movements')
    .select('currency_id, payment_method_id')
    .eq('cash_session_id', parsed.data.session_id)
    .eq('movement_type', 'cierre');

  const closedSet = new Set<string>();
  for (const m of closedMethods ?? []) {
    if (m.payment_method_id) {
      closedSet.add(`${m.currency_id}::${m.payment_method_id}`);
    }
  }

  let allClosed = true;
  for (const key of requiredSet) {
    if (!closedSet.has(key)) {
      allClosed = false;
      break;
    }
  }

  // Si todos están cerrados, cerrar la sesión Y calcular difference consolidada
  if (allClosed && requiredSet.size > 0) {
    const { data: diffs } = await supabase
      .from('cash_differences')
      .select('difference, resolved_amount')
      .eq('cash_session_id', parsed.data.session_id)
      .in('status', ['pendiente', 'parcial']);

    let totalDifference = 0;
    for (const d of diffs ?? []) {
      const pending = Number(d.difference) - Number(d.resolved_amount ?? 0);
      totalDifference += pending;
    }

    await supabase
      .from('cash_sessions')
      .update({
        status: 'cerrada',
        closed_by: userId,
        closed_at: new Date().toISOString(),
        difference: totalDifference,
      })
      .eq('id', parsed.data.session_id);
  }

  revalidatePath('/admin/cajas');
  revalidatePath(`/admin/cajas/sesiones/${parsed.data.session_id}`);
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// RESOLVER DIFERENCIA (parcial o total)
// ============================================

export async function resolveDifferenceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const raw = {
    difference_id: formData.get('difference_id'),
    amount: formData.get('amount'),
    notes: formData.get('notes') || null,
  };

  const parsed = resolveDifferenceSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: 'Revisa los campos',
      success: false,
      timestamp: Date.now(),
      fieldErrors: zodToFieldErrors(parsed.error),
    };
  }

  const { data: difference } = await supabase
    .from('cash_differences')
    .select('*')
    .eq('id', parsed.data.difference_id)
    .single();

  if (!difference) {
    return {
      error: 'Diferencia no encontrada',
      success: false,
      timestamp: Date.now(),
    };
  }

  if (difference.status === 'resuelta' || difference.status === 'cancelada') {
    return {
      error: 'Esta diferencia ya fue resuelta o cancelada',
      success: false,
      timestamp: Date.now(),
    };
  }

  const totalDifference = Number(difference.difference);
  const currentResolved = Number(difference.resolved_amount ?? 0);
  const pending = totalDifference - currentResolved;

  if (parsed.data.amount === 0) {
    return {
      error: 'El monto no puede ser 0',
      success: false,
      timestamp: Date.now(),
    };
  }

  // El monto debe tener el mismo signo que lo pendiente
  if (
    (pending > 0 && parsed.data.amount < 0) ||
    (pending < 0 && parsed.data.amount > 0)
  ) {
    return {
      error: `El signo del monto no coincide con lo pendiente (${pending > 0 ? '+' : ''}${pending.toFixed(2)})`,
      success: false,
      timestamp: Date.now(),
    };
  }

  // No puede exceder lo pendiente
  if (Math.abs(parsed.data.amount) > Math.abs(pending) + 0.0001) {
    return {
      error: `El monto excede lo pendiente (${Math.abs(pending).toFixed(2)})`,
      success: false,
      timestamp: Date.now(),
    };
  }

  const newResolved = currentResolved + parsed.data.amount;
  const newPending = totalDifference - newResolved;

  let newStatus: 'parcial' | 'resuelta';
  if (Math.abs(newPending) < 0.0001) {
    newStatus = 'resuelta';
  } else {
    newStatus = 'parcial';
  }

  const userRes = await supabase.auth.getUser();

  const { error } = await supabase
    .from('cash_differences')
    .update({
      resolved_amount: newResolved,
      status: newStatus,
      notes: parsed.data.notes || difference.notes,
      resolved_by: userRes.data.user?.id ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.difference_id);

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  // Ajustar el acumulado del vendedor (o del admin)
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, cash_differences_balance')
    .eq('profile_id', difference.user_id)
    .maybeSingle();

  if (vendor) {
    const currentBalance = Number(vendor.cash_differences_balance ?? 0);
    const newBalance = currentBalance - parsed.data.amount;

    await supabase
      .from('vendors')
      .update({
        cash_differences_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendor.id);
  }

  revalidatePath('/admin/cajas');
  revalidatePath(`/admin/cajas/sesiones/${difference.cash_session_id}`);
  revalidatePath('/admin/vendedores');
  return { error: null, success: true, timestamp: Date.now() };
}

// ============================================
// REFRESCAR SESIONES VENCIDAS
// ============================================

export async function refreshExpiredSessionsAction(): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase.rpc('close_expired_cash_sessions');

  if (error) {
    return { error: error.message, success: false, timestamp: Date.now() };
  }

  revalidatePath('/admin/cajas');
  return { error: null, success: true, timestamp: Date.now() };
}