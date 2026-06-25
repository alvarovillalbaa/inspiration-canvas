"use client";

import { Streamdown } from "streamdown";

import { cn } from "@/lib/utils";

export function MessageResponse({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-invert max-w-none text-sm leading-6 prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-code:text-foreground",
        className,
      )}
    >
      <Streamdown>{children}</Streamdown>
    </div>
  );
}

