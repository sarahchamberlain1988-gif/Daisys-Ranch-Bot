# Daisy's Ranch Bot

Discord bot for ranch webhook reports. Its Application ID is already set to `1552627525237346434`.

## Set up

1. In the Discord Developer Portal, enable **Message Content Intent** under Bot.
2. Install the app in the server with `bot` and `applications.commands` scopes. Give it **View Channel**, **Read Message History**, and **Send Messages** access in each ranch webhook channel.
3. Use Node.js 20 or newer. Run `npm install` in this folder.
4. Set `DISCORD_TOKEN` as a private environment variable and run `npm start`. Never put the token in this source or send it in chat.
5. Anyone in a server where the bot is installed can run `/addranch name:Hanging Dog Ranch channel:<your webhook channel> ranch_id:52`, then `/refresh_ranch` to read existing messages. The person who added the ranch and members with Manage Server permission can refresh its history, add employee names, or remove it.
6. Run `/ranchstats` to see product totals and sales. Animal counts are omitted because slaughtering can change the herd without a sale webhook. `/ranches` lists connected ranches. `/employee` looks up one worker's recorded collection, purchases, and sales. `/addemployee` adds a worker before they appear in any recognised webhooks.
7. After paying an employee, run `/settleemployee` with **Pay handed out**. After handing out collected products, choose **Products handed out**. Choose **Both** if you handled both. The employee's matching figures reset; ranch totals stay intact. A later `/refresh_ranch` will preserve the settlement and only count employee events posted after it. Only the person who added the ranch or a server manager can settle an employee.
8. If `/employee` says None recorded, run `/checkranch` to see whether the bot can read the correct webhook channel and recognise its recent messages. Then run `/refresh_ranch` to import history; `/addemployee` alone creates an empty employee entry.

For Railway, deploy this folder as a Node service. Set `DISCORD_TOKEN` in Variables. Mount a persistent volume and set `RAILWAY_VOLUME_MOUNT_PATH` to its mount path. Without a volume, figures may reset when the service redeploys; `/refresh_ranch` can rebuild them from channel history.

## What the first version reads

- `Eggs Collected`, `Wool Sheared`, `Milk Collected`: uses the webhook's **ranch total**, not a running sum of collected amounts.
- Bought and Sold webhooks for cows, sheep, pigs, goats, and chickens use the same format as the supplied cattle screenshots. A sale records delivered animals, gross sale, seller cut, and ledger share. The animal change subtracts all animals sent on the drive, including any lost on the way.
- In-game names in those webhooks are collected as employees. Each worker's own collected amount is added across recorded events; their figure is separate from the webhook's overall ranch total.
- Each ranch uses a separate Discord channel. The in-game ranch ID, when supplied, also filters messages within that channel.

The report does not claim a live animal count because slaughtering is not covered by the purchase and sale webhooks. Sale ledger shares are per-event proceeds, not the ranch's current bank balance. Only purchases, sales, and product collection contribute to employee reports; chores are omitted.

The database is stored as `ranch_data.json` in `RAILWAY_VOLUME_MOUNT_PATH` or this folder. Replaying history skips duplicate message IDs. A refresh builds a fresh report from chronological history and replaces the previous figures only after reading succeeds. If `/refresh_ranch` reports Missing Access, grant the bot **View Channel** and **Read Message History** in that specific webhook channel, including any channel permission overrides.
