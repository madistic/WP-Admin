import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { is_open: true },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full text-indigo-600 text-2xl font-bold">
          🍽️
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">
          Resto<span className="text-indigo-600">Pro</span> Platform
        </h1>
        <p className="text-gray-600 text-sm">
          Multi-tenant Restaurant Owner Management System with automated order workflows.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <Link
            href="/dev/create-order"
            className="p-6 rounded-xl border-2 border-indigo-500 bg-indigo-50/50 hover:bg-indigo-100/50 transition-all text-left flex flex-col justify-between group"
          >
            <div>
              <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">Customer Side</span>
              <h2 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 mt-1">Place Customer Order &rarr;</h2>
              <p className="text-xs text-gray-500 mt-1">Simulate incoming customer orders (Temporary CRUD / WhatsApp Simulator).</p>
            </div>
            <span className="inline-block mt-4 text-xs font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-md w-fit">
              Simulate Order
            </span>
          </Link>

          <Link
            href="/orders"
            className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-900 transition-all text-left flex flex-col justify-between group"
          >
            <div>
              <span className="text-xs font-bold text-gray-500 tracking-wider uppercase">Owner Portal</span>
              <h2 className="text-lg font-bold text-gray-900 group-hover:text-gray-900 mt-1">Owner Dashboard &rarr;</h2>
              <p className="text-xs text-gray-500 mt-1">Manage incoming orders, update state machine status, edit menu items.</p>
            </div>
            <span className="inline-block mt-4 text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md w-fit">
              Owner Sign-In
            </span>
          </Link>
        </div>

        {restaurant && (
          <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
            Active Restaurant: <span className="font-semibold text-gray-700">{restaurant.name}</span> (Status: {restaurant.is_open ? 'OPEN' : 'CLOSED'})
          </div>
        )}
      </div>
    </div>
  );
}