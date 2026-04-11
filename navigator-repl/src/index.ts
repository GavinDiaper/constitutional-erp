import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { IntegrationHubClient } from "./client/integrationHubClient";
import { NavigatorClient } from "./client/navigatorClient";
import { loadConfig } from "./config/env";
import { render } from "./format/renderer";
import { contextString, SessionContext } from "./state/session";
import {
  selectDomain,
  selectAggregateType,
  selectActor,
  selectAggregateId,
  printDomainInfo,
  normalizeDomain,
  isSupportedAggregateType,
  getSupportedAggregateTypes
} from "./menu";

type Domain = NonNullable<SessionContext["domain"]>;

function printHelp() {
  output.write([
    "=== Navigator REPL v2 Commands ===\n",
    "Setup Commands:",
    "  set actor <actorId>          Set the actor/user making decisions",
    "  use <domain> <type> <id>     Set business context (manual entry)",
    "  use                          Set business context (interactive menu)",
    "  session start [offline|online] Start a hub session",
    "  session end                  End the active hub session",
    "",
    "Hub Discovery:",
    "  mcp                          List MCP functions",
    "  mcp <functionId>             Show one MCP function",
    "  process                      Fetch process state + hypermedia links (Integration Hub)",
    "  show                         Fetch canonical resource (Navigator AI)",
    "  links                        Show available hypermedia actions",
    "",
    "Navigator AI Decisions:",
    "  create <operation> [json]    Create entity via Navigator AI",
    "  prompt-create [--dry-run] <prompt> Resolve NL create intent and optionally execute",
    "  lookup <kind>                List prerequisite IDs (suppliers|ledgers|fiscal-years|invoices)",
    "  propose                      Rank recommended actions",
    "  explain [actionId]           Explain top or selected action",
    "  simulate <actionId>          Simulate action outcome",
    "  decide                       Run governance-aware decision",
    "  execute [actionId]           Execute chosen action through Navigator AI",
    "  next-steps [limit]           Suggest history-aware next steps",
    "  approvals [limit] [status]   List approval requests for current context",
    "  approval <id>                Show one approval request",
    "  approve <id> [note]          Approve request and auto-execute approved action",
    "  reject <id> [note]           Reject a pending approval request",
    "  escalate <id> [tier] [note]  Escalate an approval request to a higher tier",
    "",
    "Governed Execution:",
    "  exec <action> [json]         Execute hypermedia action via Hub (legacy)",
    "",
    "Observability:",
    "  navlog [limit]               Show Navigator event log",
    "  history [limit]              Show aggregate event history via Navigator",
    "  events [limit]               Show recent aggregate events via Event Processor",
    "  transcript                   Show current session transcript",
    "",
    "Utilities:",
    "  context                      Show detailed context",
    "  domains                      List available domains & types",
    "  help                         Print this help",
    "  quit|exit                    Close REPL",
    ""
  ].join("\n") + "\n");
}

async function main() {
  const config = loadConfig();
  const client = new IntegrationHubClient(config);
  const navigatorClient = new NavigatorClient(config);
  const rl = createInterface({ input, output, terminal: true });
  const session: SessionContext = {};
  let lastRankedActions: Array<{ actionId?: string }> = [];
  let lastDecisionActionId: string | undefined;

  output.write("\n╔════════════════════════════════╗\n");
  output.write("║    Navigator REPL v2           ║\n");
  output.write("║  Hub-Native Developer Cockpit  ║\n");
  output.write("║   Constitutional API Surface   ║\n");
  output.write("╚════════════════════════════════╝\n\n");
  
  printHelp();

  async function ensureSession(mode: "offline" | "online" = "offline") {
    if (session.sessionId) {
      return session.sessionId;
    }

    session.sessionId = await client.startSession(session, mode);
    return session.sessionId;
  }

  function extractLinks(result: unknown): SessionContext["lastLinks"] {
    if (!result || typeof result !== "object") {
      return undefined;
    }

    const links = (result as { links?: unknown }).links;
    if (!Array.isArray(links)) {
      return undefined;
    }

    return links as SessionContext["lastLinks"];
  }

  function updateContextFromEntity(created: { entityType?: string; entityId?: string }) {
    const aggregateTypeByEntityType: Record<string, string> = {
      p2p_supplier: "supplier",
      p2p_requisition: "requisition",
      p2p_purchase_order: "purchase-order",
      r2r_fiscal_year: "fiscal-year",
      r2r_fiscal_period: "fiscal-period",
      o2c_payment: "ar-payment"
    };
    const domainByEntityType: Record<string, Domain> = {
      p2p_supplier: "P2P",
      p2p_requisition: "P2P",
      p2p_purchase_order: "P2P",
      r2r_fiscal_year: "R2R",
      r2r_fiscal_period: "R2R",
      o2c_payment: "O2C"
    };

    const entityType = String(created.entityType ?? "");
    const entityId = String(created.entityId ?? "");
    if (entityType && entityId && aggregateTypeByEntityType[entityType] && domainByEntityType[entityType]) {
      session.domain = domainByEntityType[entityType];
      session.aggregateType = aggregateTypeByEntityType[entityType];
      session.aggregateId = entityId;
      session.lastLinks = undefined;
    }
  }

  while (true) {
    const line = (await rl.question("navigator> ")).trim();
    if (!line) {
      continue;
    }

    const [cmd, ...args] = line.split(/\s+/);
    const rawArgText = line.slice(cmd.length).trim();

    try {
      if (cmd === "quit" || cmd === "exit") {
        output.write("Goodbye.\n");
        rl.close();
        break;
      }

      let result: unknown;

      if (cmd === "help") {
        printHelp();
        continue;
      }

      if (cmd === "domains") {
        printDomainInfo();
        continue;
      }

      if (cmd === "context") {
        result = contextString(session);
      } else if (cmd === "set") {
        if (args[0] === "actor") {
          if (args[1]) {
            session.actorId = args[1];
            result = `actor set to ${session.actorId}`;
          } else {
            session.actorId = await selectActor(rl);
            result = `actor set to ${session.actorId}`;
          }
        } else {
          // Default to actor if no sub-command specified
          session.actorId = await selectActor(rl);
          result = `actor set to ${session.actorId}`;
        }
      } else if (cmd === "use") {
        if (args.length >= 3) {
          // Manual entry: use domain type id
          const domain = normalizeDomain(args[0]);
          if (!domain) {
            result = "Invalid domain. Supported domains: P2P, O2C, H2R, R2R.";
            const rendered = render(result);
            output.write(`${rendered}\n`);
            if (session.sessionId) {
              await client.transcript(session.sessionId, line, rendered);
            }
            continue;
          }

          if (!isSupportedAggregateType(domain, args[1])) {
            const supported = getSupportedAggregateTypes(domain).join(", ");
            result = `Unsupported aggregate type '${args[1]}' for ${domain}. Supported types: ${supported}`;
            const rendered = render(result);
            output.write(`${rendered}\n`);
            if (session.sessionId) {
              await client.transcript(session.sessionId, line, rendered);
            }
            continue;
          }

          session.domain = domain as Domain;
          session.aggregateType = args[1].toLowerCase();
          session.aggregateId = args[2];
          session.sessionId = undefined;
          session.lastLinks = undefined;
          lastRankedActions = [];
          lastDecisionActionId = undefined;
          result = contextString(session);
        } else if (args.length > 0) {
          result = "Invalid use command. Use 'use domain type id' or just 'use' for interactive menu.";
        } else {
          // Interactive menu
          output.write("\n");
          const domain = (await selectDomain(rl)) as Domain;
          session.domain = domain;
          const aggregateType = await selectAggregateType(rl, domain);
          session.aggregateType = aggregateType;
          session.aggregateId = await selectAggregateId(rl, aggregateType);
          session.sessionId = undefined;
          session.lastLinks = undefined;
          lastRankedActions = [];
          lastDecisionActionId = undefined;
          result = contextString(session);
        }
      } else if (cmd === "session" && args[0] === "start") {
        const mode = args[1] === "online" ? "online" : "offline";
        session.sessionId = await client.startSession(session, mode);
        result = `session started: ${session.sessionId} (${mode})`;
      } else if (cmd === "session" && args[0] === "end") {
        if (!session.sessionId) {
          result = "No active session.";
        } else {
          result = await client.endSession(session.sessionId);
          session.sessionId = undefined;
        }
      } else if (cmd === "mcp") {
        const data = await client.mcpFunctions() as Array<{ id?: string }>;
        if (args[0]) {
          const match = Array.isArray(data) ? data.find((item) => item.id === args[0]) : undefined;
          result = match ?? `MCP function not found: ${args[0]}`;
        } else {
          result = data;
        }
      } else if (cmd === "show") {
        result = await navigatorClient.getResource(session);
      } else if (cmd === "process") {
        result = await client.process(session);
        session.lastLinks = extractLinks(result);
      } else if (cmd === "links") {
        if (!session.lastLinks || session.lastLinks.length === 0) {
          const process = await client.process(session);
          session.lastLinks = extractLinks(process);
        }

        result = {
          links: (session.lastLinks ?? []).map((link) => ({
            rel: link.rel,
            method: link.method,
            href: link.href,
            riskLevel: link.governance?.riskLevel,
            requiredTier: link.governance?.requiredTier,
            governanceTag: link.governance?.governanceTag
          }))
        };
      } else if (cmd === "propose") {
        const ranked = await navigatorClient.rankActions(session) as { rankedActions?: Array<{ actionId?: string }> };
        lastRankedActions = ranked.rankedActions ?? [];
        result = ranked;
      } else if (cmd === "lookup") {
        const kind = args[0] as "suppliers" | "ledgers" | "fiscal-years" | "invoices" | undefined;
        if (!kind || !["suppliers", "ledgers", "fiscal-years", "invoices"].includes(kind)) {
          result = "Usage: lookup <suppliers|ledgers|fiscal-years|invoices>";
        } else if (!session.actorId) {
          result = "Set actor first: set actor <actorId>";
        } else {
          result = await navigatorClient.getCreateLookups({ kind, actorId: session.actorId });
        }
      } else if (cmd === "create") {
        const operation = args[0] as
          | "create-supplier"
          | "create-requisition"
          | "create-purchase-order"
          | "create-fiscal-year"
          | "create-fiscal-period"
          | "create-payment"
          | undefined;
        const validOperations = new Set([
          "create-supplier",
          "create-requisition",
          "create-purchase-order",
          "create-fiscal-year",
          "create-fiscal-period",
          "create-payment"
        ]);

        if (!operation || !validOperations.has(operation)) {
          result = "Usage: create <create-supplier|create-requisition|create-purchase-order|create-fiscal-year|create-fiscal-period|create-payment> [json]";
        } else if (!session.actorId) {
          result = "Set actor first: set actor <actorId>";
        } else {
          let payload: Record<string, unknown> = {};
          if (args[1]) {
            payload = JSON.parse(args.slice(1).join(" ")) as Record<string, unknown>;
          }

          const created = await navigatorClient.createEntity({
            operation,
            actorId: session.actorId,
            payload
          }) as { entityType?: string; entityId?: string };

          updateContextFromEntity(created);

          result = created;
        }
      } else if (cmd === "prompt-create") {
        const dryRun = args.includes("--dry-run");
        const prompt = args.filter((item) => item !== "--dry-run").join(" ") || rawArgText.replace("--dry-run", "").trim();

        if (!session.actorId) {
          result = "Set actor first: set actor <actorId>";
        } else if (!prompt) {
          result = "Usage: prompt-create [--dry-run] <natural language prompt>";
        } else {
          const promptResult = await navigatorClient.promptCreate({
            prompt,
            actorId: session.actorId,
            domain: session.domain,
            dryRun
          }) as { created?: { entityType?: string; entityId?: string } };

          if (promptResult.created) {
            updateContextFromEntity(promptResult.created);
          }

          result = promptResult;
        }
      } else if (cmd === "explain") {
        const actionId = args[0] ?? lastRankedActions[0]?.actionId;
        result = await navigatorClient.explainDecision(session, actionId);
      } else if (cmd === "simulate") {
        const actionId = args[0] ?? lastRankedActions[0]?.actionId;
        if (!actionId) {
          result = "No action specified. Use: simulate <actionId>";
        } else {
          result = await navigatorClient.simulateAction(session, actionId);
        }
      } else if (cmd === "decide") {
        const decided = await navigatorClient.decide(session) as { action?: { actionId?: string } };
        lastDecisionActionId = decided.action?.actionId;
        result = decided;
      } else if (cmd === "execute") {
        const actionId = args[0] ?? lastDecisionActionId ?? lastRankedActions[0]?.actionId;
        result = await navigatorClient.execute(session, actionId);
      } else if (cmd === "exec" && args[0]) {
        const action = args[0];
        let payload: Record<string, unknown> = {};
        if (args[1]) {
          payload = JSON.parse(args.slice(1).join(" ")) as Record<string, unknown>;
        }

        const sessionId = await ensureSession("offline");
        const execution = await client.execute(session, action, payload);
        await client.appendNavlog(sessionId, {
          type: "execution",
          timestamp: new Date().toISOString(),
          entityType: session.aggregateType,
          entityId: session.aggregateId,
          action,
          result: "success",
          httpStatus: 200
        });

        result = execution;
      } else if (cmd === "navlog") {
        const limit = args[0] ? Number(args[0]) : 50;
        result = await navigatorClient.getNavigatorEvents(session, Number.isFinite(limit) && limit > 0 ? limit : 50);
      } else if (cmd === "history") {
        const limit = args[0] ? Number(args[0]) : 50;
        result = await navigatorClient.getHistory(session, Number.isFinite(limit) && limit > 0 ? limit : 50);
      } else if (cmd === "next-steps") {
        const limit = args[0] ? Number(args[0]) : 6;
        result = await navigatorClient.nextSteps(session, Number.isFinite(limit) && limit > 0 ? limit : 6);
      } else if (cmd === "approvals") {
        const limit = args[0] ? Number(args[0]) : 50;
        const maybeStatus = args[1]?.toUpperCase();
        const status = maybeStatus && ["PENDING", "APPROVED", "REJECTED", "ESCALATED", "EXPIRED"].includes(maybeStatus)
          ? maybeStatus as "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED" | "EXPIRED"
          : undefined;
        result = await navigatorClient.listApprovals(session, Number.isFinite(limit) && limit > 0 ? limit : 50, status);
      } else if (cmd === "approval") {
        if (!args[0]) {
          result = "Usage: approval <approvalRequestId>";
        } else {
          result = await navigatorClient.getApproval(args[0]);
        }
      } else if (cmd === "approve" || cmd === "reject") {
        if (!session.actorId) {
          result = "Set actor first: set actor <actorId>";
        } else if (!args[0]) {
          result = `Usage: ${cmd} <approvalRequestId> [note]`;
        } else {
          result = await navigatorClient.resolveApproval({
            approvalRequestId: args[0],
            action: cmd,
            actorId: session.actorId,
            note: args.slice(1).join(" ") || undefined
          });
        }
      } else if (cmd === "escalate") {
        if (!session.actorId) {
          result = "Set actor first: set actor <actorId>";
        } else if (!args[0]) {
          result = "Usage: escalate <approvalRequestId> [tier] [note]";
        } else {
          const parsedTier = args[1] ? Number(args[1]) : undefined;
          const requiredTier = Number.isFinite(parsedTier) && (parsedTier as number) > 0 ? parsedTier : undefined;
          const noteStartIndex = requiredTier ? 2 : 1;
          result = await navigatorClient.resolveApproval({
            approvalRequestId: args[0],
            action: "escalate",
            actorId: session.actorId,
            requiredTier,
            note: args.slice(noteStartIndex).join(" ") || undefined
          });
        }
      } else if (cmd === "transcript") {
        if (!session.sessionId) {
          result = "No active session.";
        } else {
          result = await client.getTranscript(session.sessionId);
        }
      } else if (cmd === "events") {
        const limit = args[0] ? Number(args[0]) : 20;
        result = await client.events(session, Number.isFinite(limit) && limit > 0 ? limit : 20);
      } else {
        result = "Unknown command. Type 'help' for available commands.";
      }

      const rendered = render(result);
      output.write(`${rendered}\n`);
      if (session.sessionId) {
        await client.transcript(session.sessionId, line, rendered);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.write(`Error: ${message}\n`);
      try {
        if (session.sessionId) {
          await client.transcript(session.sessionId, line, `Error: ${message}`);
        }
      } catch {
        // Ignore transcript failures to keep REPL responsive.
      }
    }
  }
}

main().catch((error) => {
  console.error("Navigator REPL fatal error", error);
  process.exit(1);
});
