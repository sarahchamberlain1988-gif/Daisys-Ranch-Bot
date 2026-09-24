const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { parseEvent } = require('./parser');
const { keyFor: employeeKey, ensureEmployee, recordEmployee, settleEmployee } = require('./employee');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1552627525237346434';
if (!TOKEN) throw new Error('Set DISCORD_TOKEN before starting the bot.');
const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
fs.mkdirSync(dir, { recursive: true });
const dataPath = path.join(dir, 'ranch_data.json');
let db = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : { guilds: {} };
db.guilds ||= {};
function save() {
  const temp = dataPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(db, null, 2) + '\n');
  fs.renameSync(temp, dataPath);
}
function guild(id) { return db.guilds[id] ||= { ranches: {} }; }
function ranch(id, key) { return guild(id).ranches[key]; }
function fresh(name, channelId, ranchId = null, ownerId = null) {
  return { name, channelId, ranchId, products: {}, animals: {},
    ownerId, employees: {}, purchases: {}, sales: { count: 0, revenue: 0, sellerCut: 0, ledgerShare: 0 }, seen: {} };
}
function apply(store, event, messageId, timestamp) {
  if (!event || store.seen[messageId]) return false;
  if (store.ranchId && event.ranch.id !== store.ranchId) return false;
  if (!store.ranchId) store.ranchId = event.ranch.id;
  store.seen[messageId] = true;
  if (event.type === 'product') store.products[event.kind] = event.total;
  if (event.type === 'animal') {
    store.animals[event.kind] = (store.animals[event.kind] || 0) + event.delta;
    store.purchases[event.kind] = (store.purchases[event.kind] || 0) + event.delta;
  }
  if (event.type === 'sale') {
    store.animals[event.kind] = (store.animals[event.kind] || 0) - event.dispatched;
    store.sales.count += event.quantity;
    store.sales.revenue += event.revenue;
    store.sales.sellerCut += event.sellerCut;
    store.sales.ledgerShare += event.ledgerShare;
  }
  recordEmployee(store, event, timestamp);
  return true;
}
const admin = PermissionFlagsBits.ManageGuild;
const canManage = (i, store) => i.memberPermissions?.has(admin) || store.ownerId === i.user.id;
const choose = c => c.addStringOption(o => o.setName('ranch').setDescription('Choose a ranch')
  .setRequired(true).setAutocomplete(true));
const commands = [
  new SlashCommandBuilder().setName('addranch').setDescription('Connect one ranch webhook channel')
    .addStringOption(o => o.setName('name').setDescription('Ranch name').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Ranch webhook channel')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o => o.setName('ranch_id').setDescription('Optional in-game ranch number, for example 52')),
  choose(new SlashCommandBuilder().setName('removeranch').setDescription('Remove a ranch you added')),
  new SlashCommandBuilder().setName('ranches').setDescription('List connected ranches'),
  choose(new SlashCommandBuilder().setName('ranchstats').setDescription('Show product, animal, and sales figures')),
  choose(new SlashCommandBuilder().setName('refresh_ranch').setDescription('Rebuild figures from webhook history')),
  choose(new SlashCommandBuilder().setName('checkranch').setDescription('Check webhook access and parsing for a ranch')),
  choose(new SlashCommandBuilder().setName('addemployee').setDescription('Add a person to a ranch employee list'))
    .addStringOption(o => o.setName('name').setDescription('In-game name as it appears in webhooks').setRequired(true)),
  choose(new SlashCommandBuilder().setName('employee').setDescription('Show one employee’s ranch activity'))
    .addStringOption(o => o.setName('name').setDescription('Employee name').setRequired(true).setAutocomplete(true)),
  choose(new SlashCommandBuilder().setName('settleemployee').setDescription('Mark an employee’s pay or products as handled'))
    .addStringOption(o => o.setName('name').setDescription('Employee name').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('category').setDescription('What have you settled?').setRequired(true)
      .addChoices({ name: 'Products handed out', value: 'products' },
        { name: 'Pay handed out', value: 'pay' }, { name: 'Both', value: 'both' }))
].map(c => c.toJSON());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent] });
async function refresh(guildId, key) {
  const old = ranch(guildId, key);
  if (!old) throw new Error('Ranch not found.');
  let channel;
  try { channel = await client.channels.fetch(old.channelId); }
  catch (error) {
    if (error.code === 50001 || error.code === 50013 || error.code === 10003)
      throw new Error(`I cannot access <#${old.channelId}>. In that channel's Permissions, give Daisy's Ranch Bot View Channel and Read Message History, then try again.`);
    throw error;
  }
  if (!channel?.messages?.fetch) throw new Error('Cannot read the configured channel.');
  const permissions = channel.permissionsFor(client.user.id);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
    throw new Error(`I need View Channel and Read Message History in <#${old.channelId}>. Check that channel's permission overrides for Daisy's Ranch Bot.`);
  const messages = [];
  let before;
  for (;;) {
    let batch;
    try { batch = await channel.messages.fetch({ limit: 100, before }); }
    catch (error) {
      if (error.code === 50001 || error.code === 50013)
        throw new Error(`I cannot read messages in <#${old.channelId}>. Give Daisy's Ranch Bot View Channel and Read Message History there.`);
      throw error;
    }
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  const next = fresh(old.name, old.channelId, old.ranchId, old.ownerId);
  for (const person of Object.values(old.employees || {})) {
    ensureEmployee(next, person.name).cutoffs = { ...(person.cutoffs || {}) };
  }
  let accepted = 0;
  for (const msg of messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
    if (apply(next, parseEvent(msg), msg.id, msg.createdTimestamp)) accepted++;
  }
  guild(guildId).ranches[key] = next;
  save();
  return { scanned: messages.length, accepted };
}
client.once('ready', async () => {
  try {
    await new REST({ version: '10' }).setToken(TOKEN).put(Routes.applicationCommands(CLIENT_ID),
      { body: commands });
    console.log(`Daisy's Ranch Bot online as ${client.user.tag}; commands registered.`);
  } catch (error) { console.error('Command registration failed:', error); }
});
client.on('messageCreate', message => {
  if (!message.guildId || (!message.webhookId && !message.author?.bot)) return;
  const event = parseEvent(message);
  if (!event) return;
  for (const store of Object.values(guild(message.guildId).ranches)) {
    if (store.channelId === message.channelId && apply(store, event, message.id, message.createdTimestamp)) save();
  }
});
client.on('interactionCreate', async i => {
  try {
    if (i.isAutocomplete()) {
      const q = String(i.options.getFocused()).toLowerCase();
      if (i.options.getFocused(true).name === 'name') {
        const store = ranch(i.guildId, i.options.getString('ranch'));
        return await i.respond(Object.entries(store?.employees || {})
          .filter(([, p]) => p.name.toLowerCase().includes(q)).slice(0, 25)
          .map(([value, p]) => ({ name: p.name.slice(0, 100), value })));
      }
      return await i.respond(Object.entries(guild(i.guildId).ranches)
        .filter(([, r]) => r.name.toLowerCase().includes(q)).slice(0, 25)
        .map(([value, r]) => ({ name: r.name.slice(0, 100), value })));
    }
    if (!i.isChatInputCommand() || !i.inGuild()) return;
    const name = i.commandName;
    if (name === 'addranch') {
      const display = i.options.getString('name', true).trim();
      const channel = i.options.getChannel('channel', true);
      const id = i.options.getString('ranch_id')?.trim() || null;
      if (id && !/^\d+$/.test(id)) return await i.reply({ content: 'Ranch ID must be a number.', ephemeral: true });
      const key = id || display.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (ranch(i.guildId, key)) return await i.reply({ content: 'That ranch is already connected.', ephemeral: true });
      if (Object.values(guild(i.guildId).ranches).some(r => r.channelId === channel.id))
        return await i.reply({ content: 'That channel is already used by another ranch.', ephemeral: true });
      guild(i.guildId).ranches[key] = fresh(display, channel.id, id, i.user.id);
      save();
      return await i.reply({ content: `Connected **${display}** to ${channel}. Run /refresh_ranch to read its history.`, ephemeral: true });
    }
    if (name === 'ranches') {
      const list = Object.values(guild(i.guildId).ranches);
      return await i.reply({ content: list.length ? list.map(r => `• **${r.name}** — <#${r.channelId}>`).join('\n') : 'No ranches connected yet.' });
    }
    const key = i.options.getString('ranch', true);
    const store = ranch(i.guildId, key);
    if (!store) return await i.reply({ content: 'Ranch not found.', ephemeral: true });
    if (['removeranch', 'refresh_ranch', 'addemployee', 'settleemployee'].includes(name) && !canManage(i, store))
      return await i.reply({ content: 'Only the person who added this ranch or a server manager can do that.', ephemeral: true });
    if (name === 'removeranch') {
      delete guild(i.guildId).ranches[key]; save();
      return await i.reply({ content: `Removed **${store.name}** and its tracked data.`, ephemeral: true });
    }
    if (name === 'refresh_ranch') {
      await i.deferReply({ ephemeral: true });
      const result = await refresh(i.guildId, key);
      return await i.editReply(`Read ${result.scanned} messages; recognised ${result.accepted} ranch events.`);
    }
    if (name === 'checkranch') {
      await i.deferReply({ ephemeral: true });
      let channel;
      try { channel = await client.channels.fetch(store.channelId); }
      catch (error) {
        if (error.code === 50001 || error.code === 50013 || error.code === 10003)
          return await i.editReply(`I cannot access <#${store.channelId}>. Check View Channel and Read Message History for the bot in that channel.`);
        throw error;
      }
      const permissions = channel.permissionsFor(client.user.id);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
        return await i.editReply(`I need View Channel and Read Message History in <#${store.channelId}>.`);
      let messages;
      try { messages = await channel.messages.fetch({ limit: 100 }); }
      catch (error) {
        if (error.code === 50001 || error.code === 50013)
          return await i.editReply(`Discord denied message history in <#${store.channelId}>. Give the bot View Channel and Read Message History there.`);
        throw error;
      }
      const events = [...messages.values()].map(m => ({ event: parseEvent(m), title: m.embeds?.[0]?.title || '(no embed title)' }));
      const recognised = events.filter(e => e.event);
      const matching = recognised.filter(e => !store.ranchId || e.event.ranch.id === store.ranchId);
      const sample = events.find(e => e.title !== '(no embed title)')?.title || 'None';
      return await i.editReply(`Channel: <#${store.channelId}> · Ranch ID filter: ${store.ranchId || 'auto'}\n` +
        `Last ${messages.size} messages: ${recognised.length} recognised ranch events, ${matching.length} matched this ranch.\n` +
        `Example embed title: ${sample}\nStored employee names: ${Object.keys(store.employees || {}).length}. ` +
        `Use /refresh_ranch to import older events after permissions are fixed.`);
    }
    if (name === 'addemployee') {
      const employeeName = i.options.getString('name', true).trim();
      if (!/^[\p{L}\p{M}\p{N} .'-]{2,80}$/u.test(employeeName))
        return await i.reply({ content: 'Enter an in-game name between 2 and 80 characters.', ephemeral: true });
      const already = Boolean(store.employees?.[employeeKey(employeeName)]);
      ensureEmployee(store, employeeName); save();
      return await i.reply({ content: already ? 'That employee is already listed.' : `Added **${employeeName}** to **${store.name}**.`, ephemeral: true });
    }
    if (name === 'settleemployee') {
      const person = store.employees?.[employeeKey(i.options.getString('name', true))];
      if (!person) return await i.reply({ content: 'Employee not found. Use /employee to check the name.', ephemeral: true });
      const category = i.options.getString('category', true);
      settleEmployee(person, category);
      save();
      return await i.reply({ content: `Marked **${person.name}**'s **${category}** as settled. New matching webhooks will count from now on; /refresh_ranch will keep this cutoff.`, ephemeral: true });
    }
    if (name === 'employee') {
      const lookup = employeeKey(i.options.getString('name', true));
      const person = store.employees?.[lookup];
      if (!person) return await i.reply({ content: 'No matching employee yet. Use /addemployee or /refresh_ranch to discover names in the webhook history.', ephemeral: true });
      const line = entries => Object.entries(entries || {}).map(([k, v]) => `${k}: **${v}**`).join('\n') || 'None recorded';
      return await i.reply({ embeds: [new EmbedBuilder().setTitle(`${person.name} — ${store.name}`)
        .setColor(0x71895b).addFields(
          { name: 'Products collected', value: line(person.collected) },
          { name: 'Animals bought', value: line(person.bought) },
          { name: 'Animals delivered in sales', value: line(person.sold) },
          { name: 'Recorded sale figures', value: `Gross: $${person.saleRevenue} · Seller cuts: $${person.sellerCut}` })
        .setFooter({ text: 'Products and sale figures are since their last respective settlement; purchases are all recorded history.' })] });
    }
    if (name === 'ranchstats') {
      const products = Object.entries(store.products).map(([k, v]) => `${k}: **${v}**`).join('\n') || 'No product totals yet';
      const sales = store.sales;
      return await i.reply({ embeds: [new EmbedBuilder().setTitle(`${store.name} — Ranch Report`)
        .setColor(0x71895b).addFields(
          { name: 'Products (latest ranch totals)', value: products },
          { name: 'Animal sales seen', value: `${sales.count} sold · $${sales.revenue} total\nSeller cuts: $${sales.sellerCut} · Ledger shares: $${sales.ledgerShare}` })
        .setFooter({ text: 'Sales figures come from recognised ranch webhooks.' })] });
    }
  } catch (error) {
    console.error(error);
    const response = { content: `Could not complete that command: ${error.message}`, ephemeral: true };
    if (i.deferred) await i.editReply(response);
    else if (!i.replied) await i.reply(response);
  }
});
client.login(TOKEN);
