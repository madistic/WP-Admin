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
  }

  function editCategory(category: Category) {
    setEditingId(category.id)
    setName(category.name)
    setDescription(category.description || "")
    setError(null)
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories..." className="w-full md:w-80 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading categories...</div> : visibleCategories.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No categories found.</div> : (
          <div className="divide-y divide-slate-100">
            {visibleCategories.map((category) => (
              <div key={category.id} className="p-4 flex items-center justify-between gap-4">
                <div><p className="font-semibold text-slate-900">{category.name}</p><p className="text-xs text-slate-500">{category._count?.items || 0} menu item(s){category.description ? ` · ${category.description}` : ""}</p></div>
                <div className="flex gap-2"><button onClick={() => editCategory(category)} className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-md">Edit</button><button onClick={() => deleteCategory(category)} disabled={deletingId === category.id} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md disabled:opacity-50">{deletingId === category.id ? "Deleting..." : "Delete"}</button></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}