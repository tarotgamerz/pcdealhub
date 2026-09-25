"use client";

import { useState, type FormEvent } from "react";

type InputOption = {
  id: string;
  label: string;
  style?: string;
};

export type InputRequest = {
  requestId: string;
  prompt?: string;
  display?: string;
  allowFreeform?: boolean;
  options?: InputOption[];
};

export function getInputRequest(part: unknown): InputRequest | null {
  if (!part || typeof part !== "object") return null;
  const toolMetadata = (part as Record<string, unknown>).toolMetadata;
  if (!toolMetadata || typeof toolMetadata !== "object") return null;
  const eve = (toolMetadata as Record<string, unknown>).eve;
  if (!eve || typeof eve !== "object") return null;
  const request = (eve as Record<string, unknown>).inputRequest;
  if (!request || typeof request !== "object") return null;

  const value = request as Record<string, unknown>;
  if (typeof value.requestId !== "string") return null;

  const options = Array.isArray(value.options)
    ? value.options.flatMap((option) => {
        if (!option || typeof option !== "object") return [];
        const item = option as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.label !== "string") return [];
        return [{
          id: item.id,
          label: item.label,
          style: typeof item.style === "string" ? item.style : undefined,
        }];
      })
    : [];

  return {
    requestId: value.requestId,
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
    display: typeof value.display === "string" ? value.display : undefined,
    allowFreeform: value.allowFreeform === true,
    options,
  };
}

export default function InputRequest({
  part,
  canRespond,
  respond,
}: {
  part: unknown;
  canRespond: boolean;
  respond: (responses: Array<{ optionId?: string; requestId: string; text?: string }>) => Promise<void>;
}) {
  const request = getInputRequest(part);
  if (!request) return null;

  const [text, setText] = useState("");

  async function choose(optionId: string) {
    if (!canRespond) return;
    await respond([{ optionId, requestId: request.requestId }]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!canRespond || !value) return;
    await respond([{ requestId: request.requestId, text: value }]);
    setText("");
  }

  const showFreeform =
    request.allowFreeform ||
    request.display === "text" ||
    request.options.length === 0;

  return (
    <div className="input-request">
      {request.prompt ? <div className="input-request-prompt">{request.prompt}</div> : null}
      {request.options.length > 0 ? (
        <div className="input-request-options">
          {request.options.map((option) => (
            <button key={option.id} type="button" disabled={!canRespond} className={option.style === "danger" ? "danger" : ""} onClick={() => void choose(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {showFreeform ? (
        <form onSubmit={submit} className="input-request-form">
          <input value={text} onChange={(event) => setText(event.currentTarget.value)} disabled={!canRespond} placeholder="Response" />
          <button type="submit" disabled={!canRespond || text.trim().length === 0}>Send</button>
        </form>
      ) : null}
    </div>
  );
}
