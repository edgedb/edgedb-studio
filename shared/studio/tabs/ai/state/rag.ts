import {ConnectConfig} from "../../../state/connection";

export type ChatParticipantRole = "system" | "user" | "assistant" | "tool";

export interface RAGRequest {
  context: RAGRequestContext;
  model: string;
  query: string;
  prompt?: ({name: string} | {id: string} | never) & {
    custom?: {
      role: ChatParticipantRole;
      content: string;
    }[];
  };
}

export interface RAGRequestContext {
  query: string;
  variables?: Record<string, any>;
  globals?: Record<string, any>;
  max_object_count?: number;
}

export type SSEEvent =
  | {
      type: "message_start";
      message: {id: string; model: string; role: ChatParticipantRole};
    }
  | {
      type: "content_block_start";
      index: number;
      content_block: {type: "text"; text: string};
    }
  | {
      type: "content_block_delta";
      index: number;
      delta: {type: "text_delta"; text: string};
    }
  | {
      type: "content_block_stop";
      index: number;
    }
  | {
      type: "message_delta";
      delta: {stop_reason: string};
    }
  | {
      type: "message_stop";
    }
  | {
      type: "ping";
    }
  | {
      type: "error";
      error: {type: string; message: string};
    };

export type SSEStream = AsyncIterable<SSEEvent>;

export async function runRAGQuery(
  _connectConfig: ConnectConfig,
  request: RAGRequest,
  abortController: AbortController
): Promise<SSEStream> {
  // Mocked streaming response: emit a single text block and stop.
  const model = request.model || "mock-model";
  const messageId = `mock-${Date.now()}`;
  async function* mockStream(): SSEStream {
    if (abortController.signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    yield {
      type: "message_start",
      message: {id: messageId, model, role: "assistant"},
    };
    yield {
      type: "content_block_start",
      index: 0,
      content_block: {type: "text", text: ""},
    };
    yield {
      type: "content_block_delta",
      index: 0,
      delta: {type: "text_delta", text: "This is a mocked AI response."},
    };
    yield {type: "content_block_stop", index: 0};
    yield {type: "message_stop"};
  }

  return mockStream();
}
