import React from "react"

export type StatusType =
  | "NEW"
  | "IN_PROCESS"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "Active"
  | "Inactive"
  | "Available"
  | "Out of Stock"
  | "Returning"
  | "New Customer"
  | string

interface StatusBadgeProps {
  status: StatusType
  className?: string
}

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const normalized = status.toUpperCase()

  let badgeStyle = "bg-gray-100 text-gray-700 border-gray-200"
  let dotColor = "bg-gray-400"
  let label = status

  switch (normalized) {
    case "NEW":
    case "NEW CUSTOMER":
      badgeStyle = "bg-purple-50 text-purple-700 border-purple-200"
      dotColor = "bg-purple-500"
      label = normalized === "NEW" ? "New" : "New Customer"
      break
    case "IN_PROCESS":
    case "PREPARING":
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-200"
      dotColor = "bg-amber-500"
      label = "In Process"
      break
    case "OUT_FOR_DELIVERY":
      badgeStyle = "bg-blue-50 text-blue-700 border-blue-200"
      dotColor = "bg-blue-500"
      label = "Out for Delivery"
      break
    case "DELIVERED":
    case "ACTIVE":
    case "AVAILABLE":
    case "RETURNING":
      badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200"
      dotColor = "bg-emerald-500"
      label = status === "IN_PROCESS" ? "In Process" : status
      break
    case "CANCELLED":
    case "OUT OF STOCK":
      badgeStyle = "bg-red-50 text-red-700 border-red-200"
      dotColor = "bg-red-500"
      label = status
      break
    case "REJECTED":
    case "INACTIVE":
      badgeStyle = "bg-slate-100 text-slate-600 border-slate-200"
      dotColor = "bg-slate-400"
      label = status
      break
    default:
      badgeStyle = "bg-slate-50 text-slate-700 border-slate-200"
      dotColor = "bg-slate-400"
      label = status
      break
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border transition-all ${badgeStyle} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  )
}
