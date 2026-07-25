"use client";

import { LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { revenueForecast, profitByBrand } from "@/components/demo/demoData";

export function BusinessIntelligencePage() {
  return (
    <div>
      <PageHead
        eyebrow="Business Intelligence"
        title="Executive analytics"
        text="Interactive group reporting across brands, countries, users and lead channels."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle title="Monthly revenue forecast" sub="Actual vs forecast" />
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <LineChart data={revenueForecast}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" axisLine={false} />
                <YAxis axisLine={false} />
                <Tooltip />
                <Line dataKey="a" stroke="#f97316" strokeWidth={3} />
                <Line dataKey="f" stroke="#172033" strokeDasharray="6 6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="Profit by brand" sub="Current month" />
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <BarChart layout="vertical" data={profitByBrand}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" axisLine={false} />
                <YAxis type="category" dataKey="n" width={120} axisLine={false} />
                <Tooltip />
                <Bar dataKey="v" fill="#f97316" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
