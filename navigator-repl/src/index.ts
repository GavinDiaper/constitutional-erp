import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { NavigatorClient } from "./client/navigatorClient";
import { loadConfig } from "./config/env";
import { render } from "./format/renderer";
import { contextString, SessionContext } from "./state/session";

function printHelp() {
  output.write([
    "Commands:",
    "  set actor <actorId>",
    "  use <domain> <aggregateType> <id>",
    "  show",
    "  propose",
    "  explain [actionId]",
    "  simulate <actionId>",
    "  decide",
    "  execute [actionId]",
    "  history",
    "  navlog",
    "  replay",
    "  context",
    "  help",
    "  quit|exit"
  ].join("\n") + "\n");
}

async function main() {
  const config = loadConfig();
  const client = new NavigatorClient(config);
  const rl = createInterface({ input, output, terminal: true });
  const session: SessionContext = {};

  output.write("Navigator REPL v1\n");
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

      if (cmd === "context") {
        result = contextString(session);
      } else if (cmd === "set" && args[0] === "actor" && args[1]) {
        session.actorId = args[1];
        result = `actor set to ${session.actorId}`;
      } else if (cmd === "use" && args.length >= 3) {
        session.domain = args[0].toUpperCase() as SessionContext["domain"];
        session.aggregateType = args[1];
        session.aggregateId = args[2];
        result = contextString(session);
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
        result = "Unknown command. Type 'help'.";
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
