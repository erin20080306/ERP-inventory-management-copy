"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export function SalesTrendChart({ data }: { data: { date: string; sales: number; purchase: number }[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v: any) => `$${new Intl.NumberFormat("en-US").format(Number(v))}`}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sales" name="銷售" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="purchase" name="採購" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
