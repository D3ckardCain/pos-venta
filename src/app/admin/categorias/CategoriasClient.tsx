'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  Tags,
  FolderTree,
  Filter,
} from 'lucide-react';
import type { Category } from '@/lib/types/database';
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  toggleCategoryAction,
  type ActionState,
} from './actions';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SearchBar } from '@/components/shared/SearchBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useToast } from '@/components/ui/Toast';

const initialActionState: ActionState = {
  error: null,
  success: false,
  timestamp: 0,
};

interface Props {
  initialCategories: Category[];
}

export function CategoriasClient({ initialCategories }: Props) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterParent, setFilterParent] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createFormAction] = useFormState(
    createCategoryAction,
    initialActionState
  );
  const [updateState, updateFormAction] = useFormState(
    updateCategoryAction,
    initialActionState
  );

  useEffect(() => {
    if (createState.timestamp > 0) {
      if (createState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Categoria creada', 'success');
      } else if (createState.error) {
        showToast(createState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState.timestamp]);

  useEffect(() => {
    if (updateState.timestamp > 0) {
      if (updateState.success) {
        setModalOpen(false);
        setEditing(null);
        showToast('Categoria actualizada', 'success');
      } else if (updateState.error) {
        showToast(updateState.error, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.timestamp]);

  const parents = useMemo(
    () => initialCategories.filter((c) => c.id !== editing?.id),
    [initialCategories, editing]
  );

  const filtered = useMemo(() => {
    let list = [...initialCategories];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q)
      );
    }
    if (filterActive === 'active') list = list.filter((c) => c.is_active);
    if (filterActive === 'inactive') list = list.filter((c) => !c.is_active);
    if (filterParent === 'root') list = list.filter((c) => !c.parent_id);
    else if (filterParent !== 'all')
      list = list.filter((c) => c.parent_id === filterParent);

    return list;
  }, [initialCategories, search, filterActive, filterParent]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (filterActive !== 'all' ? 1 : 0) +
    (filterParent !== 'all' ? 1 : 0);

  function clearFilters() {
    setSearch('');
    setFilterActive('all');
    setFilterParent('all');
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteCategoryAction(target.id);
      if (res.error) showToast(res.error, 'error');
      else {
        showToast('Categoria eliminada', 'success');
      }
    });
  }

  function handleToggle(cat: Category) {
    const hasChildren = initialCategories.some((c) => c.parent_id === cat.id);
    startTransition(async () => {
      const res = await toggleCategoryAction(cat.id, !cat.is_active);
      if (res.error) showToast(res.error, 'error');
      else {
        if (cat.is_active && hasChildren) {
          showToast(
            'Categoria y subcategorias desactivadas en cascada',
            'success'
          );
        } else if (!cat.is_active && hasChildren) {
          showToast('Categoria y subcategorias reactivadas', 'success');
        } else {
          showToast(
            cat.is_active ? 'Categoria desactivada' : 'Categoria activada',
            'success'
          );
        }
      }
    });
  }

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            {c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image_url}
                alt={c.name}
                className="h-8 w-8 rounded-md object-cover"
              />
            ) : (
              <Tags className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="font-mono text-xs text-muted-foreground">/{c.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Padre',
      render: (c) =>
        c.parent ? (
          <span className="text-sm">{c.parent.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">- Raiz -</span>
        ),
    },
    {
      key: 'sort_order',
      header: 'Orden',
      render: (c) => <span className="text-sm">{c.sort_order}</span>,
    },
    {
      key: 'is_active',
      header: 'Estado',
      render: (c) =>
        c.is_active ? <Badge tone="success">Activa</Badge> : <Badge tone="default">Inactiva</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title={c.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => handleToggle(c)}
            className={`rounded-md p-1.5 ${
              c.is_active
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Editar"
            onClick={() => openEdit(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Eliminar"
            onClick={() => setConfirmDelete(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const state = editing ? updateState : createState;

  const [name, setName] = useState(editing?.name ?? '');
  const [slug, setSlug] = useState(editing?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!editing);

  useEffect(() => {
    setName(editing?.name ?? '');
    setSlug(editing?.slug ?? '');
    setSlugTouched(!!editing);
  }, [editing]);

  function slugify(text: string): string {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Organiza el catalogo. Soporta jerarquia padre-hijo.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nueva categoria
        </Button>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, slug o descripcion..."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="w-36"
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </Select>
            <Select
              value={filterParent}
              onChange={(e) => setFilterParent(e.target.value)}
              className="w-48"
            >
              <option value="all">Padre: todos</option>
              <option value="root">Solo raiz</option>
              {initialCategories
                .filter((c) => !c.parent_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    Hijos de {c.name}
                  </option>
                ))}
            </Select>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <Filter className="h-3.5 w-3.5" />
                Limpiar ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Sin resultados' : 'No hay categorias'}
            description={
              search
                ? 'Prueba con otro termino de busqueda.'
                : 'Crea la primera categoria para organizar tus productos.'
            }
            icon={<FolderTree className="h-8 w-8" />}
            action={
              !search ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nueva categoria
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} />
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Editar ${editing.name}` : 'Nueva categoria'}
        description="Define nombre, slug y relacion jerarquica."
        size="lg"
      >
        <form
          id={editing ? 'category-update-form' : 'category-create-form'}
          action={editing ? updateFormAction : createFormAction}
          className="space-y-4"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <Input
            label="Nombre"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) {
                setSlug(slugify(e.target.value));
              }
            }}
            error={state.fieldErrors?.name}
            required
          />

          <Input
            label="Slug (URL publica)"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            error={state.fieldErrors?.slug}
            hint="Solo minusculas, numeros y guiones."
            required
          />

          <Textarea
            label="Descripcion (opcional)"
            name="description"
            rows={3}
            defaultValue={editing?.description ?? ''}
            error={state.fieldErrors?.description}
          />

          <Input
            label="URL de imagen (opcional)"
            name="image_url"
            type="url"
            placeholder="https://..."
            defaultValue={editing?.image_url ?? ''}
            error={state.fieldErrors?.image_url}
            hint="Se usara como miniatura en el listado."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Categoria padre (opcional)"
              name="parent_id"
              defaultValue={editing?.parent_id ?? ''}
              error={state.fieldErrors?.parent_id}
            >
              <option value="">- Raiz -</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Input
              label="Orden"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={editing?.sort_order ?? 0}
              error={state.fieldErrors?.sort_order}
              hint="Menor numero = aparece primero."
            />
          </div>

          <Checkbox
            name="is_active"
            label="Activa"
            hint="Las categorias inactivas no se muestran en el catalogo."
            defaultChecked={editing?.is_active ?? true}
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
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <SubmitButton loadingText={editing ? 'Guardando...' : 'Creando...'}>
              {editing ? 'Guardar cambios' : 'Crear categoria'}
            </SubmitButton>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Eliminar "${confirmDelete?.name ?? ''}"?`}
        description="Si la categoria tiene subcategorias o productos asociados, no se podra eliminar. Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteNow}
      />
    </div>
  );
}