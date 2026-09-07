"use client"

import { useState } from "react"
import ExcelJS from "exceljs"
import toast from "react-hot-toast"

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Array<{ id: string; name: string }>
}

interface ImportResponse {
  message?: string
  error?: string
  errors?: string[]
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to import items"
}

export default function BulkImportModal({ isOpen, onClose, onSuccess, categories }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const handleDownloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("Menu Items")

      // Define columns
      worksheet.columns = [
        { header: "Category *", key: "category", width: 20 },
        { header: "Name *", key: "name", width: 30 },
        { header: "Description", key: "description", width: 40 },
        { header: "Price (₹) *", key: "price", width: 15 },
        { header: "Image URL", key: "imageUrl", width: 30 },
        { header: "Is Veg (Yes/No)", key: "isVeg", width: 15 },
        { header: "Prep Time (mins)", key: "prepTime", width: 15 },
      ]

      // Add a sample row
      worksheet.addRow({
        category: categories.length > 0 ? categories[0].name : "Main Course",
        name: "Paneer Tikka Masala",
        description: "Delicious cottage cheese in rich tomato gravy",
        price: 250,
        imageUrl: "https://example.com/image.jpg",
        isVeg: "Yes",
        prepTime: 20,
      })

      // Style header row
      worksheet.getRow(1).font = { bold: true }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' }
      }

      // Generate blob and download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "menu_import_template.xlsx"
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Error generating template", err)
      toast.error("Failed to generate template")
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first")
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/menu/items/bulk-import", {
        method: "POST",
        body: formData,
      })

      let data: ImportResponse
      const isJson = res.headers.get("content-type")?.includes("application/json")

      if (isJson) {
        data = await res.json() as ImportResponse
      } else {
        const text = await res.text()
        throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`)
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to import items")
      }

      setSuccess(data.message || "Import completed")
      if (data.errors && data.errors.length > 0) {
        setError(`Some items failed to import:\n${data.errors.join("\n")}`)
      } else {
        toast.success("Successfully imported all items!")
        onSuccess()
        onClose()
      }
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">Bulk Import Menu</h2>
          <button disabled={loading} onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold disabled:opacity-50">✕</button>
        </div>

        <div className="space-y-4 text-sm text-gray-600">
          <p>You can import multiple menu items at once using an Excel file.</p>
          
          <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100 flex flex-col items-center">
            <p className="mb-2 font-medium text-indigo-900">Step 1: Download Template</p>
            <button 
              onClick={handleDownloadTemplate}
              disabled={loading}
              className="px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-md font-medium hover:bg-indigo-50 transition-colors shadow-sm text-xs"
            >
              📥 Download Excel Template
            </button>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center">
            <p className="mb-2 font-medium text-gray-900">Step 2: Upload Filled Excel</p>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              disabled={loading}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-xs file:font-semibold
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100 border border-gray-200 rounded-md p-2 bg-white cursor-pointer"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-md whitespace-pre-wrap max-h-32 overflow-y-auto border border-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-md font-medium border border-emerald-200">
              {success}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? "Importing..." : "Upload & Import"}
          </button>
        </div>
      </div>
    </div>
  )
}
