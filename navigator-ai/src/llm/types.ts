export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  readonly provider: "azure" | "openai";
  readonly model: string;
  validateConnectivity(): Promise<void>;
  chat(messages: LlmMessage[]): Promise<string>;
}
