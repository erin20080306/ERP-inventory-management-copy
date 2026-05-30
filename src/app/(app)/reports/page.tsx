import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, FileText, Scale, BookOpen } from "lucide-react";
import { ReportDateFilter } from "./date-filter";
import { ReportContent } from "./report-content";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const g = await requirePermissionOrForbidden("reports.view");
  if (g.forbidden) return g.element;

  const fromDate = searchParams.from;
  const toDate = searchParams.to;
  const dateFilter = fromDate || toDate;
  const dateRangeLabel = dateFilter ? `${fromDate || "開始"} ~ ${toDate || "今天"}` : "全部期間";

  return (
    <PageShell title={`財務報表 (${dateRangeLabel})`} description="損益表、資產負債表、試算表與進銷存總覽">
      <ReportDateFilter />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />列印正式報表</CardTitle>
          <CardDescription>一鍵列印符合一般公認會計原則 (GAAP) 格式之資產負債表、損益表與試算表</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/print/balance-sheet">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <Scale className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">資產負債表</div>
                <div className="text-xs text-muted-foreground">Balance Sheet</div>
              </div>
            </Button>
          </Link>
          <Link href="/print/income-statement">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <FileText className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">綜合損益表</div>
                <div className="text-xs text-muted-foreground">Income Statement</div>
              </div>
            </Button>
          </Link>
          <Link href="/print/trial-balance">
            <Button variant="outline" className="w-full justify-start h-auto py-3">
              <BookOpen className="h-5 w-5" />
              <div className="text-left ml-1">
                <div className="font-semibold">試算表</div>
                <div className="text-xs text-muted-foreground">Trial Balance</div>
              </div>
            </Button>
          </Link>
        </CardContent>
      </Card>

      <ReportContent />
    </PageShell>
  );
}
