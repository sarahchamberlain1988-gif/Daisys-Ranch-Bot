# Daisy's Ranch Bot

Discord bot for ranch webhook reports. Its Application ID is already set to `1552627525237346434`.

## Set up

1. In the Discord Developer Portal, enable **Message Content Intent** under Bot.
2. Install the app in the server with `bot` and `applications.commands` scopes. Give it **View Channel**, **Read Message History**, and **Send Messages** access in each ranch webhook channel.
3. Use Node.js 20 or newer. Run `npm install` in this folder.
4. Set `DISCORD_TOKEN` as a private environment variable and run `npm start`. Never put the token in this source or send it in chat.
5. Anyone in a server where the bot is installed can run `/addranch name:Hanging Dog Ranch channel:<your webhook channel> ranch_id:52`, then `/refresh_ranch` to read existing messages. The person who added the ranch is its bot owner. They can appoint additional managers with `/addmanager` and revoke them with `/removemanager`.
6. `/ranchstats` shows product totals only. `/employee` shows one worker's collection, animal purchases, and deliveries without money. `/ranches` lists connected ranches. `/addemployee` adds a worker before they appear in recognised webhooks.
7. `/ranchmoney` and `/employeemoney` show recorded sale amounts privately, only to the ranch owner and appointed managers. Server administrators do not automatically receive financial access. These commands use private Discord responses, visible only to the person who ran them. Restrict the underlying webhook channel to managers too if its messages contain private amounts.
8. After paying an employee, run `/settleemployee` with **Pay handed out**. After handing out collected products, choose **Products handed out**. Choose **Both** if you handled both. The employee's matching figures reset; ranch totals stay intact. A later `/refresh_ranch` will preserve the settlement and only count employee events posted after it. Ranch owners, appointed managers, and server managers can settle an employee.
9. If `/employee` says None recorded, run `/checkranch` to see whether the bot can read the correct webhook channel and recognise its recent messages. Then run `/refresh_ranch` to import history; `/addemployee` alone creates an empty employee entry.

For Railway, deploy this folder as a Node service. Set `DISCORD_TOKEN` in Variables and attach a persistent volume mounted at `/data`. Railway supplies `RAILWAY_VOLUME_MOUNT_PATH` automatically. Without a volume, figures may reset when the service redeploys; `/refresh_ranch` can rebuild webhook history but cannot restore settlement cutoffs.

## What the first version reads

- `Eggs Collected`, `Wool Sheared`, `Milk Collected`: uses the webhook's **ranch total**, not a running sum of collected amounts.
- Bought and Sold webhooks for cows, sheep, pigs, goats, and chickens use the same format as the supplied cattle screenshots. A sale records delivered animals, gross sale, seller cut, and ledger share. The animal change subtracts all animals sent on the drive, including any lost on the way.
- In-game names in those webhooks are collected as employees. Each worker's own collected amount is added across recorded events; their figure is separate from the webhook's overall ranch total.
- Each ranch uses a separate Discord channel. The in-game ranch ID, when supplied, also filters messages within that channel.

The public report does not show animal counts or sales. Slaughtering is not covered by the purchase and sale webhooks. Private manager reports show sale proceeds, not the ranch's current bank balance. Only purchases, sales, and product collection contribute to employee reports; chores are omitted.

The database is stored as `ranch_data.json` in `RAILWAY_VOLUME_MOUNT_PATH` or this folder. Replaying history skips duplicate message IDs. A refresh builds a fresh report from chronological history and replaces the previous figures only after reading succeeds. If `/refresh_ranch` reports Missing Access, grant the bot **View Channel** and **Read Message History** in that specific webhook channel, including any channel permission overrides.
