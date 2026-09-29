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

## Google Sheets wage ledger

1. Create a private Google Sheet with `Wages`, `Rates`, and `Events` tabs, using the column headings and formulas in the setup conversation. The attached Apps Script web app must return the exact text `recorded` or `already recorded` for successful writes.
2. In Railway Variables set `GOOGLE_SCRIPT_URL` to the deployed Apps Script web app URL ending in `/exec`, `GOOGLE_SCRIPT_SECRET` to the matching `BOT_SECRET` script property, and `GOOGLE_SCRIPT_RANCH_ID` to the in-game ranch number (for example `52`). Never put the URL or secret in GitHub or a Discord command. Only the ranch with this exact ID is forwarded; other ranches remain independent. No Google service account is needed.
3. Redeploy the bot. Run `/refresh_ranch` for that ranch to rebuild its event history, then `/syncsheet` to retry any events not yet confirmed by the sheet.
4. New milk, eggs, wool and animal sale webhooks are sent to `Events`. The sheet uses the per-item rates in `Rates`: milk $3, eggs $1.50, wool $4 for employees. A sale's wage is the webhook **ledger** amount less five times that animal's replacement cost, even if fewer than five were delivered. Negative sale results carry against other earnings; `Pay due` stops at zero. The ranch product share and ledger amount are visible in `Events` to sheet editors.
5. A ranch owner or appointed manager can use `/keepstock ranch:<ranch> name:<employee> product:<milk|eggs|wool> quantity:<number>` when collected products are kept. The sheet deducts the employee rate for that quantity. Animal purchases, slaughter and chores never enter this wage sheet.
6. When paying an employee, use `/settleemployee` with **Pay handed out** or **Both** and enter `amount`. This records the payment and resets the bot's employee lookup cutoff. A products-only settlement still resets the product lookup; use `/keepstock` to deduct products retained instead of cash wages. The sheet preserves all events and payments as an audit trail.

Each webhook message and manager action has a unique Event ID. `/refresh_ranch` preserves manual entries and settlement cutoffs. The Apps Script checks IDs before writing, so refreshing or retrying does not add the same wage twice. The bot keeps unsynced events on its Railway volume; a failed connection can be retried with `/syncsheet`. Do not delete rows or edit Event IDs in the sheet. Add employee names to the `Wages` tab as they appear. Rates are editable, so changing them recalculates historical wages too—finish a pay period before altering rates, or make a new sheet for a new rate period.

## What the first version reads

- `Eggs Collected`, `Wool Sheared`, `Milk Collected`: uses the webhook's **ranch total**, not a running sum of collected amounts.
- Bought and Sold webhooks for cows, sheep, pigs, goats, and chickens use the same format as the supplied cattle screenshots. A sale records delivered animals, gross sale, seller cut, and ledger share. The animal change subtracts all animals sent on the drive, including any lost on the way.
- In-game names in those webhooks are collected as employees. Each worker's own collected amount is added across recorded events; their figure is separate from the webhook's overall ranch total.
- Each ranch uses a separate Discord channel. The in-game ranch ID, when supplied, also filters messages within that channel.

The public report does not show animal counts or sales. Slaughtering is not covered by the purchase and sale webhooks. Private manager reports show sale proceeds, not the ranch's current bank balance. Only purchases, sales, and product collection contribute to employee reports; chores are omitted.

The database is stored as `ranch_data.json` in `RAILWAY_VOLUME_MOUNT_PATH` or this folder. Replaying history skips duplicate message IDs. A refresh builds a fresh report from chronological history and replaces the previous figures only after reading succeeds. If `/refresh_ranch` reports Missing Access, grant the bot **View Channel** and **Read Message History** in that specific webhook channel, including any channel permission overrides.
