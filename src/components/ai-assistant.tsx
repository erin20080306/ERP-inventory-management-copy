"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, FileSpreadsheet, FileText, FileType, Loader2, Mail, Mic, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "sonner";

type AssistantTable = {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
};

type AssistantResult =
  | {
      kind:
        | "sales-summary"
        | "inventory-alerts"
        | "receivables-collection"
        | "product-ranking"
        | "purchase-suggestions"
        | "bom-cost"
        | "order-anomalies"
        | "monthly-summary"
        | "journal-account-review"
        | "financial-anomalies"
        | "price-variance";
      title: string;
      description: string;
      cards: Array<{ label: string; value: string }>;
      tables: AssistantTable[];
    }
  | {
      kind: "help";
      title: string;
      message: string;
      examples: string[];
    };

const EXAMPLE_QUERY = "高雄貿易銷售";

type AIAssistantProps = {
  initialOpen?: boolean;
};

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
}

export function AIAssistant({ initialOpen = false }: AIAssistantProps) {
  const [open, setOpen] = useState(initialOpen);
  const [question, setQuestion] = useState(EXAMPLE_QUERY);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [email, setEmail] = useState("erin20080306@gmail.com");
  const [format, setFormat] = useState<"excel" | "word" | "pdf">("excel");
  const [sending, setSending] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => !!result && result.kind !== "help", [result]);

  async function ask(nextQuestion = question) {
    const text = nextQuestion.trim();
    if (!text) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查詢失敗");
      setResult(data);
      setQuestion(text);
    } catch (error: any) {
      toast.error(error.message || "AI 助手查詢失敗");
    } finally {
      setLoading(false);
    }
  }

  function startVoiceInput() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("目前瀏覽器不支援語音輸入");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onerror = () => {
      setListening(false);
      toast.error("語音辨識失敗，請再試一次");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? "").trim();
      if (transcript) {
        setQuestion(transcript);
        ask(transcript);
      }
    };
    recognition.start();
  }

  async function buildPdfAttachment() {
    if (!reportRef.current || !result || result.kind === "help") return null;
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth() - 20;
    const pageH = pdf.internal.pageSize.getHeight() - 20;
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    let y = 10;
    let remaining = imgH;

    pdf.addImage(imgData, "PNG", 10, y, imgW, imgH);
    remaining -= pageH;

    while (remaining > 0) {
      pdf.addPage();
      y -= pageH;
      pdf.addImage(imgData, "PNG", 10, y, imgW, imgH);
      remaining -= pageH;
    }

    return {
      filename: `${safeFilename(result.title)}.pdf`,
      content: arrayBufferToBase64(pdf.output("arraybuffer")),
    };
  }

  async function sendReport() {
    if (!canSend) return;
    setSending(true);
    try {
      const pdfAttachment = format === "pdf" ? await buildPdfAttachment() : undefined;
      const res = await fetch("/api/ai-assistant/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, email, format, pdfAttachment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "寄送失敗");
      toast.success(`已寄送 ${format.toUpperCase()} 報表到 ${email}`);
    } catch (error: any) {
      toast.error(error.message || "寄送失敗");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bot className="h-4 w-4" />
        AI 助手
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              AI 資料助手
            </DialogTitle>
            <DialogDescription>可查銷售、庫存、應收、排行、採購建議、成本、異常訂單與營運摘要。</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 lg:flex-row">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") ask();
              }}
              placeholder={EXAMPLE_QUERY}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={startVoiceInput} disabled={listening} title="語音輸入">
                {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button onClick={() => ask()} disabled={loading} className="w-28">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                查詢
              </Button>
            </div>
          </div>

          {!result && (
            <div className="grid gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              {["今日 POS 營業額", "目前誰開班", "總帳庫存現金", "餐飲未結帳桌位", "廚房出餐時間", "今日熱賣商品", "客戶消費排行", "待核准錢櫃異動"].map((example) => (
                <button key={example} className="rounded-md border bg-background px-3 py-2 text-left hover:bg-muted/40" onClick={() => ask(example)}>
                  {example}
                </button>
              ))}
            </div>
          )}

          {result?.kind === "help" && (
            <div className="rounded-lg border p-5">
              <div className="font-medium">{result.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.examples.map((example) => (
                  <Button key={example} variant="outline" size="sm" onClick={() => ask(example)}>
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {canSend && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="收件信箱" className="lg:max-w-xs" />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as "excel" | "word" | "pdf")}
                >
                  <option value="excel">Excel</option>
                  <option value="word">Word</option>
                  <option value="pdf">PDF</option>
                </select>
                <Button onClick={sendReport} disabled={sending || !email.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : format === "excel" ? <FileSpreadsheet className="h-4 w-4" /> : format === "word" ? <FileText className="h-4 w-4" /> : <FileType className="h-4 w-4" />}
                  寄送報表
                </Button>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  使用系統設定中的租戶 SMTP 寄件信箱
                </div>
              </div>
            </div>
          )}

          {result && result.kind !== "help" && (
            <div ref={reportRef} className="space-y-4 bg-background p-1">
              <div>
                <h3 className="text-base font-semibold">{result.title}</h3>
                <p className="text-sm text-muted-foreground">{result.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {result.cards.map((item) => (
                  <div key={item.label} className="rounded-lg border bg-card p-4">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="mt-1 text-xl font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>

              {result.tables.map((item) => (
                <div key={item.title}>
                  <div className="mb-2 text-sm font-medium">{item.title}</div>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          {item.columns.map((column) => (
                            <TH key={column}>{column}</TH>
                          ))}
                        </TR>
                      </THead>
                      <TBody>
                        {item.rows.length === 0 && (
                          <TR>
                            <TD colSpan={item.columns.length} className="text-center text-muted-foreground">查無資料</TD>
                          </TR>
                        )}
                        {item.rows.map((row, rowIndex) => (
                          <TR key={rowIndex}>
                            {item.columns.map((column) => (
                              <TD key={column}>{row[column] ?? "—"}</TD>
                            ))}
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
