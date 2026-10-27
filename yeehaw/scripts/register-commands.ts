// Register the bot's slash commands on the club's server.
//   npm run discord:register
// Guild commands appear immediately (global ones can take an hour). Safe to
// re-run: PUT replaces the whole set.

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error("Set DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID in .env first.");
  process.exit(1);
}

const commands = [
  { name: "fixtures", description: "Upcoming matches and events", type: 1 },
  { name: "squad", description: "Link to the squad page", type: 1 },
];

async function main() {
  const res = await fetch(
    `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`,
    {
      method: "PUT",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    },
  );
  if (!res.ok) {
    console.error(`Discord returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Registered: ${commands.map((c) => "/" + c.name).join(", ")}`);
}

main();
