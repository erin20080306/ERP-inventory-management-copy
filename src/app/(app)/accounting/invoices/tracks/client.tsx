"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

const periodLabel: Record<number, string> = {
  1: "1-2月", 2: "3-4月", 3: "5-6月", 4: "7-8月", 5: "9-10月", 6: "11-12月",
};

export function InvoiceTrackClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/accounting/invoice-tracks");
    const d = await res.json();
    setRows(d.items ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/accounting/invoice-tracks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    toast.success(isActive ? "已啟用" : "已停用");
    load();
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此字軌？")) return;
    const res = await fetch(`/api/accounting/invoice-tracks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error((await res.json()).error || "刪除失敗"); return; }
    toast.success("已刪除");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" />新增字軌</Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>年度</TH><TH>期別</TH><TH>字軌</TH><TH>類型</TH><TH>起始號</TH><TH>結束號</TH><TH>已用</TH><TH>剩餘</TH><TH>狀態</TH><TH className="text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={10} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={10}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const used = Math.max(0, r.currentNum - r.startNumber + 1);
            const remaining = r.endNumber - r.currentNum;
            const full = remaining <= 0;
            return (
              <TR key={r.id}>
                <TD>{r.year}</TD>
                <TD>{periodLabel[r.period] ?? r.period}</TD>
                <TD className="font-mono font-bold">{r.trackCode}</TD>
                <TD>{r.type === "SALES" ? "銷項" : "進項"}</TD>
                <TD className="font-mono">{r.trackCode}{String(r.startNumber).padStart(8, "0")}</TD>
                <TD className="font-mono">{r.trackCode}{String(r.endNumber).padStart(8, "0")}</TD>
                <TD>{used}</TD>
                <TD className={full ? "text-red-600 font-medium" : ""}>{full ? "已用完" : remaining}</TD>
                <TD>{r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>}</TD>
                <TD className="text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(r.id, !r.isActive)}>
                    {r.isActive ? "停用" : "啟用"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {openNew && <NewTrackDialog onClose={() => setOpenNew(false)} onCreated={() => { setOpenNew(false); load(); }} />}
    </div>
  );
}

function NewTrackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const now = new Date();
  const rocYear = now.getFullYear() - 1911;
  const currentPeriod = Math.ceil((now.getMonth() + 1) / 2);
  const [year, setYear] = useState(rocYear);
  const [period, setPeriod] = useState(currentPeriod);
  const [trackCode, setTrackCode] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(50);
  const [type, setType] = useState("SALES");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/accounting/invoice-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, period, trackCode, startNumber, endNumber, type }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "新增失敗");
      toast.success("已新增字軌");
      onCreated();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增發票字軌</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>民國年</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>期別</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                {Object.entries(periodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>字軌（2碼英文）</Label>
            <Input maxLength={2} value={trackCode} onChange={(e) => setTrackCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="例: AB" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>起始號碼</Label>
              <Input type="number" value={startNumber} onChange={(e) => setStartNumber(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>結束號碼</Label>
              <Input type="number" value={endNumber} onChange={(e) => setEndNumber(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>類型</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="SALES">銷項發票</option>
              <option value="PURCHASE">進項發票</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground">
            發票號碼格式：{trackCode || "XX"}{String(startNumber).padStart(8, "0")} ~ {trackCode || "XX"}{String(endNumber).padStart(8, "0")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving || !trackCode}>{saving ? "儲存中..." : "儲存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
