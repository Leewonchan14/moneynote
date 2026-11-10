"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonAlertIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export const Toaster = (props: ToasterProps) => (
  <Sonner
    position="top-center"
    richColors
    closeButton
    toastOptions={{ closeButtonAriaLabel: "닫기" }}
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonAlertIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
      close: <XIcon className="size-3" />,
    }}
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--error-bg": "var(--muted, var(--popover))",
        "--error-text": "var(--destructive)",
        "--error-border": "var(--destructive)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties
    }
    {...props}
  />
);
