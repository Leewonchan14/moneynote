import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

interface MessagePart {
  type: string;
  text?: string;
}

interface MessageWithParts {
  parts?: MessagePart[];
}

const getTextParts = (msg: MessageWithParts) =>
  msg.parts?.filter(
    (p): p is MessagePart & { text: string } => p.type === "text" && p.text != null
  ) ?? [];

/** 메시지의 text 파트를 이어붙인 전체 텍스트. */
export const extractMessageText = (msg: MessageWithParts): string =>
  getTextParts(msg)
    .map((p) => p.text)
    .join("");

/**
 * Hermes 백엔드는 한동안 답변 텍스트를 thinking으로도 저장했다(에코) —
 * 답변과 같은 문장이면 thinking 파트로 보여주지 않는다.
 */
export const isEchoedThinking = (reasoning: string, messageText: string): boolean => {
  const text = reasoning.replace(/\s+/g, " ").trim();
  return text.length === 0 || messageText.replace(/\s+/g, " ").includes(text);
};
