"use client"

import { useEffect, useState } from "react"

interface Category {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  _count?: { items: number }
}

export default function CategoriesManagementView() {
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState<"delete" | "rename" | "move" | null>(null)
  const [bulkRenameNames, setBulkRenameNames] = useState<Record<string, string>>({})
  const [bulkTargetId, setBulkTargetId] = useState("")
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadCategories() {
    setLoading(true)
    try {
      const response = await fetch("/api/menu")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to load categories")
      setCategories(data.categories || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load categories")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCategories() }, [])

  function resetForm() {
    setEditingId(null)
    setName("")
    setDescription("")
    setError(null)
    setSuccess(null)
  }

  function editCategory(category: Category) {
    setEditingId(category.id)
    setName(category.name)
    setDescription(category.description || "")
    setError(null)
  }

  function toggleCategory(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id])
  }

  function selectAllVisible() {
    setSelectedIds(visibleCategories.map((category) => category.id))
  }

  function beginBulkAction(action: "delete" | "rename" | "move") {
    setBulkAction(action)
    setError(null)
    setSuccess(null)
    if (action === "rename") {
      setBulkRenameNames(Object.fromEntries(categories.filter((category) => selectedIds.includes(category.id)).map((category) => [category.id, category.name])))
    }
  }

  async function runBulkAction() {
    if (!bulkAction || selectedIds.length === 0) return
    const selectedCategories = categories.filter((category) => selectedIds.includes(category.id))
    const affectedItems = selectedCategories.reduce((total, category) => total + (category._count?.items || 0), 0)
    if (bulkAction === "delete") {
      if (affectedItems > 0) {
        setError(`Bulk delete blocked: ${affectedItems} menu item(s) are assigned to the selected categories. Move items first.`)
        return
      }
      if (!window.confirm(`Delete ${selectedCategories.length} categories? Menu items affected: ${affectedItems}.`)) return
    }
    setBulkProcessing(true)
    setError(null)
    setSuccess(null)
    try {
      const body = bulkAction === "rename"
        ? { action: bulkAction, category_ids: selectedIds, renames: bulkRenameNames }
        : bulkAction === "move"
          ? { action: bulkAction, category_ids: selectedIds, target_category_id: bulkTargetId }
          : { action: bulkAction, category_ids: selectedIds }
      const response = await fetch("/api/menu/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Bulk category action failed")
      setSelectedIds([])
      setBulkAction(null)
      setBulkTargetId("")
      const resultText = bulkAction === "delete"
        ? `Deleted ${data.count} categor${data.count === 1 ? "y" : "ies"}.`
        : bulkAction === "rename"
          ? `Renamed ${data.count} categor${data.count === 1 ? "y" : "ies"}.`
          : `Moved ${data.count} menu item(s).`
      setSuccess(resultText)
      if (data.failedSyncs > 0) setError(`Completed, but Meta Catalog sync failed for ${data.failedSyncs} menu item(s).`)
      await loadCategories()
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk category action failed")
    } finally {
      setBulkProcessing(false)
    }
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/menu/categories", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, name, description } : { name, description }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save category")
      resetForm()
      await loadCategories()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save category")
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(category: Category) {
    if ((category._count?.items || 0) > 0) {
      setError(`Move or delete the ${category._count?.items} menu item(s) in ${category.name} before deleting it.`)
      return
    }
    if (!window.confirm(`Delete category ${category.name}?`)) return
    setDeletingId(category.id)
    setError(null)
    try {
      const response = await fetch(`/api/menu/categories?id=${encodeURIComponent(category.id)}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete category")
      await loadCategories()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete category")
    } finally {
      setDeletingId(null)
    }
  }

  const visibleCategories = categories.filter((category) => category.name.toLowerCase().includes(search.toLowerCase().trim()))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Categories</h1>
        <p className="text-sm text-slate-500 mt-1">Organize menu items into customer-facing categories.</p>
      </div>

      <form onSubmit={saveCategory} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">{editingId ? "Edit Category" : "Add Category"}</h2>
        {error && <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        {success && <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">{success}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save Changes" : "Add Category"}</button>
          {editingId && <button type="button" disabled={saving} onClick={resetForm} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>}
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories..." className="w-full md:w-80 rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={selectAllVisible} disabled={bulkProcessing || visibleCategories.length === 0} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 disabled:opacity-50">Select All</button>
              <button type="button" onClick={() => setSelectedIds([])} disabled={bulkProcessing || selectedIds.length === 0} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 disabled:opacity-50">Deselect All</button>
            </div>
          </div>
        </div>
        {selectedIds.length > 0 && (
          <div className="p-4 bg-indigo-50 border-b border-indigo-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-indigo-900">{selectedIds.length} selected</span>
              <button type="button" onClick={() => beginBulkAction("delete")} disabled={bulkProcessing} className="px-3 py-1.5 rounded-md bg-red-600 text-white disabled:opacity-50">🗑️ Bulk Delete</button>
              <button type="button" onClick={() => beginBulkAction("rename")} disabled={bulkProcessing} className="px-3 py-1.5 rounded-md bg-white text-indigo-700 border border-indigo-200 disabled:opacity-50">✏️ Bulk Rename</button>
              <button type="button" onClick={() => beginBulkAction("move")} disabled={bulkProcessing} className="px-3 py-1.5 rounded-md bg-white text-indigo-700 border border-indigo-200 disabled:opacity-50">🔄 Move Items</button>
            </div>
            {bulkAction === "rename" && (
              <div className="space-y-2">
                {categories.filter((category) => selectedIds.includes(category.id)).map((category) => (
                  <input key={category.id} value={bulkRenameNames[category.id] || ""} onChange={(event) => setBulkRenameNames((current) => ({ ...current, [category.id]: event.target.value }))} placeholder={`New name for ${category.name}`} className="block w-full md:w-96 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                ))}
              </div>
            )}
            {bulkAction === "move" && (
              <select value={bulkTargetId} onChange={(event) => setBulkTargetId(event.target.value)} className="w-full md:w-96 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select destination category</option>
                {categories.filter((category) => !selectedIds.includes(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            )}
            {bulkAction && <div className="flex gap-2"><button type="button" onClick={runBulkAction} disabled={bulkProcessing || (bulkAction === "move" && !bulkTargetId)} className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs disabled:opacity-50">{bulkProcessing ? "Processing..." : "Run Action"}</button><button type="button" onClick={() => setBulkAction(null)} disabled={bulkProcessing} className="px-3 py-1.5 rounded-md bg-white text-slate-700 text-xs">Cancel</button></div>}
          </div>
        )}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading categories...</div> : visibleCategories.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No categories found.</div> : (
          <div className="divide-y divide-slate-100">
            {visibleCategories.map((category) => (
              <div key={category.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3"><input type="checkbox" checked={selectedIds.includes(category.id)} onChange={() => toggleCategory(category.id)} disabled={bulkProcessing} className="h-4 w-4 rounded border-slate-300 text-indigo-600" /><div><p className="font-semibold text-slate-900">{category.name}</p><p className="text-xs text-slate-500">{category._count?.items || 0} menu item(s){category.description ? ` · ${category.description}` : ""}</p></div></div>
                <div className="flex gap-2"><button onClick={() => editCategory(category)} className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-md">Edit</button><button onClick={() => deleteCategory(category)} disabled={deletingId === category.id} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md disabled:opacity-50">{deletingId === category.id ? "Deleting..." : "Delete"}</button></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}