"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

const LazyAIAssistant = dynamic(() => import("@/components/ai-assistant").then((mod) => mod.AIAssistant), {
  ssr: false,
  loading: () => (
    <Button variant="outline" size="sm" disabled>
      <Bot className="h-4 w-4" />
      AI 助手
    </Button>
  ),
});

export function AIAssistantLauncher() {
  const [enabled, setEnabled] = useState(false);

  if (enabled) return <LazyAIAssistant initialOpen />;

  return (
    <Button variant="outline" size="sm" onClick={() => setEnabled(true)}>
      <Bot className="h-4 w-4" />
      AI 助手
    </Button>
  );
}
