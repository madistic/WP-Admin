"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface Employee {
  id: string
  name: string
  email: string
  phone: string | null
  employee_code: string | null
  is_active: boolean
  total_sales: number
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    employee_code: "",
    is_active: true
  })
  
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEmployees()
  }, [])

  async function fetchEmployees() {
    try {
      setLoading(true)
      const res = await fetch("/api/employees")
      if (res.ok) {
        const data = await res.json()
        setEmployees(data)
      }
    } catch (e) {
      console.error("Failed to load employees", e)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setFormData({
      name: "",
      email: "",
      phone: "",
      password: "",
      employee_code: Math.floor(1000 + Math.random() * 9000).toString(),
      is_active: true
    })
    setEditingId(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(emp: Employee) {
    setFormData({
      name: emp.name,
      email: emp.email,
      phone: emp.phone || "",
      password: "",
      employee_code: emp.employee_code || "",
      is_active: emp.is_active
    })
    setEditingId(emp.id)
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    
    try {
      const url = editingId ? `/api/employees/${editingId}` : "/api/employees"
      const method = editingId ? "PUT" : "POST"
      
      const payload = { ...formData }
      if (editingId && !payload.password) {
        delete (payload as any).password
      }
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        setShowModal(false)
        fetchEmployees()
      } else {
        const data = await res.json()
        setError(data.error || "Failed to save employee")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center bg-white p-5 rounded-xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff Management</h1>
          <p className="text-xs text-slate-500 mt-1">Manage POS access, credentials, and track staff sales performance.</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white font-medium text-xs rounded-lg hover:bg-indigo-700 shadow-xs transition-colors flex items-center gap-2"
        >
          <span className="text-base leading-none">+</span> Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 font-medium text-xs">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 text-sm font-medium">No employees found.</p>
            <p className="text-slate-400 text-xs mt-1">Add your staff to let them access the POS and Order Board.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-normal">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-center">POS PIN Code</th>
                  <th className="py-3 px-4 text-right">Total Sales</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 text-sm">{emp.name}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div>{emp.email}</div>
                      <div>{emp.phone}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {emp.employee_code ? (
                        <span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200 font-semibold tracking-widest text-slate-800">
                          {emp.employee_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-indigo-700">
                      ₹{emp.total_sales.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {emp.is_active ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium rounded-full text-[10px]">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 font-medium rounded-full text-[10px]">Inactive</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openEdit(emp)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? "Edit Employee" : "Add Employee"}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-md text-xs text-rose-800">
                  {error}
                </div>
              )}
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email * (Login)</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password {editingId && "(Leave blank to keep current)"} {!editingId && "*"}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">POS PIN / ID *</label>
                    <input
                      type="text"
                      required
                      value={formData.employee_code}
                      onChange={e => setFormData({...formData, employee_code: e.target.value})}
                      className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Used to accept orders.</p>
                  </div>
                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-2 cursor-pointer pt-4">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={e => setFormData({...formData, is_active: e.target.checked})}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Account Active</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="pt-5 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? "Saving..." : "Save Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
