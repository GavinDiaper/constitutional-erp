import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
    "=== Navigator REPL Commands ===\n",
    "Setup Commands:",
    "  set actor <actorId>          Set the actor/user making decisions",
    "  use <domain> <type> <id>     Set business context (manual entry)",
    "  use                          Set business context (interactive menu)",
    "",
    "Decision Commands:",
    "  propose                      Generate ranked action proposals",
    "  explain [actionId]           Explain reasoning for an action",
    "  simulate <actionId>          Simulate action outcomes",
    "  decide                       Recommend optimal decision",
    "  execute [actionId]           Execute chosen action",
    "",
    "History & Learning:",
    "  history                      Show previous decisions",
    "  navlog                       Show navigation decision log",
    "  replay                       Replay navigation sequences",
    "",
    "Utilities:",
    "  show                         Display current context",
    "  context                      Show detailed context",
    "  domains                      List available domains & types",
    "  help                         Print this help",
    "  quit|exit                    Close REPL",
    ""
  ].join("\n") + "\n");
}

async function main() {
  const config = loadConfig();
  const client = new NavigatorClient(config);
  const rl = createInterface({ input, output, terminal: true });
  const session: SessionContext = {};

  output.write("\n╔════════════════════════════════╗\n");
  output.write("║    Navigator REPL v1           ║\n");
  output.write("║  Constitutional ERP Decision   ║\n");
  output.write("║          Engine                ║\n");
  output.write("╚════════════════════════════════╝\n\n");
  
  printHelp();

  while (true) {
    const line = (await rl.question("navigator> ")).trim();
    if (!line) {
      continue;
    }

    const [cmd, ...args] = line.split(/\s+/);

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
            await client.transcript(session.actorId, line, rendered);
            continue;
          }

          if (!isSupportedAggregateType(domain, args[1])) {
            const supported = getSupportedAggregateTypes(domain).join(", ");
            result = `Unsupported aggregate type '${args[1]}' for ${domain}. Supported types: ${supported}`;
            const rendered = render(result);
            output.write(`${rendered}\n`);
            await client.transcript(session.actorId, line, rendered);
            continue;
          }

          session.domain = domain as Domain;
          session.aggregateType = args[1].toLowerCase();
          session.aggregateId = args[2];
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
          result = contextString(session);
        }
      } else if (cmd === "show") {
        result = await client.show(session);
      } else if (cmd === "propose") {
        result = await client.propose(session);
      } else if (cmd === "explain") {
        result = await client.explain(session, args[0]);
      } else if (cmd === "simulate" && args[0]) {
        result = await client.simulate(session, args[0]);
      } else if (cmd === "decide") {
        result = await client.decide(session);
      } else if (cmd === "execute") {
        result = await client.execute(session, args[0]);
      } else if (cmd === "history") {
        result = await client.history(session);
      } else if (cmd === "navlog") {
        result = await client.navlog(session);
      } else if (cmd === "replay") {
        result = await client.history(session);
      } else {
        result = "Unknown command. Type 'help' for available commands.";
      }

      const rendered = render(result);
      output.write(`${rendered}\n`);
      await client.transcript(session.actorId, line, rendered);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.write(`Error: ${message}\n`);
      try {
        await client.transcript(session.actorId, line, `Error: ${message}`);
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
